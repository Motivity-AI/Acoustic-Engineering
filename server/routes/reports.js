/* ============================================================
   Acoustic Engineering — server/routes/reports.js v1.1.0
   ============================================================ */
"use strict";

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const db = require("../database");
const { requireLogin, requireAdmin, logActivity } = require("../auth");

/* ═══════════════ تحميل pdfReport بأمان ═══════════════ */
let generatePDFReport = null;
try {
    const pdfModule = require("../engine/pdfReport");
    if (typeof pdfModule.generatePDFReport === "function") {
        generatePDFReport = pdfModule.generatePDFReport;
    }
} catch (err) {
    console.warn("[reports] pdfReport module غير متوفر:", err.message);
}

/* ═══════════════ المجلد ═══════════════ */
const REPORTS = path.join(__dirname, "..", "..", "reports");
if (!fs.existsSync(REPORTS)) {
    fs.mkdirSync(REPORTS, { recursive: true });
}

/* ═══════════════ Rate Limiters ═══════════════ */

// توليد PDF مكلف جداً — حدّ صارم
const generateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,      // 15 دقيقة
    max: 10,                        // 10 تقارير
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "تجاوزت حد إنشاء التقارير. حاول بعد 15 دقيقة."
    }
});

const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "طلبات كثيرة." }
});

/* ═══════════════ ثوابت ═══════════════ */
const MAX_SPEAKERS = 500;
const MAX_ANALYSIS_POINTS = 10000;
const MAX_ROOM_FIELDS = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024;   // 50 MB (PDF كبير مقبول)
const REPORT_TTL_DAYS = 90;                // حذف التقارير الأقدم من 90 يوماً

/* ═══════════════ Helpers ═══════════════ */

/**
 * تحقق من شكل حمولة التقرير
 * @returns {Array<string>} مصفوفة أخطاء
 */
function validateReportPayload(body) {
    const errors = [];

    /* ─── projectId ─── */
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId) || projectId < 1) {
        errors.push("معرّف المشروع غير صالح");
    }

    /* ─── room ─── */
    if (body.room !== undefined) {
        if (typeof body.room !== "object" || body.room === null || Array.isArray(body.room)) {
            errors.push("بيانات الفراغ يجب أن تكون كائناً");
        } else {
            const roomKeys = Object.keys(body.room);
            if (roomKeys.length > MAX_ROOM_FIELDS) {
                errors.push(`عدد حقول الفراغ يتجاوز ${MAX_ROOM_FIELDS}`);
            }
        }
    }

    /* ─── speakers ─── */
    if (body.speakers !== undefined) {
        if (!Array.isArray(body.speakers)) {
            errors.push("قائمة السماعات يجب أن تكون مصفوفة");
        } else if (body.speakers.length > MAX_SPEAKERS) {
            errors.push(`عدد السماعات يتجاوز ${MAX_SPEAKERS}`);
        }
    }

    /* ─── analysis ─── */
    if (body.analysis !== undefined) {
        if (typeof body.analysis !== "object" || body.analysis === null) {
            errors.push("بيانات التحليل غير صالحة");
        } else if (Array.isArray(body.analysis.points)
                && body.analysis.points.length > MAX_ANALYSIS_POINTS) {
            errors.push(`عدد نقاط التحليل يتجاوز ${MAX_ANALYSIS_POINTS}`);
        }
    }

    /* ─── design ─── */
    if (body.design !== undefined && body.design !== null) {
        if (typeof body.design !== "object" || Array.isArray(body.design)) {
            errors.push("بيانات التصميم غير صالحة");
        }
    }

    return errors;
}

/**
 * اسم ملف آمن مع جزء عشوائي (منع التخمين)
 */
function generateSafeFileName(projectId) {
    const stamp = Date.now();
    const random = crypto.randomBytes(6).toString("hex");
    return `AE-Report-${projectId}-${stamp}-${random}.pdf`;
}

/**
 * تأكد أن المسار داخل REPORTS (منع Path Traversal)
 */
function isInsideReports(filePath) {
    const resolved = path.resolve(filePath);
    const base = path.resolve(REPORTS);
    return resolved.startsWith(base + path.sep) || resolved === base;
}

/**
 * قراءة آمنة لحجم ملف
 */
function safeStat(filePath) {
    try {
        if (!isInsideReports(filePath)) return null;
        if (!fs.existsSync(filePath)) return null;
        return fs.statSync(filePath);
    } catch {
        return null;
    }
}

/**
 * تنسيق بايت إلى نص مقروء
 */
function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${Math.round(n * 10) / 10} ${units[i]}`;
}

/**
 * حذف ملف تقرير من القرص
 */
function deleteReportFile(fileName) {
    if (!fileName) return false;

    // منع Path Traversal
    if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
        console.warn("[reports] محاولة حذف مريبة:", fileName);
        return false;
    }

    try {
        const fullPath = path.join(REPORTS, fileName);
        if (!isInsideReports(fullPath)) return false;

        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }
    } catch (err) {
        console.warn("[reports] فشل حذف الملف:", err.message);
    }
    return false;
}

/* ═══════════════ POST /api/reports/generate ═══════════════ */
router.post("/generate", requireLogin, generateLimiter, async (req, res) => {
    let outputPath = null;
    let createdReportId = null;

    try {
        /* ─── تحقق من الوحدة ─── */
        if (!generatePDFReport) {
            return res.status(503).json({
                success: false,
                message: "خدمة توليد PDF غير متوفرة حالياً"
            });
        }

        /* ─── تحقق من المدخلات ─── */
        const errors = validateReportPayload(req.body);
        if (errors.length) {
            return res.status(400).json({
                success: false,
                message: "بيانات غير صالحة",
                errors
            });
        }

        const projectId = Number(req.body.projectId);

        /* ─── تحقق من ملكية المشروع ─── */
        const project = db.prepare(`
            SELECT id, name, user_id
            FROM projects
            WHERE id = ? AND user_id = ?
        `).get(projectId, req.session.user.id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "المشروع غير موجود أو ليس لديك صلاحية"
            });
        }

        /* ─── ولّد اسم ملف آمن ─── */
        const fileName = generateSafeFileName(project.id);
        outputPath = path.join(REPORTS, fileName);

        // تحقق نهائي
        if (!isInsideReports(outputPath)) {
            return res.status(500).json({
                success: false,
                message: "خطأ داخلي في مسار التقرير"
            });
        }

        /* ─── توليد PDF ─── */
        await generatePDFReport({
            project,
            user: req.session.user,
            room:     req.body.room || {},
            speakers: req.body.speakers || [],
            analysis: req.body.analysis || {},
            design:   req.body.design || {},
            outputPath
        });

        /* ─── تحقق من الملف ─── */
        if (!fs.existsSync(outputPath)) {
            throw new Error("لم يتم إنشاء ملف PDF");
        }

        const stats = fs.statSync(outputPath);

        if (stats.size === 0) {
            fs.unlinkSync(outputPath);
            throw new Error("ملف PDF فارغ");
        }

        if (stats.size > MAX_FILE_SIZE) {
            fs.unlinkSync(outputPath);
            return res.status(413).json({
                success: false,
                message: "حجم التقرير كبير جداً"
            });
        }

        /* ─── سجّل في DB ─── */
        const insertResult = db.prepare(`
            INSERT INTO reports
                (project_id, user_id, file_name, file_size, mime_type)
            VALUES (?, ?, ?, ?, 'application/pdf')
        `).run(
            project.id,
            req.session.user.id,
            fileName,
            stats.size
        );

        createdReportId = insertResult.lastInsertRowid;

        /* ─── سجل النشاط ─── */
        logActivity(
            req.session.user.id,
            "report.create",
            `إنشاء تقرير: ${project.name}`,
            {
                report_id: createdReportId,
                project_id: project.id,
                file_size: stats.size
            },
            req
        );

        /* ─── الرد ─── */
        res.json({
            success: true,
            report: {
                id: createdReportId,
                fileName,
                fileUrl: `/api/reports/${createdReportId}/download`,
                size: stats.size,
                sizeText: formatBytes(stats.size),
                createdAt: new Date().toISOString()
            }
        });

    } catch (err) {
        /* ─── تنظيف عند الفشل ─── */
        console.error("[reports] generate error:", err);

        if (outputPath && fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
        }

        if (createdReportId) {
            try {
                db.prepare("DELETE FROM reports WHERE id = ?").run(createdReportId);
            } catch { /* ignore */ }
        }

        /* ⚠️ لا تكشف تفاصيل الخطأ */
        res.status(500).json({
            success: false,
            message: "تعذّر إنشاء التقرير. حاول مجدداً."
        });
    }
});

/* ═══════════════ GET /api/reports ═══════════════ */
router.get("/", requireLogin, readLimiter, (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const projectFilter = req.query.project_id
            ? Number(req.query.project_id)
            : null;

        const conditions = ["r.user_id = ?"];
        const params = [req.session.user.id];

        if (Number.isInteger(projectFilter) && projectFilter > 0) {
            conditions.push("r.project_id = ?");
            params.push(projectFilter);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");

        const total = db.prepare(
            `SELECT COUNT(*) AS c FROM reports r ${whereClause}`
        ).get(...params).c;

        const reports = db.prepare(`
            SELECT r.id, r.project_id, r.file_name, r.file_size,
                   r.mime_type, r.created_at,
                   p.name AS project_name
            FROM reports r
            JOIN projects p ON p.id = r.project_id
            ${whereClause}
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        /* ─── إثراء بمعلومات إضافية ─── */
        const enriched = reports.map(r => {
            const fileExists = safeStat(path.join(REPORTS, r.file_name)) !== null;
            return {
                id: r.id,
                projectId: r.project_id,
                projectName: r.project_name,
                fileName: r.file_name,
                size: r.file_size,
                sizeText: formatBytes(r.file_size),
                mimeType: r.mime_type || "application/pdf",
                createdAt: r.created_at,
                available: fileExists,
                downloadUrl: fileExists ? `/api/reports/${r.id}/download` : null
            };
        });

        res.json({
            success: true,
            reports: enriched,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit) || 1,
                has_next: offset + limit < total,
                has_prev: page > 1
            }
        });

    } catch (err) {
        console.error("[reports] list error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر جلب التقارير"
        });
    }
});

/* ═══════════════ GET /api/reports/all (admin) ═══════════════ */
router.get("/all", requireLogin, requireAdmin, readLimiter, (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        const total = db.prepare("SELECT COUNT(*) AS c FROM reports").get().c;

        const reports = db.prepare(`
            SELECT r.id, r.project_id, r.user_id, r.file_name, r.file_size,
                   r.mime_type, r.created_at,
                   p.name AS project_name,
                   u.name AS user_name,
                   u.email AS user_email
            FROM reports r
            JOIN projects p ON p.id = r.project_id
            JOIN users u ON u.id = r.user_id
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        const enriched = reports.map(r => ({
            id: r.id,
            projectId: r.project_id,
            projectName: r.project_name,
            userId: r.user_id,
            userName: r.user_name,
            userEmail: r.user_email,
            fileName: r.file_name,
            size: r.file_size,
            sizeText: formatBytes(r.file_size),
            mimeType: r.mime_type || "application/pdf",
            createdAt: r.created_at
        }));

        res.json({
            success: true,
            reports: enriched,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit) || 1
            }
        });

    } catch (err) {
        console.error("[reports] list-all error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر جلب التقارير"
        });
    }
});

/* ═══════════════ GET /api/reports/:id/download ═══════════════
   تحميل آمن عبر ID (يتحقق من الصلاحيات)
   ═══════════════════════════════════════════════════════════════ */
router.get("/:id/download", requireLogin, readLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({
                success: false,
                message: "معرّف غير صالح"
            });
        }

        /* ─── اجلب التقرير + تحقق من الملكية ─── */
        const report = db.prepare(`
            SELECT r.*, p.name AS project_name
            FROM reports r
            JOIN projects p ON p.id = r.project_id
            WHERE r.id = ?
        `).get(id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "التقرير غير موجود"
            });
        }

        const isOwner = report.user_id === req.session.user.id;
        const isAdmin = ["admin", "owner"].includes(req.session.user.role);

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "ليس لديك صلاحية الوصول لهذا التقرير"
            });
        }

        /* ─── تحقق من الملف ─── */
        const fileName = path.basename(report.file_name);
        const fullPath = path.join(REPORTS, fileName);

        if (!isInsideReports(fullPath)) {
            return res.status(400).json({
                success: false,
                message: "مسار ملف غير صالح"
            });
        }

        if (!fs.existsSync(fullPath)) {
            return res.status(410).json({
                success: false,
                message: "ملف التقرير لم يعد متوفراً"
            });
        }

        /* ─── headers آمنة ─── */
        const safeName = `AE-Report-${report.project_id}.pdf`;

        res.setHeader("Content-Type", report.mime_type || "application/pdf");
        res.setHeader("Content-Disposition",
            `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setHeader("X-Content-Type-Options", "nosniff");

        /* ─── سجّل التحميل (اختياري) ─── */
        logActivity(
            req.session.user.id,
            "report.download",
            `تحميل تقرير: ${report.project_name}`,
            { report_id: id },
            req
        );

        /* ─── أرسل الملف ─── */
        res.sendFile(fullPath);

    } catch (err) {
        console.error("[reports] download error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر تحميل التقرير"
        });
    }
});

/* ═══════════════ GET /api/reports/:id (metadata) ═══════════════ */
router.get("/:id", requireLogin, readLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ success: false, message: "معرّف غير صالح" });
        }

        const report = db.prepare(`
            SELECT r.id, r.project_id, r.user_id, r.file_name, r.file_size,
                   r.mime_type, r.created_at,
                   p.name AS project_name
            FROM reports r
            JOIN projects p ON p.id = r.project_id
            WHERE r.id = ?
        `).get(id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "التقرير غير موجود"
            });
        }

        const isOwner = report.user_id === req.session.user.id;
        const isAdmin = ["admin", "owner"].includes(req.session.user.role);

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "ليس لديك صلاحية"
            });
        }

        const exists = safeStat(path.join(REPORTS, report.file_name)) !== null;

        res.json({
            success: true,
            report: {
                id: report.id,
                projectId: report.project_id,
                projectName: report.project_name,
                fileName: report.file_name,
                size: report.file_size,
                sizeText: formatBytes(report.file_size),
                mimeType: report.mime_type || "application/pdf",
                createdAt: report.created_at,
                available: exists,
                downloadUrl: exists ? `/api/reports/${report.id}/download` : null
            }
        });

    } catch (err) {
        console.error("[reports] get error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر جلب التقرير"
        });
    }
});

/* ═══════════════ DELETE /api/reports/:id ═══════════════ */
router.delete("/:id", requireLogin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ success: false, message: "معرّف غير صالح" });
        }

        const report = db.prepare(
            "SELECT * FROM reports WHERE id = ?"
        ).get(id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "التقرير غير موجود"
            });
        }

        const isOwner = report.user_id === req.session.user.id;
        const isAdmin = ["admin", "owner"].includes(req.session.user.role);

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "ليس لديك صلاحية الحذف"
            });
        }

        /* ─── احذف الملف ─── */
        const fileDeleted = deleteReportFile(report.file_name);

        /* ─── احذف السجل ─── */
        db.prepare("DELETE FROM reports WHERE id = ?").run(id);

        logActivity(
            req.session.user.id,
            "report.delete",
            `حذف تقرير #${id}`,
            { report_id: id, file_deleted: fileDeleted },
            req
        );

        res.json({
            success: true,
            message: "تم حذف التقرير",
            fileDeleted
        });

    } catch (err) {
        console.error("[reports] delete error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر حذف التقرير"
        });
    }
});

/* ═══════════════ Cleanup Helper (يُنظَّف دورياً) ═══════════════ */
function cleanupOldReports(daysOld = REPORT_TTL_DAYS) {
    try {
        const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
            .toISOString();

        const oldReports = db.prepare(`
            SELECT id, file_name FROM reports
            WHERE created_at < ?
        `).all(cutoff);

        let deletedCount = 0;
        const transaction = db.transaction(() => {
            for (const r of oldReports) {
                deleteReportFile(r.file_name);
                db.prepare("DELETE FROM reports WHERE id = ?").run(r.id);
                deletedCount++;
            }
        });

        transaction();
        return deletedCount;
    } catch (err) {
        console.error("[reports] cleanup error:", err);
        return 0;
    }
}

module.exports = router;
module.exports.cleanupOldReports = cleanupOldReports;
