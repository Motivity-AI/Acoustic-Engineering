/* ============================================================
   Acoustic Engineering — server/auth.js v1.1.0
   ============================================================ */
"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./database");

/* ═══════════════ ثوابت ═══════════════ */
const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// hash وهمي للاستخدام في timing-safe comparison
// (يمنع كشف وجود الحساب عبر قياس زمن الاستجابة)
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.7fqmN8sQxv6RDcFnRSV/YKzF1S9DXfK";

/* ═══════════════ Password utilities ═══════════════ */

/**
 * Hash a password (async — لا يحجب Event Loop)
 * @param {string} password
 * @returns {Promise<string>}
 */
function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify a password (async — لا يحجب Event Loop)
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * نسخة متزامنة (للاستخدام في seeding فقط)
 * ⚠️ لا تستخدمها في مسارات HTTP
 */
function hashPasswordSync(password) {
    return bcrypt.hashSync(password, BCRYPT_COST);
}

/* ═══════════════ Normalization ═══════════════ */

/**
 * تطبيع رقم الهاتف (إزالة مسافات وشرطات)
 */
function normalizePhone(phone) {
    if (!phone) return "";
    return String(phone).replace(/[\s\-()]/g, "").trim();
}

/**
 * تطبيع البريد الإلكتروني (lowercase + trim)
 */
function normalizeEmail(email) {
    if (!email) return null;
    const e = String(email).trim().toLowerCase();
    return e || null;
}

/**
 * تطبيع اسم المستخدم
 */
function normalizeName(name) {
    if (!name) return "";
    return String(name).trim().replace(/\s+/g, " ");
}

/* ═══════════════ Validation ═══════════════ */

function validatePhone(phone) {
    if (!phone) return "رقم الهاتف مطلوب";
    if (!PHONE_REGEX.test(phone)) return "رقم الهاتف غير صالح";
    if (normalizePhone(phone).length < 7) return "رقم الهاتف قصير جداً";
    return null;
}

function validateEmail(email) {
    if (!email) return null;   // اختياري
    if (!EMAIL_REGEX.test(email)) return "البريد الإلكتروني غير صالح";
    if (email.length > 254) return "البريد الإلكتروني طويل جداً";
    return null;
}

function validatePassword(password) {
    if (!password) return "كلمة المرور مطلوبة";
    if (typeof password !== "string") return "كلمة المرور غير صالحة";
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`;
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return `كلمة المرور يجب ألا تتجاوز ${MAX_PASSWORD_LENGTH} حرفاً`;
    }
    return null;
}

function validateName(name) {
    if (!name) return "الاسم مطلوب";
    const n = normalizeName(name);
    if (n.length < 2) return "الاسم قصير جداً";
    if (n.length > 100) return "الاسم طويل جداً";
    return null;
}

/* ═══════════════ UID ═══════════════ */

/**
 * توليد UID آمن تشفيرياً
 */
function generateUID() {
    return "u_" + crypto.randomBytes(12).toString("base64url");
}

/* ═══════════════ Register ═══════════════ */

/**
 * تسجيل مستخدم جديد (async)
 * @param {Object} data - { name, phone, email, company, password }
 * @returns {Promise<Object>} - بيانات المستخدم بدون كلمة المرور
 */
async function registerUser({ name, phone, email, company, password }) {
    /* ─── تطبيع ─── */
    const cleanName     = normalizeName(name);
    const cleanPhone    = normalizePhone(phone);
    const cleanEmail    = normalizeEmail(email);
    const cleanCompany  = company ? String(company).trim().slice(0, 100) : null;

    /* ─── تحقق ─── */
    const nameErr     = validateName(cleanName);
    const phoneErr    = validatePhone(cleanPhone);
    const emailErr    = validateEmail(cleanEmail);
    const passwordErr = validatePassword(password);

    if (nameErr)     throw new Error(nameErr);
    if (phoneErr)    throw new Error(phoneErr);
    if (emailErr)    throw new Error(emailErr);
    if (passwordErr) throw new Error(passwordErr);

    /* ─── فحص التكرار ─── */
    const existingPhone = db.prepare(
        "SELECT id FROM users WHERE phone = ?"
    ).get(cleanPhone);

    if (existingPhone) {
        throw new Error("رقم الهاتف مسجل بالفعل");
    }

    if (cleanEmail) {
        const existingEmail = db.prepare(
            "SELECT id FROM users WHERE LOWER(email) = ?"
        ).get(cleanEmail);

        if (existingEmail) {
            throw new Error("البريد الإلكتروني مسجل بالفعل");
        }
    }

    /* ─── Hash (async) ─── */
    const passwordHash = await hashPassword(password);

    /* ─── إنشاء الحساب داخل معاملة ─── */
    const uid = generateUID();
    const now = new Date().toISOString();

    const insertUser = db.prepare(`
        INSERT INTO users
            (uid, name, phone, email, company, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?)
    `);

    let userId;
    try {
        const result = insertUser.run(
            uid, cleanName, cleanPhone, cleanEmail,
            cleanCompany, passwordHash, now, now
        );
        userId = result.lastInsertRowid;
    } catch (err) {
        // تعامل مع race condition على UNIQUE
        if (err.message.includes("UNIQUE") || err.message.includes("constraint")) {
            throw new Error("الحساب موجود بالفعل");
        }
        throw err;
    }

    /* ─── سجل النشاط (بعد الإنشاء) ─── */
    logActivity(userId, "user.register", "تسجيل حساب جديد", {
        email: cleanEmail,
        company: cleanCompany
    });

    /* ─── أعِد بيانات المستخدم فقط ─── */
    return db.prepare(`
        SELECT id, uid, name, phone, email, company, role,
               is_active, created_at
        FROM users WHERE id = ?
    `).get(userId);
}

/* ═══════════════ Login ═══════════════ */

/**
 * تسجيل الدخول (async)
 * @param {string} identifier - بريد إلكتروني أو رقم هاتف
 * @param {string} password
 * @returns {Promise<Object>} - بيانات المستخدم
 */
async function loginUser(identifier, password) {
    if (!identifier || !password) {
        throw new Error("بيانات الدخول غير صحيحة");
    }

    const cleanId = String(identifier).trim();

    /* ─── ابحث بالهاتف أو البريد ─── */
    const user = db.prepare(`
        SELECT * FROM users
        WHERE phone = ? OR LOWER(email) = LOWER(?)
        LIMIT 1
    `).get(normalizePhone(cleanId), cleanId);

    /* ─── Timing-safe: قارن دائماً حتى لو لم يوجد المستخدم ─── */
    const hashToCheck = user?.password_hash || DUMMY_HASH;
    const passwordValid = await verifyPassword(password, hashToCheck);

    /* ─── رسالة واحدة لكل الحالات (منع Enumeration) ─── */
    const GENERIC_ERROR = "بيانات الدخول غير صحيحة";

    if (!user) {
        throw new Error(GENERIC_ERROR);
    }

    if (!passwordValid) {
        // سجّل المحاولة الفاشلة
        logActivity(user.id, "auth.login.failed", "محاولة دخول فاشلة", {
            identifier: cleanId
        });
        throw new Error(GENERIC_ERROR);
    }

    /* ─── فحص التنشيط ─── */
    if (user.is_active === 0) {
        logActivity(user.id, "auth.login.blocked", "محاولة دخول لحساب معطّل");
        throw new Error("الحساب معطّل. راجع الإدارة.");
    }

    /* ─── تحديث آخر دخول ─── */
    db.prepare(`
        UPDATE users SET last_login_at = datetime('now') WHERE id = ?
    `).run(user.id);

    /* ─── سجل النشاط ─── */
    logActivity(user.id, "auth.login.success", "تسجيل دخول ناجح");

    /* ─── أعِد بدون password_hash ─── */
    const { password_hash, ...safeUser } = user;
    return safeUser;
}

/* ═══════════════ Session Helper ═══════════════ */

/**
 * إرفاق المستخدم بالجلسة مع إعادة توليد Session ID
 * (يمنع Session Fixation)
 * @param {Object} req - Express request
 * @param {Object} user - بيانات المستخدم (بدون password_hash)
 * @returns {Promise<void>}
 */
function attachSession(req, user) {
    return new Promise((resolve, reject) => {
        if (!req.session) {
            return reject(new Error("الجلسة غير متاحة"));
        }

        // احتفظ ببعض البيانات قبل التجديد
        const sessionUser = {
            id:    user.id,
            uid:   user.uid,
            name:  user.name,
            phone: user.phone,
            email: user.email,
            role:  user.role
        };

        req.session.regenerate((err) => {
            if (err) return reject(err);

            req.session.user = sessionUser;
            req.session.loginAt = Date.now();

            req.session.save((saveErr) => {
                if (saveErr) return reject(saveErr);
                resolve();
            });
        });
    });
}

/**
 * إنهاء الجلسة بأمان
 */
function destroySession(req) {
    return new Promise((resolve) => {
        if (!req.session) return resolve();

        req.session.destroy((err) => {
            if (err) console.warn("[auth] destroySession:", err.message);
            resolve();
        });
    });
}

/* ═══════════════ Middleware ═══════════════ */

/**
 * يتطلب تسجيل الدخول
 */
function requireLogin(req, res, next) {
    if (!req.session?.user) {
        return res.status(401).json({
            success: false,
            message: "يجب تسجيل الدخول"
        });
    }
    next();
}

/**
 * يتطلب صلاحية admin أو owner
 */
function requireAdmin(req, res, next) {
    const role = req.session?.user?.role;

    if (!role) {
        return res.status(401).json({
            success: false,
            message: "يجب تسجيل الدخول"
        });
    }

    if (!["admin", "owner"].includes(role)) {
        // سجّل محاولة الوصول غير المصرّح
        logActivity(
            req.session.user.id,
            "auth.admin.denied",
            "محاولة وصول غير مصرّح للوحة الإدارة"
        );

        return res.status(403).json({
            success: false,
            message: "صلاحيات الإدارة مطلوبة"
        });
    }

    next();
}

/**
 * يتطلب صلاحية owner فقط
 */
function requireOwner(req, res, next) {
    if (req.session?.user?.role !== "owner") {
        return res.status(403).json({
            success: false,
            message: "صلاحيات المالك مطلوبة"
        });
    }
    next();
}

/**
 * يتطلب صلاحية engineer أو أعلى
 */
function requireEngineer(req, res, next) {
    const role = req.session?.user?.role;
    if (!["engineer", "admin", "owner"].includes(role)) {
        return res.status(403).json({
            success: false,
            message: "صلاحيات المهندس مطلوبة"
        });
    }
    next();
}

/* ═══════════════ Activity Logging ═══════════════ */

/**
 * تسجيل نشاط المستخدم
 * @param {number} userId
 * @param {string} action
 * @param {string} description
 * @param {Object} [metadata]
 * @param {Object} [req] - optional Express request for IP/UA
 */
function logActivity(userId, action, description, metadata = {}, req = null) {
    try {
        if (!userId) return;

        const metadataStr = metadata && Object.keys(metadata).length
            ? JSON.stringify(metadata).slice(0, 4000)
            : null;

        const ipAddress = req?.ip
            || req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
            || req?.connection?.remoteAddress
            || null;

        const userAgent = req?.headers?.["user-agent"]?.slice(0, 500) || null;

        db.prepare(`
            INSERT INTO activity
                (user_id, action, description, metadata, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            String(action).slice(0, 100),
            description ? String(description).slice(0, 500) : null,
            metadataStr,
            ipAddress,
            userAgent
        );

    } catch (err) {
        console.error("[auth] logActivity failed:", err.message);
    }
}

/* ═══════════════ Change password ═══════════════ */

/**
 * تغيير كلمة المرور
 */
async function changePassword(userId, oldPassword, newPassword) {
    if (!userId) throw new Error("معرّف المستخدم مطلوب");

    const pwdErr = validatePassword(newPassword);
    if (pwdErr) throw new Error(pwdErr);

    const user = db.prepare(
        "SELECT id, password_hash FROM users WHERE id = ?"
    ).get(userId);

    if (!user) throw new Error("المستخدم غير موجود");

    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) throw new Error("كلمة المرور الحالية غير صحيحة");

    if (oldPassword === newPassword) {
        throw new Error("كلمة المرور الجديدة مطابقة للحالية");
    }

    const newHash = await hashPassword(newPassword);

    db.prepare(`
        UPDATE users
        SET password_hash = ?, updated_at = datetime('now')
        WHERE id = ?
    `).run(newHash, userId);

    logActivity(userId, "user.password.changed", "تغيير كلمة المرور");
    return true;
}

/* ═══════════════ Reset password (admin) ═══════════════ */

/**
 * إعادة تعيين كلمة مرور مستخدم (بصلاحية admin)
 */
async function resetUserPassword(adminId, targetUserId, newPassword) {
    const pwdErr = validatePassword(newPassword);
    if (pwdErr) throw new Error(pwdErr);

    const target = db.prepare(
        "SELECT id FROM users WHERE id = ?"
    ).get(targetUserId);

    if (!target) throw new Error("المستخدم غير موجود");

    const newHash = await hashPassword(newPassword);

    db.prepare(`
        UPDATE users
        SET password_hash = ?, updated_at = datetime('now')
        WHERE id = ?
    `).run(newHash, targetUserId);

    logActivity(adminId, "admin.user.password.reset",
        `إعادة تعيين كلمة مرور المستخدم #${targetUserId}`);
    return true;
}

/* ═══════════════ Exports ═══════════════ */

module.exports = {
    // Password utilities
    hashPassword,
    verifyPassword,
    hashPasswordSync,

    // Normalization
    normalizePhone,
    normalizeEmail,
    normalizeName,

    // Validation
    validatePhone,
    validateEmail,
    validatePassword,
    validateName,

    // User CRUD
    registerUser,
    loginUser,
    changePassword,
    resetUserPassword,

    // Session helpers
    attachSession,
    destroySession,

    // Middleware
    requireLogin,
    requireAdmin,
    requireOwner,
    requireEngineer,

    // Logging
    logActivity,

    // Constants
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH
};
