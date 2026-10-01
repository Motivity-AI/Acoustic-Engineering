/* ============================================================
   Acoustic Engineering — server/routes/auth.js v1.1.0
   ============================================================ */
"use strict";

const express = require("express");
const router = express.Router();

const {
    registerUser,
    loginUser,
    attachSession,
    destroySession,
    changePassword,
    resetUserPassword,
    requireLogin,
    requireAdmin,
    logActivity
} = require("../auth");

/* ═══════════════ Constants ═══════════════ */
const SESSION_COOKIE = "ae.sid";

/* ═══════════════ Helpers ═══════════════ */

/**
 * رسالة خطأ عامة (لا تسرّب تفاصيل DB)
 */
function safeAuthError(err, context = "generic") {
    const msg = String(err?.message || "").toLowerCase();

    /* ─── تحقق من أخطاء UNIQUE ─── */
    if (msg.includes("unique constraint") || msg.includes("already")) {
        if (msg.includes("phone")) return "رقم الهاتف مسجّل بالفعل";
        if (msg.includes("email")) return "البريد الإلكتروني مسجّل بالفعل";
        return "الحساب موجود بالفعل";
    }

    /* ─── تحقق من CHECK constraints ─── */
    if (msg.includes("check constraint")) {
        return "بيانات غير صالحة";
    }

    /* ─── أخطاء التحقق الخاصة بـ auth.js ─── */
    const VALIDATION_MESSAGES = [
        "الاسم",
        "رقم الهاتف",
        "البريد الإلكتروني",
        "كلمة المرور",
        "الاسم طويل",
        "الاسم قصير",
        "الحساب معطّل",
        "بيانات الدخول"
    ];

    for (const vm of VALIDATION_MESSAGES) {
        if (err.message.includes(vm)) return err.message;
    }

    /* ─── خطأ عام ─── */
    return "تعذّر إتمام العملية. تحقق من البيانات.";
}

/**
 * استخراج معرّف الدخول من الطلب (بريد أو هاتف)
 */
function extractIdentifier(body) {
    if (!body || typeof body !== "object") return null;

    // ترتيب الأولويات
    const candidates = [
        body.identifier,
        body.email,
        body.phone
    ];

    for (const c of candidates) {
        if (c && typeof c === "string" && c.trim()) {
            return c.trim();
        }
    }

    return null;
}

/**
 * استجابة موحّدة للمستخدم الآمن (بدون password_hash وأي حقول داخلية)
 */
function safeUser(user) {
    if (!user) return null;

    return {
        id: user.id,
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        company: user.company,
        role: user.role
    };
}

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/register
   ═══════════════════════════════════════════════════════════ */
router.post("/register", async (req, res) => {
    try {
        /* ─── التحقق من المدخلات ─── */
        const { name, phone, email, company, password, confirmPassword } = req.body || {};

        if (!name || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: "الاسم ورقم الهاتف وكلمة المرور مطلوبة"
            });
        }

        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "كلمتا المرور غير متطابقتين"
            });
        }

        /* ─── إنشاء الحساب (async) ─── */
        const user = await registerUser({
            name,
            phone,
            email,
            company,
            password
        });

        /* ─── إنشاء الجلسة بأمان (regenerate) ─── */
        await attachSession(req, user);

        /* ─── سجل النشاط (لا يحجب الرد) ─── */
        setImmediate(() => {
            logActivity(
                user.id,
                "user.register",
                "إنشاء حساب جديد",
                { email: user.email },
                req
            );
        });

        /* ─── الرد ─── */
        res.status(201).json({
            success: true,
            user: safeUser(user),
            message: "تم إنشاء الحساب بنجاح"
        });

    } catch (err) {
        console.error("[auth/register] error:", err);

        const message = safeAuthError(err, "register");
        const status = message.includes("مسجّل بالفعل") ? 409 : 400;

        res.status(status).json({
            success: false,
            message
        });
    }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/login
   ═══════════════════════════════════════════════════════════ */
router.post("/login", async (req, res) => {
    try {
        const { password } = req.body || {};
        const identifier = extractIdentifier(req.body);

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                message: "أدخل بيانات الدخول كاملة"
            });
        }

        /* ─── تسجيل الدخول (async) ─── */
        const user = await loginUser(identifier, password);

        /* ─── إنشاء الجلسة بأمان (regenerate) ─── */
        await attachSession(req, user);

        /* ─── سجل النشاط ─── */
        setImmediate(() => {
            logActivity(
                user.id,
                "auth.login.success",
                "تسجيل دخول ناجح",
                {},
                req
            );
        });

        /* ─── الرد ─── */
        res.json({
            success: true,
            user: safeUser(user),
            message: "تم تسجيل الدخول بنجاح"
        });

    } catch (err) {
        console.error("[auth/login] error:", err);

        /* ─── حاول تسجيل الفشل إن أمكن ─── */
        // لا نعرف user.id هنا لأنه فشل، لكن يمكن تسجيل الـ identifier
        // نحتفظ بهذا في auth.js (logActivity داخلياً عند الفشل)

        res.status(401).json({
            success: false,
            // ✅ رسالة عامة — لا تكشف وجود الحساب
            message: "بيانات الدخول غير صحيحة"
        });
    }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/logout
   ═══════════════════════════════════════════════════════════ */
router.post("/logout", async (req, res) => {
    const user = req.session?.user;

    try {
        /* ─── سجل النشاط قبل التدمير ─── */
        if (user) {
            setImmediate(() => {
                logActivity(
                    user.id,
                    "auth.logout",
                    "تسجيل خروج",
                    {},
                    req
                );
            });
        }

        /* ─── تدمير الجلسة ─── */
        await destroySession(req);

        /* ─── امسح الكوكي ─── */
        res.clearCookie(SESSION_COOKIE, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/"
        });

        res.json({
            success: true,
            message: "تم تسجيل الخروج"
        });

    } catch (err) {
        console.error("[auth/logout] error:", err);

        // حتى لو فشل destroySession، امسح الكوكي
        res.clearCookie(SESSION_COOKIE, { path: "/" });

        res.json({
            success: true,
            message: "تم تسجيل الخروج"
        });
    }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/auth/me — حالة الجلسة الحالية
   ═══════════════════════════════════════════════════════════ */
router.get("/me", (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const user = req.session?.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            user: null,
            message: "غير مسجّل الدخول"
        });
    }

    res.json({
        success: true,
        user: safeUser(user),
        loginAt: req.session.loginAt || null
    });
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/change-password — تغيير كلمة المرور
   ═══════════════════════════════════════════════════════════ */
router.post("/change-password", requireLogin, async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body || {};

        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "كلمة المرور الحالية والجديدة مطلوبتان"
            });
        }

        if (confirmPassword !== undefined && newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "كلمتا المرور الجديدتان غير متطابقتين"
            });
        }

        const userId = req.session.user.id;

        await changePassword(userId, oldPassword, newPassword);

        /* ─── جدّد الجلسة بعد التغيير (أمان) ─── */
        await attachSession(req, req.session.user);

        res.json({
            success: true,
            message: "تم تغيير كلمة المرور بنجاح"
        });

    } catch (err) {
        console.error("[auth/change-password] error:", err);

        const message = safeAuthError(err, "change-password");
        const status = message.includes("غير صحيحة") ? 401 : 400;

        res.status(status).json({
            success: false,
            message
        });
    }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/admin/reset-password — إعادة تعيين كلمة مرور
   (admin/owner فقط)
   ═══════════════════════════════════════════════════════════ */
router.post("/admin/reset-password", requireLogin, requireAdmin, async (req, res) => {
    try {
        const { userId, newPassword } = req.body || {};

        if (!userId || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "معرّف المستخدم وكلمة المرور الجديدة مطلوبان"
            });
        }

        await resetUserPassword(
            req.session.user.id,
            Number(userId),
            newPassword
        );

        res.json({
            success: true,
            message: "تم إعادة تعيين كلمة المرور"
        });

    } catch (err) {
        console.error("[auth/admin/reset-password] error:", err);

        const message = safeAuthError(err, "reset-password");
        const status = message.includes("غير موجود") ? 404 : 400;

        res.status(status).json({
            success: false,
            message
        });
    }
});

module.exports = router;
