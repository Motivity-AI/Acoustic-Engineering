/* ============================================================
   Acoustic Engineering — js/auth.js v2.0.0
   Auth layer on top of backend
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    function getConfig() {
        return AE.config || window.AcousticConfig || {};
    }

    /* ✅ Backend resolution ديناميكي — لا تجميد */
    function getBackend() {
        return AE.backend
            || window.AcousticBackend
            || window.AcousticAPI
            || null;
    }

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

    let resolveReady;
    const readyPromise = new Promise(resolve => { resolveReady = resolve; });

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

    function getRole() {
        return state.profile?.role || state.user?.role || state.role || "visitor";
    }

    function isAdmin()    { return ["admin", "owner"].includes(getRole()); }
    function isEngineer() { return ["engineer", "admin", "owner"].includes(getRole()); }
    function isOwner()    { return getRole() === "owner"; }
    function isVisitor()  { return getRole() === "visitor"; }

    const ROLE_HIERARCHY = Object.freeze({
        visitor: 0, user: 1, engineer: 2, admin: 3, owner: 4
    });

    function hasRole(role) {
        if (!role) return true;
        const currentLevel = ROLE_HIERARCHY[getRole()] ?? 0;
        const targetLevel = ROLE_HIERARCHY[role] ?? 0;
        return currentLevel >= targetLevel;
    }

    /* ─── Return URL ─── */
    const RETURN_URL_KEY = "acoustic_return_url";

    function setReturnUrl(url) {
        try { if (url) sessionStorage.setItem(RETURN_URL_KEY, url); } catch {}
    }
    function getReturnUrl() {
        try { return sessionStorage.getItem(RETURN_URL_KEY); } catch { return null; }
    }
    function clearReturnUrl() {
        try { sessionStorage.removeItem(RETURN_URL_KEY); } catch {}
    }

    /* ─── Core operations ─── */

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
            if (Backend?.auth?.logout) await Backend.auth.logout();
        } catch (err) {
            console.warn("[Auth] logout backend error:", err);
        }

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
            return { success: false, message: "خدمة استعادة كلمة المرور غير متاحة" };
        }
        try {
            return await Backend.auth.resetPassword(email);
        } catch (err) {
            return { success: false, message: err?.message || "تعذّر إرسال رابط الاستعادة" };
        }
    }

    function protectPage(options = {}) {
        const requireAuth = options.requireAuth !== false;
        const requiredRole = options.role || null;
        const redirectTo = options.redirectTo
            || getConfig().routes?.register
            || "register.html";

        if (!requireAuth) return true;

        if (!state.authenticated) {
            try { setReturnUrl(location.pathname + location.search); } catch {}
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

    function onAuthStateChanged(cb) {
        if (typeof cb !== "function") return () => {};

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

    let initializePromise = null;

    async function initialize() {
        if (state.initialized) {
            return initializePromise || Promise.resolve(state);
        }

        state.initialized = true;
        state.loading = true;

        initializePromise = (async () => {
            try {
                const Backend = getBackend();

                if (Backend?.waitForReady) {
                    try {
                        await Promise.race([
                            Backend.waitForReady(),
                            new Promise(r => setTimeout(r, 3000))
                        ]);
                    } catch {}
                }

                if (Backend?.auth?.getCurrentUser) {
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

                try { resolveReady(state); } catch {}
            }

            return state;
        })();

        return initializePromise;
    }

    function waitUntilReady() {
        return readyPromise;
    }

    async function refresh() {
        if (!state.authenticated) return state;

        try {
            const Backend = getBackend();
            if (!Backend?.auth?.getCurrentUser) return state;

            const user = await Promise.resolve(Backend.auth.getCurrentUser());

            if (!user) {
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

    function validateEmail(email) {
        const cfg = getConfig();
        if (typeof cfg.isValidEmail === "function") return cfg.isValidEmail(email);
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
    }

    function validatePassword(password) {
        const cfg = getConfig();
        if (typeof cfg.isValidPassword === "function") return cfg.isValidPassword(password);
        return String(password || "").length >= 8;
    }

    function validatePhone(phone) {
        const cfg = getConfig();
        if (typeof cfg.isValidPhone === "function") return cfg.isValidPhone(phone);
        return /^[+]?[0-9\s\-()]{7,30}$/.test(String(phone || ""));
    }

    const AuthAPI = {
        state,
        getSnapshot,
        initialize,
        waitUntilReady,
        refresh,
        register,
        login,
        logout,
        resetPassword,
        getCurrentUser: () => state.user,
        getProfile: () => state.profile,
        isAuthenticated: () => !!state.authenticated,
        getRole,
        isAdmin,
        isEngineer,
        isOwner,
        isVisitor,
        hasRole,
        protectPage,
        continueAfterLogin,
        getReturnUrl,
        setReturnUrl,
        clearReturnUrl,
        onAuthStateChanged,
        validateEmail,
        validatePassword,
        validatePhone
    };

    AE.auth = AuthAPI;
    window.AcousticAuth = AuthAPI;
    window.AuthManager = AuthAPI;
    window.Auth = window.Auth || AuthAPI;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initialize().catch(err => console.warn("[Auth] auto-init failed:", err));
        }, { once: true });
    } else {
        initialize().catch(err => console.warn("[Auth] auto-init failed:", err));
    }

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
            refresh().catch(() => {});
        }
    });

    console.log("[auth.js] v2.0.0 جاهز");

})();
