/* ============================================================
   Acoustic Engineering — server/auth.js
   ============================================================ */
"use strict";
const bcrypt = require("bcryptjs");
const db = require("./database");

function hashPassword(p) { return bcrypt.hashSync(p, 12); }
function verifyPassword(p, h) { return bcrypt.compareSync(p, h); }

function registerUser({ name, phone, email, company, password }) {
    if (!name || !phone || !password) throw new Error("الاسم ورقم الهاتف وكلمة المرور مطلوبة");
    if (password.length < 6) throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    if (db.prepare("SELECT id FROM users WHERE phone = ?").get(phone)) throw new Error("رقم الهاتف مسجل بالفعل");

    const uid = "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const result = db.prepare("INSERT INTO users (uid, name, phone, email, company, password_hash) VALUES (?, ?, ?, ?, ?, ?)").run(
        uid, name, phone, email || null, company || null, hashPassword(password)
    );
    return db.prepare("SELECT id, uid, name, phone, email, company, role, created_at FROM users WHERE id = ?").get(result.lastInsertRowid);
}

function loginUser(phone, password) {
    const user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
    if (!user || !verifyPassword(password, user.password_hash)) throw new Error("بيانات الدخول غير صحيحة");
    delete user.password_hash;
    return user;
}

function requireLogin(req, res, next) {
    if (!req.session?.user) return res.status(401).json({ success: false, message: "يجب تسجيل الدخول" });
    next();
}
function requireAdmin(req, res, next) {
    if (!req.session?.user || req.session.user.role !== "admin") return res.status(403).json({ success: false, message: "صلاحيات الإدارة مطلوبة" });
    next();
}
function logActivity(userId, action, description, metadata = {}) {
    try { db.prepare("INSERT INTO activity (user_id, action, description, metadata) VALUES (?, ?, ?, ?)").run(userId, action, description, JSON.stringify(metadata)); } catch {}
}

module.exports = { hashPassword, verifyPassword, registerUser, loginUser, requireLogin, requireAdmin, logActivity };