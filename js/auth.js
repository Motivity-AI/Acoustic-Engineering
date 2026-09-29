/* ============================================================
   Acoustic Engineering — js/auth.js
   Auth layer on top of backend
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;
    const CONFIG = AE.config || window.AcousticConfig || {};
    const Backend = AE.backend || window.AcousticBackend || null;

    const state = {
        initialized: false, ready: false, authenticated: false,
        user: null, profile: null, role: "visitor", loading: true, offline: false
    };

    function emit(name, detail = {}) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    }

    function getRole() { return state.profile?.role || state.user?.role || state.role || "visitor"; }
    function isAdmin() { return ["admin", "owner"].includes(getRole()); }
    function isEngineer() { return ["engineer", "admin", "owner"].includes(getRole()); }
    function isOwner() { return getRole() === "owner"; }

    async function register(data) {
        if (!Backend) throw new Error("Backend layer not available");
        const result = await Backend.auth.register(data);
        if (result.success) {
            state.user = result.user;
            state.authenticated = true;
            emit("auth:registered", { user: result.user });
        }
        return result;
    }

    async function login(emailOrPhone, password) {
        if (!Backend) throw new Error("Backend layer not available");
        const result = await Backend.auth.login(emailOrPhone, password);
        if (result.success) {
            state.user = result.user;
            state.authenticated = true;
            emit("auth:login", { user: result.user });
        }
        return result;
    }

    async function logout() {
        if (Backend) await Backend.auth.logout();
        state.user = null; state.profile = null;
        state.role = "visitor"; state.authenticated = false;
        emit("auth:logout");
        return { success: true };
    }

    function protectPage(options = {}) {
        const requireAuth = options.requireAuth !== false;
        if (!requireAuth) return true;
        if (!state.authenticated) {
            window.location.href = CONFIG.routes?.register || "register.html";
            return false;
        }
        return true;
    }

    function hasRole(role) {
        const current = getRole();
        if (current === "owner") return true;
        if (current === role) return true;
        const hierarchy = { visitor: 0, user: 1, engineer: 2, admin: 3, owner: 4 };
        return (hierarchy[current] || 0) >= (hierarchy[role] || 0);
    }

    function continueAfterLogin(fallback = "app.html") { window.location.href = fallback; }
    function getReturnUrl() { try { return sessionStorage.getItem("acoustic_return_url"); } catch { return null; } }
    function clearReturnUrl() { try { sessionStorage.removeItem("acoustic_return_url"); } catch {} }

    function onAuthStateChanged(cb) {
        if (typeof cb !== "function") return () => {};
        const handler = (e) => cb(e.detail);
        window.addEventListener("auth:changed", handler);
        return () => window.removeEventListener("auth:changed", handler);
    }

    async function initialize() {
        if (state.initialized) return state;
        state.initialized = true;
        try {
            if (Backend) {
                const user = await Backend.auth.getCurrentUser();
                if (user) {
                    state.user = user;
                    state.profile = user;
                    state.role = user.role || "user";
                    state.authenticated = true;
                }
            }
        } catch (e) { console.warn("[Auth] Init failed:", e); }
        state.loading = false;
        state.ready = true;
        emit("auth:ready", {
            user: state.user, role: state.role,
            authenticated: state.authenticated
        });
        return state;
    }

    const AuthAPI = {
        state, initialize, register, login, logout,
        getCurrentUser: () => state.user,
        getProfile: () => state.profile,
        getRole, isAdmin, isEngineer, isOwner,
        isAuthenticated: () => state.authenticated,
        protectPage, hasRole, continueAfterLogin,
        getReturnUrl, clearReturnUrl, onAuthStateChanged,
        validateEmail: (e) => CONFIG.isValidEmail ? CONFIG.isValidEmail(e) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
        validatePassword: (p) => String(p || "").length >= 6,
        validatePhone: (p) => CONFIG.isValidPhone ? CONFIG.isValidPhone(p) : /^[+]?[0-9\s\-()]{7,30}$/.test(p)
    };

    AE.auth = AuthAPI;
    window.AcousticAuth = AuthAPI;
    window.AuthManager = AuthAPI;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => initialize(), { once: true });
    } else { initialize(); }
})();
