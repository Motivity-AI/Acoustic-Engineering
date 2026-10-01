/* ============================================================
   Acoustic Engineering — server/database.js v1.1.0
   ============================================================ */
"use strict";

require("dotenv").config();

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

/* ═══════════════ إعداد المجلد ═══════════════ */
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.SQLITE_PATH
    || path.join(dataDir, "acoustic-engineering.db");

/* ═══════════════ فتح قاعدة البيانات ═══════════════ */
let db;
try {
    db = new Database(dbPath);
} catch (err) {
    console.error("❌ فشل فتح قاعدة البيانات:", dbPath);
    console.error(err.message);
    process.exit(1);
}

/* ═══════════════ Pragmas (الأداء والموثوقية) ═══════════════ */
db.pragma("journal_mode = WAL");           // كتابة متزامنة أفضل
db.pragma("synchronous = NORMAL");         // مع WAL = آمن وسريع
db.pragma("foreign_keys = ON");            // علاقات مُفعّلة
db.pragma("busy_timeout = 5000");          // 5 ثواني انتظار عند القفل
db.pragma("temp_store = MEMORY");          // temp tables في الذاكرة
db.pragma("mmap_size = 134217728");        // 128MB memory mapping (اختياري)
db.pragma("cache_size = -32000");          // ~32MB cache (سالبة = KB)

// تحقق أن foreign_keys مُفعّل فعلاً
const fkEnabled = db.pragma("foreign_keys", { simple: true });
if (!fkEnabled) {
    console.error("❌ تعذّر تفعيل foreign_keys");
    process.exit(1);
}

/* ═══════════════ Schema ═══════════════ */
db.exec(`
/* ───────── Users ───────── */
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT,
    company TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
        CHECK(role IN ('user', 'engineer', 'admin', 'owner')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(length(name) >= 2),
    CHECK(length(phone) >= 7)
);

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role
    ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_created
    ON users(created_at DESC);

/* ───────── Projects ───────── */
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_uid TEXT UNIQUE,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    project_type TEXT NOT NULL DEFAULT 'general',
    description TEXT,
    width  REAL NOT NULL DEFAULT 20 CHECK(width  > 0 AND width  < 1000),
    length REAL NOT NULL DEFAULT 30 CHECK(length > 0 AND length < 1000),
    height REAL NOT NULL DEFAULT 5  CHECK(height > 0 AND height < 100),
    area   REAL NOT NULL DEFAULT 0  CHECK(area   >= 0),
    volume REAL NOT NULL DEFAULT 0  CHECK(volume >= 0),
    design_mode TEXT DEFAULT 'manual'
        CHECK(design_mode IN ('manual', 'assisted', 'auto')),
    project_data TEXT NOT NULL DEFAULT '{}',
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_user
    ON projects(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_updated
    ON projects(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
    ON projects(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_archived
    ON projects(is_archived) WHERE is_archived = 0;

/* ───────── Speakers ───────── */
CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manufacturer TEXT NOT NULL,
    model TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Point Source'
        CHECK(category IN ('Point Source', 'Column', 'Ceiling',
                           'Line Array', 'Subwoofer', 'Monitor', 'Horn')),
    rms_power  REAL NOT NULL DEFAULT 0 CHECK(rms_power  >= 0),
    peak_power REAL NOT NULL DEFAULT 0 CHECK(peak_power >= 0),
    max_spl    REAL NOT NULL DEFAULT 0 CHECK(max_spl    >= 0 AND max_spl <= 200),
    sensitivity REAL NOT NULL DEFAULT 0 CHECK(sensitivity >= 0 AND sensitivity <= 150),
    frequency_min REAL NOT NULL DEFAULT 0 CHECK(frequency_min >= 0),
    frequency_max REAL NOT NULL DEFAULT 0 CHECK(frequency_max >= 0),
    horizontal_coverage REAL NOT NULL DEFAULT 90
        CHECK(horizontal_coverage > 0 AND horizontal_coverage <= 360),
    vertical_coverage REAL NOT NULL DEFAULT 60
        CHECK(vertical_coverage > 0 AND vertical_coverage <= 360),
    impedance REAL NOT NULL DEFAULT 8 CHECK(impedance > 0),
    weight    REAL NOT NULL DEFAULT 0 CHECK(weight >= 0),
    mounting_type TEXT NOT NULL DEFAULT 'Wall'
        CHECK(mounting_type IN ('Wall', 'Ceiling', 'Stand', 'Fly',
                                'Ground', 'Tripod', 'Pole', 'Truss')),
    datasheet TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(manufacturer, model),
    CHECK(frequency_max = 0 OR frequency_max >= frequency_min)
);

CREATE INDEX IF NOT EXISTS idx_speakers_category
    ON speakers(category);

CREATE INDEX IF NOT EXISTS idx_speakers_manufacturer
    ON speakers(manufacturer);

CREATE INDEX IF NOT EXISTS idx_speakers_search
    ON speakers(manufacturer, model);

/* ───────── Reports ───────── */
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0 CHECK(file_size >= 0),
    mime_type TEXT DEFAULT 'application/pdf',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(project_id, file_name)
);

CREATE INDEX IF NOT EXISTS idx_reports_project
    ON reports(project_id);

CREATE INDEX IF NOT EXISTS idx_reports_user
    ON reports(user_id, created_at DESC);

/* ───────── Activity ───────── */
CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    description TEXT,
    metadata TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_user
    ON activity(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_created
    ON activity(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_action
    ON activity(action, created_at DESC);

/* ───────── Sessions (اختياري — إذا لم تستخدم connect-sqlite3) ───────── */
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expired
    ON sessions(expired);

/* ───────── Metadata (تتبّع إصدار Schema) ───────── */
CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/* ═══════════════ Triggers: تحديث updated_at تلقائياً ═══════════════ */
db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_updated_at
AFTER UPDATE ON projects
FOR EACH ROW
BEGIN
    UPDATE projects SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`);

/* ═══════════════ Seeding ═══════════════ */

function seedAdmin() {
    // ⚠️ في الإنتاج: اقرأ من .env
    // ⚠️ في التطوير: قيم افتراضية مع تحذير واضح
    const isProd = process.env.NODE_ENV === "production";

    const adminPhone    = process.env.ADMIN_PHONE;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName     = process.env.ADMIN_NAME || "System Administrator";
    const adminEmail    = process.env.ADMIN_EMAIL || "admin@acoustic.local";
    const adminCompany  = process.env.ADMIN_COMPANY || "Acoustic Engineering";

    if (!adminPhone || !adminPassword) {
        if (isProd) {
            console.error("❌ ADMIN_PHONE و ADMIN_PASSWORD مطلوبان في الإنتاج");
            console.error("   أضفهما إلى .env قبل التشغيل");
            process.exit(1);
        }

        // في التطوير فقط: قيم افتراضية + تحذير واضح
        console.warn("\n⚠️  ADMIN_PHONE / ADMIN_PASSWORD غير معرّفين.");
        console.warn("⚠️  سيتم استخدام قيم افتراضية للتطوير فقط.");
        console.warn("⚠️  لا تستخدمها في الإنتاج!\n");
    }

    const phone    = adminPhone    || "0000000000";
    const password = adminPassword || "Admin123!";

    // تحقق من قوة كلمة المرور
    if (password.length < 8) {
        console.error("❌ ADMIN_PASSWORD يجب أن يكون 8 أحرف على الأقل");
        process.exit(1);
    }

    const existing = db.prepare(
        "SELECT id, role FROM users WHERE phone = ?"
    ).get(phone);

    if (existing) {
        // موجود بالفعل — لا نعمل شيئاً (لا نُعيد إنشاءه إن حُذف)
        return;
    }

    try {
        const hash = bcrypt.hashSync(password, 12);
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO users
                (name, phone, email, company, password_hash, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)
        `).run(adminName, phone, adminEmail, adminCompany, hash, now, now);

        // ⚠️ لا تطبع كلمة المرور أبداً
        console.log(`✓ Admin account created (phone: ${phone.slice(0, 4)}****${phone.slice(-2)})`);

    } catch (err) {
        console.error("❌ فشل إنشاء حساب المسؤول:", err.message);
        throw err;
    }
}

function seedSpeakers() {
    const count = db.prepare("SELECT COUNT(*) AS c FROM speakers").get().c;
    if (count > 0) return;

    const speakers = [
        ["Generic", "Point Source 12",  "Point Source",  500, 1000, 125, 96, 55, 18000,  90, 60, 8, 15, "Stand"],
        ["Generic", "Column Speaker",   "Column",        150,  300, 112, 94, 80, 16000, 120, 30, 8,  8, "Wall"],
        ["Generic", "Ceiling 6W",       "Ceiling",         6,   12,  96, 88, 100, 16000, 90, 90, 8,  1, "Ceiling"],
        ["Generic", "Line Array",       "Line Array",   1000, 2000, 135, 100, 45, 20000, 100, 10, 8, 30, "Fly"],
        ["Generic", "Subwoofer 18",     "Subwoofer",    1200, 2400, 132, 99, 35, 150,  100, 60, 8, 45, "Ground"]
    ];

    const stmt = db.prepare(`
        INSERT INTO speakers
            (manufacturer, model, category, rms_power, peak_power, max_spl,
             sensitivity, frequency_min, frequency_max,
             horizontal_coverage, vertical_coverage, impedance, weight, mounting_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows) => {
        for (const row of rows) stmt.run(...row);
    });

    insertMany(speakers);
    console.log(`✓ ${speakers.length} speakers seeded`);
}

function seed() {
    // تشغيل seeding فقط إذا طُلب صراحةً أو في التطوير
    const shouldSeed = process.env.SEED_DB === "true"
        || process.env.NODE_ENV !== "production";

    if (!shouldSeed) {
        console.log("ℹ️  Seeding متوقف (NODE_ENV=production و SEED_DB!=true)");
        return;
    }

    // تتبّع إصدار schema
    const schemaVersion = "1.1.0";
    const prevVersion = db.prepare(
        "SELECT value FROM schema_meta WHERE key = 'version'"
    ).get();

    if (!prevVersion) {
        db.prepare(
            "INSERT INTO schema_meta (key, value) VALUES ('version', ?)"
        ).run(schemaVersion);
        console.log(`✓ Schema version set to ${schemaVersion}`);
    } else if (prevVersion.value !== schemaVersion) {
        console.log(`ℹ️  Schema upgrade: ${prevVersion.value} → ${schemaVersion}`);
        db.prepare(
            "UPDATE schema_meta SET value = ?, updated_at = datetime('now') WHERE key = 'version'"
        ).run(schemaVersion);
    }

    seedAdmin();
    seedSpeakers();

    // تحسين الإحصائيات
    try {
        db.pragma("optimize");
    } catch { /* ignore */ }
}

seed();

/* ═══════════════ Maintenance Helpers ═══════════════ */

/**
 * حذف الجلسات المنتهية (للـ cleanup الدوري)
 */
function cleanupExpiredSessions() {
    try {
        const result = db.prepare(
            "DELETE FROM sessions WHERE expired < ?"
        ).run(Date.now());
        return result.changes;
    } catch {
        return 0;
    }
}

/**
 * تحسين قاعدة البيانات (يُنصح بالتشغيل أسبوعياً)
 */
function optimize() {
    try {
        db.pragma("optimize");
        db.pragma("wal_checkpoint(TRUNCATE)");
        return true;
    } catch (err) {
        console.warn("[db] optimize failed:", err.message);
        return false;
    }
}

/**
 * نسخة احتياطية آمنة (بدل نسخ الملف)
 */
async function backup(destinationPath) {
    const dest = destinationPath
        || path.join(dataDir, `backup-${Date.now()}.db`);

    try {
        await db.backup(dest);
        console.log(`✓ Backup created: ${dest}`);
        return dest;
    } catch (err) {
        console.error("[db] backup failed:", err.message);
        throw err;
    }
}

/**
 * إحصائيات سريعة (للوحة الإدارة)
 */
function getStats() {
    return {
        users:         db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
        activeUsers:   db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_active = 1").get().c,
        projects:      db.prepare("SELECT COUNT(*) AS c FROM projects WHERE is_archived = 0").get().c,
        archivedProjects: db.prepare("SELECT COUNT(*) AS c FROM projects WHERE is_archived = 1").get().c,
        speakers:      db.prepare("SELECT COUNT(*) AS c FROM speakers").get().c,
        reports:       db.prepare("SELECT COUNT(*) AS c FROM reports").get().c,
        activity:      db.prepare("SELECT COUNT(*) AS c FROM activity").get().c,
        dbSize:        fs.statSync(dbPath).size
    };
}

/* ═══════════════ Graceful Close ═══════════════ */
function close() {
    try {
        db.pragma("wal_checkpoint(TRUNCATE)");
        db.close();
        return true;
    } catch (err) {
        console.warn("[db] close failed:", err.message);
        return false;
    }
}

/* ═══════════════ Export ═══════════════ */
module.exports = db;
module.exports.cleanupExpiredSessions = cleanupExpiredSessions;
module.exports.optimize = optimize;
module.exports.backup = backup;
module.exports.getStats = getStats;
module.exports.close = close;
module.exports.dbPath = dbPath;
