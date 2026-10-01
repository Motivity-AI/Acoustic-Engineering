/* ============================================================
   Acoustic Engineering — server/index.js v1.2.0
   Express app مع إعدادات أمنية كاملة + جلسات SQLite
   ============================================================ */
"use strict";

/* ═══════════════ المتغيرات البيئية أولاً ═══════════════ */
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const isProd = process.env.NODE_ENV === "production";

/* ═══════════════ المسارات ═══════════════ */
const ROOT     = path.join(__dirname, "..");
const PUBLIC   = path.join(ROOT, "public");       // مجلد الأصول العامة (إن وُجد)
const UPLOADS  = path.join(ROOT, "uploads");
const REPORTS  = path.join(ROOT, "reports");      // ⚠️ لا يُخدم static — فقط عبر API
const DATA     = path.join(ROOT, "data");

[UPLOADS, REPORTS, DATA].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/* ═══════════════ تحقق من الإعدادات الحرجة ═══════════════ */
if (isProd && !process.env.SESSION_SECRET) {
    console.error("❌ SESSION_SECRET مطلوب في الإنتاج!");
    console.error("   أضفه إلى .env");
    process.exit(1);
}

if (isProd && process.env.SESSION_SECRET === "ACOUSTIC_ENGINEERING_CHANGE_THIS") {
    console.error("❌ SESSION_SECRET لا يزال بالقيمة الافتراضية!");
    process.exit(1);
}

/* ═══════════════ trust proxy (reverse proxy) ═══════════════ */
if (isProd) {
    app.set("trust proxy", 1);
}

/* ═══════════════ Helmet — رؤوس HTTP الأمنية ═══════════════ */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",                  // SVG inline + scripts مدمجة
                "https://cdnjs.cloudflare.com",
                "https://www.gstatic.com",
                "https://apis.google.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
                "data:"
            ],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: [
                "'self'",
                "https://*.firebaseio.com",
                "https://*.googleapis.com",
                "https://*.firebasedatabase.app",
                "wss://*.firebaseio.com",
                "https://identitytoolkit.googleapis.com",
                "https://securetoken.googleapis.com"
            ],
            frameSrc: ["'self'", "https://*.firebaseapp.com"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            workerSrc: ["'self'", "blob:"],
            manifestSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,             // للسماح بـ Firebase
    crossOriginResourcePolicy: { policy: "same-site" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

/* ═══════════════ Compression ═══════════════ */
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
    }
}));

/* ═══════════════ CORS — whitelist صريح ═══════════════ */
const ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map(o => o.trim())
        .filter(Boolean)
];

app.use(cors({
    origin: (origin, callback) => {
        // اسمح للطلبات من نفس الأصل (بدون Origin header)
        if (!origin) return callback(null, true);

        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }

        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["X-Total-Count", "Content-Disposition"],
    maxAge: 86400
}));

/* ═══════════════ Body Parsers ═══════════════ */
app.use(express.json({
    limit: "5mb",
    strict: true
}));

app.use(express.urlencoded({
    extended: false,                              // ⚠️ false بدل true (prototype pollution)
    limit: "5mb",
    parameterLimit: 100
}));

/* ═══════════════ Rate Limiter عام ═══════════════ */
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "عدد كبير من الطلبات، حاول لاحقاً"
    },
    skip: (req) => {
        // لا تحدّ من ملفات static
        return req.path.startsWith("/uploads/");
    }
});

app.use("/api", globalLimiter);

/* ═══════════════ Session Store ═══════════════ */
let sessionStore;
try {
    const SQLiteStore = require("connect-sqlite3")(session);
    sessionStore = new SQLiteStore({
        db: "sessions.sqlite",
        dir: DATA,
        concurrentDB: true
    });
    console.log("✓ Session store: SQLite");
} catch (err) {
    if (isProd) {
        console.error("❌ connect-sqlite3 مطلوب في الإنتاج");
        console.error("   npm install connect-sqlite3");
        process.exit(1);
    }
    console.warn("⚠️  connect-sqlite3 غير مثبت — استخدام MemoryStore (للتطوير فقط)");
    sessionStore = undefined;
}

/* ═══════════════ Session Secret ═══════════════ */
const SESSION_SECRET = process.env.SESSION_SECRET
    || "dev-only-change-me-" + crypto.randomBytes(16).toString("hex");

if (!isProd && !process.env.SESSION_SECRET) {
    console.warn("⚠️  SESSION_SECRET غير معرّف — تم توليد قيمة عشوائية للتطوير");
    console.warn("⚠️  الجلسات ستُفقد عند إعادة التشغيل");
}

app.use(session({
    store: sessionStore,
    secret: SESSION_SECRET,
    name: "ae.sid",
    resave: false,
    saveUninitialized: false,
    rolling: true,                                // جدّد الكوكي مع كل طلب
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,          // أسبوع
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,                           // HTTPS فقط في الإنتاج
        path: "/"
    }
}));

/* ═══════════════ Security Headers إضافية ═══════════════ */
app.use((req, res, next) => {
    res.removeHeader("X-Powered-By");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    next();
});

/* ═══════════════ حجب المسارات الحساسة ═══════════════ */
/*
   حتى لو لم يكن هناك مجلد public/، نضمن أن:
   .env, .git, server/, node_modules, data/ لا تُخدَم أبداً
*/
const BLOCKED_PATHS = [
    "/server",
    "/node_modules",
    "/.git",
    "/.env",
    "/.env.local",
    "/.env.example",
    "/data",
    "/uploads",
    "/reports",                                   // ⚠️ التقارير عبر API فقط
    "/.gitignore",
    "/.gitattributes",
    "/package.json",
    "/package-lock.json",
    "/README.md",
    "/LICENSE"
];

app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    for (const blocked of BLOCKED_PATHS) {
        if (p === blocked || p.startsWith(blocked + "/")) {
            return res.status(404).end();
        }
    }
    next();
});

/* ═══════════════ خدمة الأصول العامة ═══════════════ */
const staticRoot = fs.existsSync(PUBLIC) ? PUBLIC : ROOT;

app.use(express.static(staticRoot, {
    dotfiles: "deny",                             // ⚠️ منع .env و .git
    index: ["index.html"],
    etag: true,
    lastModified: true,
    maxAge: isProd ? "7d" : 0,
    setHeaders: (res, fp) => {
        // Service Worker يحتاج Service-Worker-Allowed
        if (fp.endsWith("sw.js")) {
            res.setHeader("Service-Worker-Allowed", "/");
            res.setHeader("Cache-Control", "no-cache");
        }
        // HTML لا يُخزَّن مؤقتاً
        if (fp.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
        }
        // Manifest
        if (fp.endsWith("manifest.json")) {
            res.setHeader("Content-Type", "application/manifest+json");
            res.setHeader("Cache-Control", "public, max-age=3600");
        }
    }
}));

/* ═══════════════ الملفات المرفوعة (uploads) ═══════════════ */
/*
   ⚠️ راجع الحماية حسب استخدامك:
   - إن كانت datasheet عامة → اترك as-is
   - إن كانت خاصة → أضف requireLogin
*/
app.use("/uploads", (req, res, next) => {
    // TODO: أضف فحص auth هنا إن كانت الملفات خاصة
    // مثال:
    // if (!req.session?.user) return res.status(401).end();

    // منع الملفات المخفية والتنفيذية
    const ext = path.extname(req.path).toLowerCase();
    const BLOCKED_EXT = [".js", ".html", ".htm", ".php", ".sh", ".exe", ".bat"];
    if (BLOCKED_EXT.includes(ext)) {
        return res.status(403).end();
    }

    next();
}, express.static(UPLOADS, {
    dotfiles: "deny",
    index: false,
    maxAge: isProd ? "1h" : 0,
    setHeaders: (res) => {
        // لا تُشغّل الملفات في المتصفح مباشرة
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    }
}));

/* ═══════════════════════════════════════════════════════════
   ⚠️ مهم: التقارير (reports) لا تُخدَم كملفات static إطلاقاً
   ═══════════════════════════════════════════════════════════
   السبب: التقارير تحتوي بيانات حساسة، ويجب أن تُخدم فقط عبر
   API محمي (GET /api/reports/:id/download) الذي يتحقق من:
   - تسجيل الدخول
   - ملكية التقرير (user_id)
   - أو صلاحية admin/owner

   لذلك: لا نضع
   app.use("/reports", express.static(REPORTS))
   لأنها ستكشف كل التقارير لمن يعرف اسم الملف.
*/

/* ═══════════════ Rate Limiters خاصة ═══════════════ */

// تسجيل الدخول: 15 محاولة / 15 دقيقة
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "محاولات كثيرة. حاول بعد 15 دقيقة."
    },
    skipSuccessfulRequests: true
});

// التسجيل: 5 حسابات / ساعة
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "تجاوزت حد إنشاء الحسابات. حاول بعد ساعة."
    }
});

// توليد التقارير: 10 / 15 دقيقة
const reportsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "تجاوزت حد إنشاء التقارير. حاول بعد 15 دقيقة."
    }
});

/* ═══════════════ Routes ═══════════════ */

/* Health check */
app.use("/api/health", require("./routes/health"));

/* Auth مع rate limiters مخصّصة */
app.use("/api/auth/login",    authLimiter);
app.use("/api/auth/register", signupLimiter);
app.use("/api/auth",          require("./routes/auth"));

/* Projects */
app.use("/api/projects", require("./routes/projects"));

/* Speakers */
app.use("/api/speakers", require("./routes/speakers"));

/* Reports مع limiter خاص على /generate */
app.use("/api/reports/generate", reportsLimiter);
app.use("/api/reports",          require("./routes/reports"));

/* ═══════════════ 404 للـ API ═══════════════ */
app.use("/api/*", (req, res) => {
    res.status(404).json({
        success: false,
        message: "نقطة النهاية غير موجودة",
        path: req.originalUrl
    });
});

/* ═══════════════ SPA Fallback ═══════════════ */
app.get("*", (req, res, next) => {
    // لا تُرجع index.html لملفات ثابتة مفقودة
    if (path.extname(req.path)) {
        return res.status(404).send("Not found");
    }

    // لا تُرجع index.html لملفات HTML مفقودة
    if (req.path.endsWith(".html")) {
        const fp = path.join(staticRoot, req.path);
        if (!fs.existsSync(fp)) {
            return res.status(404).send("Not found");
        }
    }

    const indexPath = path.join(staticRoot, "index.html");
    if (!fs.existsSync(indexPath)) {
        return res.status(500).send("index.html غير موجود");
    }

    res.sendFile(indexPath);
});

/* ═══════════════ Error Handler موحّد ═══════════════ */
app.use((error, req, res, next) => {
    // سجّل دائماً بالتفصيل على الخادم
    console.error("[Server Error]", {
        message: error.message,
        stack: isProd ? undefined : error.stack,
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });

    if (res.headersSent) {
        return next(error);
    }

    // CORS errors
    if (error.message === "Not allowed by CORS") {
        return res.status(403).json({
            success: false,
            message: "العنوان غير مسموح"
        });
    }

    // Multer errors
    if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
            success: false,
            message: "حجم الملف كبير جداً"
        });
    }

    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
            success: false,
            message: "عدد الملفات غير مسموح"
        });
    }

    // JSON parse errors
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            success: false,
            message: "صيغة JSON غير صحيحة"
        });
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            success: false,
            message: "حجم الطلب كبير جداً"
        });
    }

    // Validation errors
    if (error.name === "ValidationError") {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    const status = error.status || error.statusCode || 500;

    res.status(status).json({
        success: false,
        // ⚠️ لا تكشف رسالة الخطأ الأصلية في الإنتاج لـ 500
        message: isProd && status === 500
            ? "حدث خطأ داخلي في الخادم"
            : error.message || "خطأ غير متوقع"
    });
});

/* ═══════════════════════════════════════════════════════════
   Graceful Shutdown — يُصدَّر لـ server.js لتمريره للـ server
   ═══════════════════════════════════════════════════════════ */
function setupGracefulShutdown(server) {
    let shuttingDown = false;

    const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;

        console.log(`\n👋 استُقبل ${signal} — إيقاف الخادم...`);

        // أوقف قبول اتصالات جديدة
        server.close(async () => {
            console.log("✓ تم إغلاق الاتصالات");

            // أغلق قاعدة البيانات
            try {
                const database = require("./database");
                if (database && typeof database.close === "function") {
                    database.close();
                    console.log("✓ تم إغلاق قاعدة البيانات");
                }
            } catch (err) {
                console.warn("[shutdown] database close:", err.message);
            }

            // أغلق store الجلسات
            if (sessionStore && typeof sessionStore.close === "function") {
                sessionStore.close(() => {
                    console.log("✓ تم إغلاق جلسات SQLite");
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        });

        // Force exit بعد 10 ثواني
        setTimeout(() => {
            console.error("⚠️ إيقاف قسري بعد انتهاء المهلة");
            process.exit(1);
        }, 10000).unref();
    };

    process.on("SIGINT",  () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    process.on("uncaughtException", (err) => {
        console.error("❌ uncaughtException:", err);
        shutdown("uncaughtException");
    });

    process.on("unhandledRejection", (reason) => {
        console.error("❌ unhandledRejection:", reason);
        // لا نُغلق — قد يكون خطأ غير حرج
    });
}

/* ═══════════════ التصدير ═══════════════ */
module.exports = app;
module.exports.setupGracefulShutdown = setupGracefulShutdown;

/* ═══════════════ Log عند التحميل ═══════════════ */
console.log(`[server/index] تم التحميل — ${isProd ? "production" : "development"}`);
console.log(`[server/index] static root: ${staticRoot}`);
console.log(`[server/index] reports: ${REPORTS} (محمي — لا static)`);
console.log(`[server/index] uploads: ${UPLOADS}`);
console.log(`[server/index] data:    ${DATA}`);
