/* ============================================================
   Acoustic Engineering — js/auth.js v2.0.0
   Auth layer on top of backend — إصلاحات جوهرية
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    /* ═══════════════ Dynamic resolution (لا تجميد) ═══════════════ */

    function getConfig() {
        return AE.config || window.AcousticConfig || {};
    }

    function getBackend() {
        return AE.backend
            || window.AcousticBackend
            || window.AcousticAPI
            || null;
    }

    /* ═══════════════ State ═══════════════ */

    const state = {
        initialized: false,
        ready: false,
        authenticated: false,
        user: null,
        profile: null,
        role: "visitor",
        loading: true,
        offline: false,
        loginAt: null
    };

    /* ═══════════════ Ready Promise ═══════════════ */
    let resolveReady;
    const readyPromise = new Promise(resolve => { resolveReady = resolve; });

    /* ═══════════════ Events ═══════════════ */

    function emit(name, detail = {}) {
        try {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        } catch (err) {
            console.warn("[Auth] emit failed:", name, err);
        }
    }

    function getSnapshot() {
        return {
            user: state.user,
            profile: state.profile,
            role: state.role,
            authenticated: !!state.authenticated,
            ready: state.ready,
            loading: state.loading,
            loginAt: state.loginAt
        };
    }

    /* ═══════════════ Role helpers ═══════════════ */

    function getRole() {
        return state.profile?.role
            || state.user?.role
            || state.role
            || "visitor";
    }

    function isAdmin()    { return ["admin", "owner"].includes(getRole()); }
    function isEngineer() { return ["engineer", "admin", "owner"].includes(getRole()); }
    function isOwner()    { return getRole() === "owner"; }
    function isVisitor()  { return getRole() === "visitor"; }

    const ROLE_HIERARCHY = Object.freeze({
        visitor: 0,
        user: 1,
        engineer: 2,
        admin: 3,
        owner: 4
    });

    function hasRole(role) {
        if (!role) return true;
        const current = getRole();
        const currentLevel = ROLE_HIERARCHY[current] ?? 0;
        const targetLevel = ROLE_HIERARCHY[role] ?? 0;
        return currentLevel >= targetLevel;
    }

    /* ═══════════════ Return URL ═══════════════ */

    const RETURN_URL_KEY = "acoustic_return_url";

    function setReturnUrl(url) {
        try {
            if (url && typeof url === "string") {
                sessionStorage.setItem(RETURN_URL_KEY, url);
            }
        } catch { /* ignore */ }
    }

    function getReturnUrl() {
        try { return sessionStorage.getItem(RETURN_URL_KEY); }
        catch { return null; }
    }

    function clearReturnUrl() {
        try { sessionStorage.removeItem(RETURN_URL_KEY); }
        catch { /* ignore */ }
    }

    /* ═══════════════ Core operations ═══════════════ */

    async function register(data) {
        const Backend = getBackend();
        if (!Backend?.auth?.register) {
            throw new Error("نظام المصادقة غير متاح");
        }

        const result = await Backend.auth.register(data);

        if (result?.success) {
            state.user = result.user || null;
            state.profile = result.user || null;
            state.role = result.user?.role || "user";
            state.authenticated = true;
            state.loginAt = Date.now();

            emit("auth:registered", { user: state.user });
            emit("auth:changed", getSnapshot());
        }

        return result;
    }

    async function login(identifier, password) {
        const Backend = getBackend();
        if (!Backend?.auth?.login) {
            throw new Error("نظام المصادقة غير متاح");
        }

        const result = await Backend.auth.login(identifier, password);

        if (result?.success) {
            state.user = result.user || null;
            state.profile = result.user || null;
            state.role = result.user?.role || "user";
            state.authenticated = true;
            state.loginAt = Date.now();

            emit("auth:login", { user: state.user });
            emit("auth:changed", getSnapshot());
        }

        return result;
    }

    async function logout() {
        const Backend = getBackend();

        try {
            if (Backend?.auth?.logout) {
                await Backend.auth.logout();
            }
        } catch (err) {
            console.warn("[Auth] logout backend error:", err);
        }

        // امسح الحالة محلياً دائماً — حتى لو فشل الخادم
        state.user = null;
        state.profile = null;
        state.role = "visitor";
        state.authenticated = false;
        state.loginAt = null;

        clearReturnUrl();

        emit("auth:logout");
        emit("auth:changed", getSnapshot());

        return { success: true };
    }

    async function resetPassword(email) {
        const Backend = getBackend();

        if (!Backend?.auth?.resetPassword) {
            return {
                success: false,
                message: "خدمة استعادة كلمة المرور غير متاحة"
            };
        }

        try {
            return await Backend.auth.resetPassword(email);
        } catch (err) {
            return {
                success: false,
                message: err?.message || "تعذّر إرسال رابط الاستعادة"
            };
        }
    }

    /* ═══════════════ Page protection ═══════════════ */

    function protectPage(options = {}) {
        const requireAuth = options.requireAuth !== false;
        const requiredRole = options.role || null;
        const redirectTo = options.redirectTo
            || getConfig().routes?.register
            || "register.html";

        if (!requireAuth) return true;

        if (!state.authenticated) {
            // احفظ الصفحة الحالية للعودة بعد الدخول
            try {
                setReturnUrl(location.pathname + location.search);
            } catch { /* ignore */ }

            window.location.href = redirectTo;
            return false;
        }

        if (requiredRole && !hasRole(requiredRole)) {
            emit("auth:denied", { role: requiredRole, current: getRole() });
            window.location.href = "app.html";
            return false;
        }

        return true;
    }

    function continueAfterLogin(fallback = "app.html") {
        const target = getReturnUrl() || fallback;
        clearReturnUrl();
        window.location.href = target;
    }

    /* ═══════════════ Subscription ═══════════════ */

    function onAuthStateChanged(cb) {
        if (typeof cb !== "function") return () => {};

        // أطلق القيمة الحالية فوراً
        try { cb(getSnapshot()); } catch (err) {
            console.warn("[Auth] initial onAuthStateChanged error:", err);
        }

        const handler = (e) => {
            try { cb(e.detail || getSnapshot()); } catch (err) {
                console.warn("[Auth] onAuthStateChanged error:", err);
            }
        };

        window.addEventListener("auth:changed", handler);
        return () => window.removeEventListener("auth:changed", handler);
    }

    /* ═══════════════ Initialization ═══════════════ */

    let initializePromise = null;

    async function initialize() {
        // idempotent — أعِد نفس الوعد عند الاستدعاء الثاني
        if (state.initialized) {
            return initializePromise || Promise.resolve(state);
        }

        state.initialized = true;
        state.loading = true;

        initializePromise = (async () => {
            try {
                const Backend = getBackend();

                if (Backend?.auth?.getCurrentUser) {
                    // timeout 5 ثواني
                    const user = await Promise.race([
                        Promise.resolve(Backend.auth.getCurrentUser()),
                        new Promise((_, rej) =>
                            setTimeout(() => rej(new Error("timeout")), 5000)
                        )
                    ]);

                    if (user) {
                        state.user = user;
                        state.profile = user;
                        state.role = user.role || "user";
                        state.authenticated = true;
                        state.loginAt = Date.now();
                    }
                }
            } catch (err) {
                console.warn("[Auth] initialize failed:", err);
                state.offline = err?.message === "timeout";
            } finally {
                state.loading = false;
                state.ready = true;

                const snapshot = getSnapshot();
                emit("auth:ready", snapshot);
                emit("auth:changed", snapshot);

                try { resolveReady(state); } catch { /* ignore */ }
            }

            return state;
        })();

        return initializePromise;
    }

    /**
     * وعد يُحل عند اكتمال التهيئة
     * يُستخدم عندما يحتاج الكود الانتظار قبل الفحص
     */
    function waitUntilReady() {
        return readyPromise;
    }

    /**
     * أعد التحقق من الجلسة (يُستخدَم عند العودة للتبويب)
     */
    async function refresh() {
        if (!state.authenticated) return state;

        try {
            const Backend = getBackend();
            if (!Backend?.auth?.getCurrentUser) return state;

            const user = await Promise.resolve(
                Backend.auth.getCurrentUser()
            );

            if (!user) {
                // الجلسة انتهت على الخادم
                state.user = null;
                state.profile = null;
                state.role = "visitor";
                state.authenticated = false;

                emit("auth:changed", getSnapshot());
                emit("auth:expired");
            } else {
                state.user = user;
                state.profile = user;
                state.role = user.role || state.role;
                emit("auth:changed", getSnapshot());
            }
        } catch (err) {
            console.warn("[Auth] refresh failed:", err);
        }

        return state;
    }

    /* ═══════════════ Validators ═══════════════ */

    function validateEmail(email) {
        const cfg = getConfig();
        if (typeof cfg.isValidEmail === "function") {
            return cfg.isValidEmail(email);
        }
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
    }

    function validatePassword(password) {
        const cfg = getConfig();
        if (typeof cfg.isValidPassword === "function") {
            return cfg.isValidPassword(password);
        }
        // ✅ 8 أحرف — يطابق server/auth.js
        return String(password || "").length >= 8;
    }

    function validatePhone(phone) {
        const cfg = getConfig();
        if (typeof cfg.isValidPhone === "function") {
            return cfg.isValidPhone(phone);
        }
        return /^[+]?[0-9\s\-()]{7,30}$/.test(String(phone || ""));
    }

    /* ═══════════════ API Export ═══════════════ */

    const AuthAPI = {
        // الحالة
        state,
        getSnapshot,

        // التهيئة
        initialize,
        waitUntilReady,
        refresh,

        // العمليات
        register,
        login,
        logout,
        resetPassword,

        // المستخدم
        getCurrentUser: () => state.user,
        getProfile: () => state.profile,
        isAuthenticated: () => !!state.authenticated,

        // الأدوار
        getRole,
        isAdmin,
        isEngineer,
        isOwner,
        isVisitor,
        hasRole,

        // الحماية
        protectPage,
        continueAfterLogin,

        // العودة
        getReturnUrl,
        setReturnUrl,
        clearReturnUrl,

        // الاشتراك
        onAuthStateChanged,

        // التحقق
        validateEmail,
        validatePassword,
        validatePhone
    };

    /* ═══════════════ Exposure (متعدد) ═══════════════ */
    AE.auth = AuthAPI;
    window.AcousticAuth = AuthAPI;
    window.AuthManager = AuthAPI;
    window.Auth = window.Auth || AuthAPI;

    /* ═══════════════ Auto-init ═══════════════ */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initialize().catch(err => {
                console.warn("[Auth] auto-init failed:", err);
            });
        }, { once: true });
    } else {
        initialize().catch(err => {
            console.warn("[Auth] auto-init failed:", err);
        });
    }

    /* ═══════════════ Visibility refresh ═══════════════ */
    let lastHidden = 0;
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            lastHidden = Date.now();
        } else if (
            document.visibilityState === "visible"
            && lastHidden > 0
            && Date.now() - lastHidden > 30000
            && state.authenticated
        ) {
            refresh().catch(() => { /* ignore */ });
        }
    });

    console.log("[auth.js] v2.0.0 جاهز");

})();
