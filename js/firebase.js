/* ============================================================
   Acoustic Engineering — js/firebase.js
   Firebase Core / Auth / Database / Storage
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;
    const CONFIG = AE.config || window.AcousticConfig || {};

    const FIREBASE_VERSION = "10.14.1";
    const FIREBASE_CDN = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/";

    const state = {
        available: false, initialized: false, configured: false, offline: false,
        app: null, auth: null, database: null, storage: null,
        currentUser: null, authReady: false
    };

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === "true") { resolve(); return; }
                existing.addEventListener("load", resolve, { once: true });
                existing.addEventListener("error", reject, { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = src; script.async = true; script.defer = true;
            script.onload = function () { script.dataset.loaded = "true"; resolve(); };
            script.onerror = function () { reject(new Error("Failed to load: " + src)); };
            document.head.appendChild(script);
        });
    }

    async function loadFirebaseSDK() {
        if (window.firebase && window.firebase.initializeApp) return true;
        try {
            await loadScript(FIREBASE_CDN + "firebase-app-compat.js");
            await loadScript(FIREBASE_CDN + "firebase-auth-compat.js");
            await loadScript(FIREBASE_CDN + "firebase-database-compat.js");
            await loadScript(FIREBASE_CDN + "firebase-storage-compat.js");
            return true;
        } catch (e) { console.error("Firebase SDK load failed:", e); return false; }
    }

    function isConfigured() {
        if (CONFIG.firebase && typeof CONFIG.isFirebaseConfigured === "function") return CONFIG.isFirebaseConfigured();
        const c = CONFIG.firebase?.config || {};
        return !!(c.apiKey && c.authDomain && c.projectId && c.appId && c.databaseURL);
    }

    function enableOfflineMode() {
        state.available = false; state.initialized = true; state.configured = false;
        state.offline = true; state.authReady = true;
        console.warn("Firebase not configured. Local mode enabled.");
        dispatchEvent("firebase:offline", { reason: "Firebase unavailable" });
    }

    function dispatchEvent(name, detail = {}) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    }

    async function initialize() {
        if (state.initialized) return state;
        state.configured = isConfigured();
        if (!state.configured) { enableOfflineMode(); return state; }

        const sdkLoaded = await loadFirebaseSDK();
        if (!sdkLoaded || !window.firebase) { enableOfflineMode(); return state; }

        try {
            const firebaseConfig = CONFIG.firebase.config;
            if (window.firebase.apps && window.firebase.apps.length) {
                state.app = window.firebase.app();
            } else {
                state.app = window.firebase.initializeApp(firebaseConfig);
            }
            state.auth = window.firebase.auth();
            state.database = window.firebase.database();
            state.storage = window.firebase.storage();
            state.available = true; state.initialized = true;
            state.offline = false; state.authReady = false;
            configureAuthPersistence();
            setupAuthObserver();
            dispatchEvent("firebase:ready", { app: state.app });
            return state;
        } catch (e) {
            console.error("Firebase init error:", e);
            enableOfflineMode();
            return state;
        }
    }

    async function configureAuthPersistence() {
        if (!state.auth) return false;
        try {
            const persistence = CONFIG.firebase?.auth?.persistence || "local";
            if (persistence === "session") {
                await state.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
            } else {
                await state.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            }
            return true;
        } catch (e) { console.warn("Persistence failed:", e); return false; }
    }

    function setupAuthObserver() {
        if (!state.auth) { state.authReady = true; return; }
        state.auth.onAuthStateChanged(function (user) {
            state.currentUser = user || null;
            state.authReady = true;
            dispatchEvent("auth:changed", { user: user || null, authenticated: !!user });
        });
    }

    async function register(email, password) {
        if (!state.auth) return { success: false, offline: true, user: null, error: "Firebase Auth unavailable." };
        try {
            const result = await state.auth.createUserWithEmailAndPassword(String(email).trim().toLowerCase(), String(password));
            return { success: true, user: result.user, error: null };
        } catch (e) {
            return { success: false, user: null, error: normalizeFirebaseError(e), code: e.code || null };
        }
    }

    async function login(email, password) {
        if (!state.auth) return { success: false, offline: true, user: null, error: "Firebase Auth unavailable." };
        try {
            const result = await state.auth.signInWithEmailAndPassword(String(email).trim().toLowerCase(), String(password));
            return { success: true, user: result.user, error: null };
        } catch (e) {
            return { success: false, user: null, error: normalizeFirebaseError(e), code: e.code || null };
        }
    }

    async function logout() {
        if (!state.auth) { state.currentUser = null; return { success: true, offline: true }; }
        try { await state.auth.signOut(); return { success: true }; }
        catch (e) { return { success: false, error: normalizeFirebaseError(e) }; }
    }

    async function resetPassword(email) {
        if (!state.auth) return { success: false, error: "Firebase Auth unavailable." };
        try {
            await state.auth.sendPasswordResetEmail(String(email).trim().toLowerCase());
            return { success: true };
        } catch (e) { return { success: false, error: normalizeFirebaseError(e) }; }
    }

    function getCurrentUser() {
        return state.currentUser || (state.auth ? state.auth.currentUser : null);
    }
    function isAuthenticated() { return !!getCurrentUser(); }
    function getCurrentUserId() {
        const u = getCurrentUser();
        return u ? u.uid : null;
    }

    function databaseRef(path = "") {
        if (!state.database) return null;
        const root = CONFIG.firebase?.database?.root || "acousticEngineering";
        const cleanPath = String(path).replace(/^\/+/, "");
        const finalPath = cleanPath ? `${root}/${cleanPath}` : root;
        return state.database.ref(finalPath);
    }

    async function set(path, data) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true, error: "DB unavailable." };
        try { await ref.set(data); return { success: true, error: null }; }
        catch (e) { return { success: false, error: normalizeFirebaseError(e), code: e.code || null }; }
    }

    async function update(path, data) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true, error: "DB unavailable." };
        try { await ref.update(data); return { success: true }; }
        catch (e) { return { success: false, error: normalizeFirebaseError(e) }; }
    }

    async function push(path, data) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true, key: null, error: "DB unavailable." };
        try {
            const pushed = ref.push();
            await pushed.set(data);
            return { success: true, key: pushed.key };
        } catch (e) { return { success: false, key: null, error: normalizeFirebaseError(e) }; }
    }

    async function get(path) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true, data: null, error: "DB unavailable." };
        try {
            const snapshot = await ref.once("value");
            return { success: true, exists: snapshot.exists(), data: snapshot.val() };
        } catch (e) { return { success: false, data: null, error: normalizeFirebaseError(e) }; }
    }

    async function remove(path) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true };
        try { await ref.remove(); return { success: true }; }
        catch (e) { return { success: false, error: normalizeFirebaseError(e) }; }
    }

    function userPath(uid, section = "") {
        const base = `users/${String(uid || "").trim()}`;
        return section ? `${base}/${section}` : base;
    }

    async function saveUserProfile(uid, profile) {
        if (!uid) return { success: false, error: "User ID required." };
        const clean = { ...profile, uid, updatedAt: Date.now() };
        return update(userPath(uid), clean);
    }

    async function getUserProfile(uid) {
        if (!uid) return { success: false, data: null };
        return get(userPath(uid));
    }

    function projectPath(projectId) { return `projects/${projectId}`; }

    async function saveProject(projectId, project) {
        if (!projectId) return { success: false, error: "Project ID required." };
        const uid = getCurrentUserId();
        const payload = { ...project, id: projectId, ownerId: project.ownerId || uid || null, updatedAt: Date.now() };
        return set(projectPath(projectId), payload);
    }

    async function getProject(projectId) {
        if (!projectId) return { success: false, data: null };
        return get(projectPath(projectId));
    }

    async function deleteProject(projectId) {
        if (!projectId) return { success: false };
        return remove(projectPath(projectId));
    }

    async function saveRegistration(registration) {
        const payload = { ...registration, createdAt: registration.createdAt || Date.now(), updatedAt: Date.now() };
        return push("registrations", payload);
    }

    async function saveReport(reportId, report) {
        if (!reportId) return { success: false };
        return set(`reports/${reportId}`, { ...report, id: reportId, updatedAt: Date.now() });
    }

    function storageRef(path = "") {
        if (!state.storage) return null;
        const root = CONFIG.firebase?.storage?.root || "acoustic-engineering";
        const cleanPath = String(path).replace(/^\/+/, "");
        const finalPath = cleanPath ? `${root}/${cleanPath}` : root;
        return state.storage.ref(finalPath);
    }

    async function uploadFile(path, file, metadata = {}) {
        const ref = storageRef(path);
        if (!ref) return { success: false, offline: true, error: "Storage unavailable." };
        if (!file) return { success: false, error: "No file supplied." };
        try {
            const snapshot = await ref.put(file, metadata);
            const url = await snapshot.ref.getDownloadURL();
            return { success: true, url, path: snapshot.ref.fullPath, metadata: snapshot.metadata };
        } catch (e) { return { success: false, url: null, error: normalizeFirebaseError(e), code: e.code || null }; }
    }

    async function deleteFile(path) {
        const ref = storageRef(path);
        if (!ref) return { success: false, offline: true };
        try { await ref.delete(); return { success: true }; }
        catch (e) { return { success: false, error: normalizeFirebaseError(e) }; }
    }

    function normalizeFirebaseError(error) {
        if (!error) return "Unknown Firebase error.";
        const code = error.code || "";
        const messages = {
            "auth/email-already-in-use": "البريد مستخدم بالفعل.",
            "auth/invalid-email": "البريد غير صحيح.",
            "auth/weak-password": "كلمة المرور ضعيفة.",
            "auth/user-not-found": "المستخدم غير موجود.",
            "auth/wrong-password": "كلمة المرور غير صحيحة.",
            "auth/invalid-credential": "بيانات غير صحيحة.",
            "auth/too-many-requests": "محاولات كثيرة. حاول لاحقاً.",
            "auth/network-request-failed": "تعذر الاتصال بالشبكة.",
            "auth/unauthorized-domain": "النطاق غير مصرح به. أضف motivity-ai.github.io في Authorized Domains.",
            "permission-denied": "ليس لديك صلاحية.",
            "storage/unauthorized": "صلاحية الرفع مرفوضة.",
            "storage/quota-exceeded": "تجاوزت مساحة التخزين."
        };
        return messages[code] || error.message || "حدث خطأ في Firebase.";
    }

    const FirebaseAPI = {
        state, initialize, loadFirebaseSDK, isConfigured, isAuthenticated,
        getCurrentUser, getCurrentUserId, register, login, logout, resetPassword,
        databaseRef, set, update, push, get, remove,
        saveUserProfile, getUserProfile, saveProject, getProject, deleteProject,
        saveRegistration, saveReport, storageRef, uploadFile, deleteFile,
        normalizeFirebaseError
    };

    AE.firebase = FirebaseAPI;
    window.AcousticFirebase = FirebaseAPI;

    function boot() {
        initialize().catch(function (e) {
            console.error("Firebase boot error:", e);
            enableOfflineMode();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else { boot(); }
})();
