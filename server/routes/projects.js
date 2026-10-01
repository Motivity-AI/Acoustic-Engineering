/* ============================================================
   Acoustic Engineering — server/routes/projects.js v1.1.0
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

/* ═══════════════ ثوابت ═══════════════ */
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_PROJECT_DATA_BYTES = 1 * 1024 * 1024;      // 1 MB
const MAX_ROOM_DIMENSION = 1000;                     // متر
const MIN_ROOM_DIMENSION = 0.5;
const MAX_SPEAKERS_IN_DATA = 500;

const ALLOWED_PROJECT_TYPES = [
    "general", "hotel", "garden", "meeting", "banquet",
    "gym", "office", "theater", "stadium", "mosque", "custom"
];

const ALLOWED_DESIGN_MODES = ["manual", "assisted", "auto"];

/* ═══════════════ Rate Limiters ═══════════════ */
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "عمليات كتابة كثيرة، حاول بعد قليل." }
});

const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "طلبات كثيرة، حاول بعد قليل." }
});

/* ═══════════════ Helpers ═══════════════ */

/**
 * تحقق من رقم داخل نطاق
 */
function safeNumber(value, { min = -Infinity, max = Infinity, def = 0 } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
}

/**
 * حساب بيانات الفراغ بأمان
 */
function calculateRoom(w, l, h) {
    const W = safeNumber(w, { min: MIN_ROOM_DIMENSION, max: MAX_ROOM_DIMENSION, def: 0 });
    const L = safeNumber(l, { min: MIN_ROOM_DIMENSION, max: MAX_ROOM_DIMENSION, def: 0 });
    const H = safeNumber(h, { min: MIN_ROOM_DIMENSION, max: MAX_ROOM_DIMENSION, def: 0 });

    // تقريب لتفادي أرقام عشرية طويلة
    const round = (n) => Math.round(n * 100) / 100;

    return {
        width:  round(W),
        length: round(L),
        height: round(H),
        area:   round(W * L),
        volume: round(W * L * H)
    };
}

/**
 * توليد UID آمن تشفيرياً
 */
function generateProjectUID() {
    return "p_" + crypto.randomBytes(10).toString("base64url");
}

/**
 * تحقق من حمولة المشروع
 * @returns {Array<string>} مصفوفة أخطاء (فارغة إذا سليم)
 */
function validateProjectPayload(body, { partial = false } = {}) {
    const errors = [];

    /* ─── الاسم ─── */
    if (!partial || body.name !== undefined) {
        const name = String(body.name || "").trim();
        if (!name) {
            errors.push("اسم المشروع مطلوب");
        } else if (name.length > MAX_NAME_LENGTH) {
            errors.push(`اسم المشروع يتجاوز ${MAX_NAME_LENGTH} حرف`);
        }
    }

    /* ─── الوصف ─── */
    if (body.description !== undefined && body.description !== null) {
        const desc = String(body.description);
        if (desc.length > MAX_DESCRIPTION_LENGTH) {
            errors.push(`الوصف يتجاوز ${MAX_DESCRIPTION_LENGTH} حرف`);
        }
    }

    /* ─── نوع المشروع ─── */
    if (body.project_type !== undefined) {
        if (!ALLOWED_PROJECT_TYPES.includes(body.project_type)) {
            errors.push("نوع المشروع غير معروف");
        }
    }

    /* ─── وضع التصميم ─── */
    if (body.design_mode !== undefined) {
        if (!ALLOWED_DESIGN_MODES.includes(body.design_mode)) {
            errors.push("وضع التصميم غير معروف");
        }
    }

    /* ─── الأبعاد ─── */
    for (const key of ["width", "length", "height"]) {
        if (body[key] === undefined || body[key] === null || body[key] === "") continue;

        const n = Number(body[key]);
        if (!Number.isFinite(n)) {
            errors.push(`${key} يجب أن يكون رقماً`);
        } else if (n < MIN_ROOM_DIMENSION || n > MAX_ROOM_DIMENSION) {
            errors.push(`${key} يجب أن يكون بين ${MIN_ROOM_DIMENSION} و ${MAX_ROOM_DIMENSION}`);
        }
    }

    /* ─── project_data ─── */
    if (body.project_data !== undefined && body.project_data !== null) {
        if (typeof body.project_data !== "object" || Array.isArray(body.project_data)) {
            errors.push("project_data يجب أن يكون كائناً");
        } else {
            // فحص حجم
            try {
                const json = JSON.stringify(body.project_data);
                if (json.length > MAX_PROJECT_DATA_BYTES) {
                    errors.push(`project_data يتجاوز الحد المسموح (${MAX_PROJECT_DATA_BYTES / 1024}KB)`);
                }
            } catch {
                errors.push("project_data غير قابل للتسلسل");
            }

            // فحص speakers إن وُجدت
            const pd = body.project_data;
            if (Array.isArray(pd.speakers) && pd.speakers.length > MAX_SPEAKERS_IN_DATA) {
                errors.push(`عدد السماعات في المشروع يتجاوز ${MAX_SPEAKERS_IN_DATA}`);
            }
        }
    }

    return errors;
}

/**
 * تحقق من project_id صحيح
 */
function parseId(raw) {
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * تحويل مشروع من DB إلى كائن آمن
 */
function formatProject(row) {
    if (!row) return null;

    let projectData = {};
    try {
        projectData = JSON.parse(row.project_data || "{}");
    } catch {
        projectData = {};
    }

    return {
        id: row.id,
        projectUid: row.project_uid,
        name: row.name,
        projectType: row.project_type,
        description: row.description,
        designMode: row.design_mode,
        room: {
            width: row.width,
            length: row.length,
            height: row.height,
            area: row.area,
            volume: row.volume
        },
        projectData,
        isArchived: row.is_archived === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        // حقول إدارية (admin only)
        ...(row.user_name !== undefined && {
            userId: row.user_id,
            userName: row.user_name,
            userPhone: row.user_phone
        })
    };
}

/**
 * حذف ملفات تقارير المشروع من القرص
 */
function deleteProjectReportFiles(projectId) {
    try {
        const REPORTS_DIR = path.join(__dirname, "..", "..", "reports");
        const reports = db.prepare(
            "SELECT file_name FROM reports WHERE project_id = ?"
        ).all(projectId);

        let deleted = 0;
        for (const r of reports) {
            try {
                const safe = path.basename(r.file_name || "");
                if (!safe || safe.includes("..") || safe.includes("/")) continue;

                const fullPath = path.join(REPORTS_DIR, safe);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    deleted++;
                }
            } catch (err) {
                console.warn("[projects] فشل حذف تقرير:", err.message);
            }
        }
        return deleted;
    } catch (err) {
        console.warn("[projects] deleteReportFiles:", err.message);
        return 0;
    }
}

/* ═══════════════ GET /api/projects ═══════════════ */
router.get("/", requireLogin, readLimiter, (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
        const offset = (page - 1) * limit;

        const includeArchived = req.query.archived === "1" || req.query.archived === "true";

        const conditions = ["user_id = ?"];
        const params = [req.session.user.id];

        if (!includeArchived) {
            conditions.push("is_archived = 0");
        }

        const search = (req.query.q || "").trim().slice(0, 100);
        if (search) {
            conditions.push("(name LIKE ? OR description LIKE ?)");
            params.push(`%${search}%`, `%${search}%`);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");

        const total = db.prepare(
            `SELECT COUNT(*) AS c FROM projects ${whereClause}`
        ).get(...params).c;

        const rows = db.prepare(`
            SELECT * FROM projects
            ${whereClause}
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        res.json({
            success: true,
            projects: rows.map(formatProject),
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
        console.error("[projects] list error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر جلب المشاريع"
        });
    }
});

/* ═══════════════ GET /api/projects/all (admin) ═══════════════ */
router.get("/all", requireLogin, requireAdmin, readLimiter, (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        const total = db.prepare("SELECT COUNT(*) AS c FROM projects").get().c;

        const rows = db.prepare(`
            SELECT p.*, u.name AS user_name, u.phone AS user_phone
            FROM projects p
            JOIN users u ON u.id = p.user_id
            ORDER BY p.updated_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        res.json({
            success: true,
            projects: rows.map(formatProject),
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit) || 1
            }
        });

    } catch (err) {
        console.error("[projects] list-all error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر جلب المشاريع"
        });
    }
});

/* ═══════════════ GET /api/projects/:id ═══════════════ */
router.get("/:id", requireLogin, readLimiter, (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "معرّف غير صالح"
            });
        }

        const row = db.prepare(
            "SELECT * FROM projects WHERE id = ? AND user_id = ?"
        ).get(id, req.session.user.id);

        if (!row) {
            return res.status(404).json({
                success: false,
                message: "المشروع غير موجود"
            });
        }

        res.json({
            success: true,
            project: formatProject(row)
        });

    } catch (err) {
        console.error("[projects] get error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر جلب المشروع"
        });
    }
});

/* ═══════════════ POST /api/projects ═══════════════ */
router.post("/", requireLogin, writeLimiter, (req, res) => {
    try {
        /* ─── تحقق ─── */
        const errors = validateProjectPayload(req.body);
        if (errors.length) {
            return res.status(400).json({
                success: false,
                message: "بيانات غير صالحة",
                errors
            });
        }

        /* ─── تجهيز البيانات ─── */
        const b = req.body;
        const name = String(b.name).trim().slice(0, MAX_NAME_LENGTH);
        const projectType = ALLOWED_PROJECT_TYPES.includes(b.project_type)
            ? b.project_type
            : "custom";
        const designMode = ALLOWED_DESIGN_MODES.includes(b.design_mode)
            ? b.design_mode
            : "manual";
        const description = String(b.description || "").trim().slice(0, MAX_DESCRIPTION_LENGTH);

        const room = calculateRoom(b.width, b.length, b.height);
        const projectData = b.project_data || {};
        const projectDataStr = JSON.stringify(projectData);

        /* ─── إنشاء في transaction ─── */
        const uid = generateProjectUID();
        const now = new Date().toISOString();

        const insertStmt = db.prepare(`
            INSERT INTO projects
                (project_uid, user_id, name, project_type, description,
                 width, length, height, area, volume,
                 design_mode, project_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let projectId;
        try {
            const result = insertStmt.run(
                uid,
                req.session.user.id,
                name,
                projectType,
                description,
                room.width,
                room.length,
                room.height,
                room.area,
                room.volume,
                designMode,
                projectDataStr,
                now,
                now
            );
            projectId = result.lastInsertRowid;
        } catch (err) {
            if (err.message && err.message.includes("UNIQUE")) {
                return res.status(409).json({
                    success: false,
                    message: "تعارض في معرف المشروع، حاول مجدداً"
                });
            }
            throw err;
        }

        /* ─── سجل النشاط ─── */
        logActivity(
            req.session.user.id,
            "project.create",
            `إنشاء مشروع: ${name}`,
            { projectId },
            req
        );

        /* ─── أعد المشروع كاملاً ─── */
        const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);

        res.status(201).json({
            success: true,
            project: formatProject(row),
            message: "تم إنشاء المشروع بنجاح"
        });

    } catch (err) {
        console.error("[projects] create error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر إنشاء المشروع"
        });
    }
});

/* ═══════════════ PUT /api/projects/:id ═══════════════ */
router.put("/:id", requireLogin, writeLimiter, (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "معرّف غير صالح"
            });
        }

        /* ─── اقرأ الموجود ─── */
        const existing = db.prepare(
            "SELECT * FROM projects WHERE id = ? AND user_id = ?"
        ).get(id, req.session.user.id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "المشروع غير موجود"
            });
        }

        /* ─── تحقق (partial) ─── */
        const errors = validateProjectPayload(req.body, { partial: true });
        if (errors.length) {
            return res.status(400).json({
                success: false,
                message: "بيانات غير صالحة",
                errors
            });
        }

        /* ─── دمج مع الموجود ─── */
        const b = req.body;

        const name = b.name !== undefined
            ? String(b.name).trim().slice(0, MAX_NAME_LENGTH)
            : existing.name;

        const projectType = b.project_type !== undefined
            && ALLOWED_PROJECT_TYPES.includes(b.project_type)
                ? b.project_type
                : existing.project_type;

        const designMode = b.design_mode !== undefined
            && ALLOWED_DESIGN_MODES.includes(b.design_mode)
                ? b.design_mode
                : existing.design_mode;

        const description = b.description !== undefined
            ? String(b.description || "").trim().slice(0, MAX_DESCRIPTION_LENGTH)
            : existing.description;

        const room = calculateRoom(
            b.width  !== undefined ? b.width  : existing.width,
            b.length !== undefined ? b.length : existing.length,
            b.height !== undefined ? b.height : existing.height
        );

        /* ─── project_data ─── */
        let projectDataStr;
        if (b.project_data !== undefined) {
            projectDataStr = JSON.stringify(b.project_data || {});
        } else {
            projectDataStr = existing.project_data || "{}";
        }

        /* ─── حدّث ─── */
        db.prepare(`
            UPDATE projects SET
                name = ?,
                project_type = ?,
                description = ?,
                width = ?, length = ?, height = ?,
                area = ?, volume = ?,
                design_mode = ?,
                project_data = ?,
                updated_at = datetime('now')
            WHERE id = ? AND user_id = ?
        `).run(
            name,
            projectType,
            description,
            room.width, room.length, room.height,
            room.area, room.volume,
            designMode,
            projectDataStr,
            id,
            req.session.user.id
        );

        /* ─── سجل النشاط ─── */
        logActivity(
            req.session.user.id,
            "project.update",
            `تحديث مشروع: ${name}`,
            { projectId: id },
            req
        );

        /* ─── أعد المُحدَّث ─── */
        const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);

        res.json({
            success: true,
            project: formatProject(row),
            message: "تم تحديث المشروع"
        });

    } catch (err) {
        console.error("[projects] update error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر تحديث المشروع"
        });
    }
});

/* ═══════════════ DELETE /api/projects/:id ═══════════════ */
router.delete("/:id", requireLogin, writeLimiter, (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "معرّف غير صالح"
            });
        }

        /* ─── تحقق من الملكية ─── */
        const project = db.prepare(
            "SELECT * FROM projects WHERE id = ? AND user_id = ?"
        ).get(id, req.session.user.id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "المشروع غير موجود"
            });
        }

        const force = req.query.force === "1" || req.query.force === "true";
        const permanent = req.query.permanent === "1" || req.query.permanent === "true";

        /* ─── حذف ناعم (أرشفة) افتراضياً ─── */
        if (!permanent && !force) {
            db.prepare(`
                UPDATE projects
                SET is_archived = 1, updated_at = datetime('now')
                WHERE id = ? AND user_id = ?
            `).run(id, req.session.user.id);

            logActivity(
                req.session.user.id,
                "project.archive",
                `أرشفة مشروع: ${project.name}`,
                { projectId: id },
                req
            );

            return res.json({
                success: true,
                message: "تمت أرشفة المشروع",
                archived: true
            });
        }

        /* ─── حذف نهائي ─── */
        const deletedFiles = deleteProjectReportFiles(id);

        db.prepare(
            "DELETE FROM projects WHERE id = ? AND user_id = ?"
        ).run(id, req.session.user.id);

        logActivity(
            req.session.user.id,
            "project.delete",
            `حذف مشروع: ${project.name}`,
            { projectId: id, deletedFiles },
            req
        );

        res.json({
            success: true,
            message: "تم حذف المشروع نهائياً",
            deletedReportsFiles: deletedFiles
        });

    } catch (err) {
        console.error("[projects] delete error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر حذف المشروع"
        });
    }
});

/* ═══════════════ POST /api/projects/:id/restore ═══════════════ */
router.post("/:id/restore", requireLogin, writeLimiter, (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "معرّف غير صالح"
            });
        }

        const result = db.prepare(`
            UPDATE projects
            SET is_archived = 0, updated_at = datetime('now')
            WHERE id = ? AND user_id = ? AND is_archived = 1
        `).run(id, req.session.user.id);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "المشروع غير موجود أو غير مؤرشف"
            });
        }

        logActivity(
            req.session.user.id,
            "project.restore",
            `استعادة مشروع #${id}`,
            { projectId: id },
            req
        );

        res.json({
            success: true,
            message: "تم استعادة المشروع"
        });

    } catch (err) {
        console.error("[projects] restore error:", err);
        res.status(500).json({
            success: false,
            message: "تعذّر استعادة المشروع"
        });
    }
});

module.exports = router;
