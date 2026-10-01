/* ============================================================
   Acoustic Engineering — server/routes/health.js v1.1.0
   Health check مع Liveness + Readiness + Detailed (admin only)
   ============================================================ */
"use strict";

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const os = require("os");
const rateLimit = require("express-rate-limit");

const db = require("../database");

/* ═══════════════ قراءة الإصدار من package.json ═══════════════ */
let PKG = { version: "1.0.0", name: "acoustic-engineering" };
try {
    PKG = require(path.join(__dirname, "..", "..", "package.json"));
} catch { /* ignore */ }

const BUILD_COMMIT = process.env.BUILD_COMMIT
    || process.env.GIT_COMMIT
    || null;

const START_TIME = Date.now();

/* ═══════════════ Rate Limiter مخصص للـ health ═══════════════ */
/*
   حتى health endpoint يمكن أن يُساء استخدامه (DDoS).
   60 طلب / دقيقة كافية لأي مراقب.
*/
const healthLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "too many requests" },
    // لا نتجاهل الـ limiter حتى للمراقبين (يمكن استثناء IPs معروفة)
    keyGenerator: (req) => req.ip
});

/* ═══════════════ Helpers ═══════════════ */

/**
 * فحص اتصال قاعدة البيانات مع قياس الزمن
 */
function checkDatabase() {
    const start = process.hrtime.bigint();
    try {
        db.prepare("SELECT 1 AS ok").get();
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

        return {
            status: "connected",
            responseMs: Math.round(durationMs * 100) / 100
        };
    } catch (err) {
        return {
            status: "error",
            error: err.code || err.name || "unknown",
            responseMs: null
        };
    }
}

/**
 * فحص صلاحية كتابة المجلدات الحيوية
 */
function checkStorage() {
    const ROOT = path.join(__dirname, "..", "..");
    const targets = ["uploads", "reports", "data"];
    const results = {};

    for (const dir of targets) {
        const full = path.join(ROOT, dir);
        try {
            // هل المجلد موجود؟
            if (!fs.existsSync(full)) {
                results[dir] = "missing";
                continue;
            }
            // هل يمكن الكتابة؟
            fs.accessSync(full, fs.constants.W_OK);
            results[dir] = "writable";
        } catch {
            results[dir] = "not_writable";
        }
    }

    return results;
}

/**
 * معلومات عامة عن العملية (بدون تسريب)
 */
function getProcessInfo() {
    return {
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid
    };
}

/**
 * معلومات الذاكرة المبسّطة (rounded)
 */
function getMemoryInfo() {
    const mem = process.memoryUsage();
    const mb = (bytes) => Math.round(bytes / 1024 / 1024);
    return {
        rssMb: mb(mem.rss),
        heapUsedMb: mb(mem.heapUsed),
        heapTotalMb: mb(mem.heapTotal)
    };
}

/**
 * هل البيئة إنتاج؟
 */
const isProd = process.env.NODE_ENV === "production";

/* ═══════════════════════════════════════════════════════════
   ENDPOINTS
   ═══════════════════════════════════════════════════════════
   - /api/health              → Liveness (200 دائماً إذا العملية تعمل)
   - /api/health/ready        → Readiness (200 أو 503)
   - /api/health/detailed     → تفاصيل (admin فقط)
*/

/* ═══════════════ GET /api/health — Liveness ═══════════════
   المسؤول: "هل العملية حيّة؟"
   - لا يفحص DB (لأن Liveness لا يجب أن يفشل بسبب DB)
   - يُستخدم من Kubernetes livenessProbe
   - سريع جداً (< 1ms)
   ═══════════════════════════════════════════════════════════ */
router.get("/", healthLimiter, (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    res.status(200).json({
        ok: true,
        service: "acoustic-engineering",
        timestamp: new Date().toISOString()
    });
});

/* ═══════════════ GET /api/health/ready — Readiness ═══════════════
   المسؤول: "هل الخدمة جاهزة لاستقبال الطلبات؟"
   - يفحص DB + Storage
   - يُعيد 200 إذا كل شيء يعمل
   - يُعيد 503 إذا كانت DB أو storage معطّلة
   - يُستخدم من Kubernetes readinessProbe
   ═══════════════════════════════════════════════════════════════ */
router.get("/ready", healthLimiter, (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    const database = checkDatabase();
    const storage = checkStorage();

    /* ─── الشروط الحرجة ─── */
    const dbOk = database.status === "connected";
    const storageOk = Object.values(storage).every(v => v === "writable");

    const ready = dbOk && storageOk;
    const statusCode = ready ? 200 : 503;

    /* ─── الاستجابة (بدون تسريب تفاصيل في الإنتاج) ─── */
    if (isProd) {
        // في الإنتاج: الحد الأدنى
        res.status(statusCode).json({
            ok: ready,
            timestamp: new Date().toISOString(),
            ...(ready ? {} : {
                // نُفصح فقط عن مكوّن معطّل (لا تفاصيل تقنية)
                issue: !dbOk ? "database" : "storage"
            })
        });
    } else {
        // في التطوير: تفاصيل مفيدة
        res.status(statusCode).json({
            ok: ready,
            timestamp: new Date().toISOString(),
            checks: {
                database,
                storage
            }
        });
    }
});

/* ═══════════════ GET /api/health/detailed — تفاصيل كاملة ═══════════════
   ⚠️ لا يتطلب تسجيل دخول إن لم يكن هناك session نظام
   لكن يجب أن يكون محمياً بـ:
   - IP whitelist (127.0.0.1, internal network)
   - أو admin auth
   
   هنا نتحقق من IP — نسمح فقط بالشبكة المحلية
   ═══════════════════════════════════════════════════════════════════════ */
router.get("/detailed", healthLimiter, (req, res) => {
    /* ─── IP whitelist ─── */
    const ip = req.ip || req.connection?.remoteAddress || "";

    const isLocal =
        ip === "127.0.0.1"
        || ip === "::1"
        || ip === "::ffff:127.0.0.1"
        || ip.startsWith("192.168.")
        || ip.startsWith("10.")
        || ip.startsWith("172.16.")
        || ip.startsWith("172.17.")
        || ip.startsWith("172.18.")
        || ip.startsWith("172.19.")
        || ip.startsWith("172.2")
        || ip.startsWith("172.30.")
        || ip.startsWith("172.31.");

    /* ─── أو admin ─── */
    const isAdmin = req.session?.user?.role &&
        ["admin", "owner"].includes(req.session.user.role);

    if (!isLocal && !isAdmin) {
        return res.status(403).json({
            ok: false,
            message: "غير مسموح"
        });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    const database = checkDatabase();
    const storage = checkStorage();
    const process_info = getProcessInfo();
    const memory = getMemoryInfo();

    const ready =
        database.status === "connected" &&
        Object.values(storage).every(v => v === "writable");

    res.status(ready ? 200 : 503).json({
        ok: ready,
        service: PKG.name,
        version: PKG.version,
        commit: BUILD_COMMIT,
        mode: "express-sqlite",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),

        checks: {
            database,
            storage
        },

        system: {
            nodeVersion: process_info.nodeVersion,
            platform: process_info.platform,
            pid: process_info.pid,
            uptimeSeconds: process_info.uptimeSeconds,
            uptimeHuman: formatUptime(process_info.uptimeSeconds),
            memory
        },

        host: {
            hostname: os.hostname(),
            cpus: os.cpus().length,
            loadavg: os.loadavg().map(n => Math.round(n * 100) / 100),
            totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
            freeMemoryMb: Math.round(os.freemem() / 1024 / 1024)
        }
    });
});

/* ═══════════════ Helper: تنسيق uptime ═══════════════ */
function formatUptime(seconds) {
    const s = Math.floor(seconds);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${sec}s`);

    return parts.join(" ");
}

module.exports = router;
