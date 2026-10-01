/* ============================================================
   Acoustic Engineering — js/firebase.js v2.0.0
   Firebase Core / Auth / Database / Storage
   ✅ getCurrentUser يدمج profile من DB (يحل مشكلة role)
   ✅ register يقبل بريداً أو هاتفاً (synthetic email)
   ✅ لا تعارض مع auth:changed من auth.js
   ✅ enableOfflineMode يُطلق firebase:ready
   ✅ waitForReady() promise
   ✅ caching لـ user profile
   ✅ timeout على العمليات الحرجة
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════ Resolution ═══════════════ */

    function getConfig() {
        return AE.config || window.AcousticConfig || {};
    }

    /* ═══════════════ Constants ═══════════════ */

    const FIREBASE_VERSION = "10.14.1";
    const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;

    const REQUIRED_MODULES = [
        "firebase-app-compat.js",
        "firebase-auth-compat.js",
        "firebase-database-compat.js",
        "firebase-storage-compat.js"
    ];

    const OPERATION_TIMEOUT_MS = 15000;
    const INIT_TIMEOUT_MS = 10000;
    const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

    const SYNTHETIC_EMAIL_DOMAIN = "acoustic-engineering.local";

    /* ═══════════════ State ═══════════════ */

    const state = {
        // حالة النظام
        available: false,      // SDK + app جاهز
        initialized: false,    // initialize() نُفِّذ
        configured: false,     // config صحيح
        offline: false,        // شبكة/تكوين غير متاح
        authReady: false,

        // Firebase objects
        app: null,
        auth: null,
        database: null,
        storage: null,

        // المستخدم الحالي (Firebase User)
        currentUser: null
    };

    /* ═══════════════ Ready Promise ═══════════════ */

    let resolveReady;
    const readyPromise = new Promise(resolve => { resolveReady = resolve; });
    let _ready = false;

    function waitForReady() {
        return readyPromise;
    }

    function markReady(payload) {
        if (_ready) return;
        _ready = true;
        try { resolveReady(payload); } catch { /* ignore */ }
    }

    /* ═══════════════ Events ═══════════════ */

    function emit(name, detail = {}) {
        try {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        } catch (err) {
            console.warn("[Firebase] emit failed:", name, err);
        }
    }

    /* ═══════════════ Timeout wrapper ═══════════════ */

    function withTimeout(promise, ms, label) {
        return Promise.race([
            Promise.resolve(promise),
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error(`${label || "العملية"} استغرقت وقتاً طويلاً`)),
                    ms
                )
            )
        ]);
    }

    /* ═══════════════ SDK Loader ═══════════════ */

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === "true") {
                    resolve();
                    return;
                }
                existing.addEventListener("load", resolve, { once: true });
                existing.addEventListener("error", reject, { once: true });
                return;
            }

            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.defer = true;
            script.onload = () => {
                script.dataset.loaded = "true";
                resolve();
            };
            script.onerror = () => reject(new Error(`فشل تحميل: ${src}`));

            document.head.appendChild(script);
        });
    }

    async function loadFirebaseSDK() {
        if (window.firebase && window.firebase.initializeApp) {
            // تحقق من الوحدات
            const ok = window.firebase.auth
                      && window.firebase.database
                      && window.firebase.storage;
            if (ok) return true;
        }

        try {
            for (const mod of REQUIRED_MODULES) {
                await loadScript(FIREBASE_CDN + mod);
            }

            // ✅ تحقق نهائي
            const ready = window.firebase
                       && window.firebase.initializeApp
                       && window.firebase.auth
                       && window.firebase.database
                       && window.firebase.storage;

            if (!ready) {
                throw new Error("Firebase SDK لم يُحمَّل بشكل كامل");
            }

            return true;
        } catch (err) {
            console.error("[Firebase] SDK load failed:", err);
            return false;
        }
    }

    /* ═══════════════ Configuration ═══════════════ */

    function isConfigured() {
        const config = getConfig();

        if (typeof config.isFirebaseConfigured === "function") {
            try { return !!config.isFirebaseConfigured(); }
            catch { /* ignore */ }
        }

        const c = config.firebase?.config || {};
        return !!(c.apiKey && c.authDomain && c.projectId && c.appId && c.databaseURL);
    }

    /* ═══════════════ Offline mode ═══════════════ */

    function enableOfflineMode(reason = "Firebase unavailable") {
        state.available = false;
        state.initialized = true;
        state.configured = false;
        state.offline = true;
        state.authReady = true;

        console.warn("[Firebase] offline mode:", reason);

        const detail = { reason, mode: "offline" };
        emit("firebase:offline", detail);
        emit("firebase:ready", detail);   // ✅ موجود في كل الحالات
        markReady(detail);
    }

    /* ═══════════════ Initialize ═══════════════ */

    async function initialize() {
        if (state.initialized) return state;

        state.configured = isConfigured();

        if (!state.configured) {
            enableOfflineMode("Firebase config غير مكتمل");
            return state;
        }

        const loaded = await loadFirebaseSDK();
        if (!loaded || !window.firebase) {
            enableOfflineMode("تعذّر تحميل Firebase SDK");
            return state;
        }

        try {
            const firebaseConfig = getConfig().firebase.config;

            // إعادة استخدام التطبيق إن وُجد
            if (window.firebase.apps && window.firebase.apps.length > 0) {
                state.app = window.firebase.app();
            } else {
                state.app = window.firebase.initializeApp(firebaseConfig);
            }

            state.auth = window.firebase.auth();
            state.database = window.firebase.database();
            state.storage = window.firebase.storage();

            state.available = true;
            state.initialized = true;
            state.offline = false;
            state.authReady = false;

            await configureAuthPersistence();

            // ✅ انتظر observer مرة واحدة
            await new Promise(resolve => {
                const timeout = setTimeout(() => resolve(false), 3000);

                state.auth.onAuthStateChanged(user => {
                    state.currentUser = user || null;
                    state.authReady = true;

                    clearTimeout(timeout);

                    // ✅ اسم مختلف لتجنّب التعارض مع auth.js
                    emit("firebase:auth-changed", {
                        user: user || null,
                        authenticated: !!user
                    });

                    resolve(true);
                });
            });

            const detail = { app: state.app, available: true };
            emit("firebase:ready", detail);
            markReady(detail);

            console.log("[Firebase] ready");

            return state;

        } catch (err) {
            console.error("[Firebase] initialize error:", err);
            enableOfflineMode(err.message || "خطأ في التهيئة");
            return state;
        }
    }

    async function configureAuthPersistence() {
        if (!state.auth) return false;

        try {
            const persistence = getConfig().firebase?.auth?.persistence || "local";
            const Auth = window.firebase.auth.Auth;

            if (persistence === "session") {
                await state.auth.setPersistence(Auth.Persistence.SESSION);
            } else if (persistence === "none") {
                await state.auth.setPersistence(Auth.Persistence.NONE);
            } else {
                await state.auth.setPersistence(Auth.Persistence.LOCAL);
            }

            return true;
        } catch (err) {
            console.warn("[Firebase] setPersistence failed:", err);
            return false;
        }
    }

    /* ═══════════════════════════════════════════════════════════
       🎯 Phone <-> Email Conversion
       ═══════════════════════════════════════════════════════════ */

    function isEmailLike(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
    }

    /**
     * يولّد بريداً اصطناعياً من رقم الهاتف
     */
    function phoneToSyntheticEmail(phone) {
        const clean = String(phone || "").replace(/[^0-9]/g, "");
        return `${clean}@${SYNTHETIC_EMAIL_DOMAIN}`;
    }

    /**
     * يحوّل identifier (بريد أو هاتف) → بريد Firebase
     */
    function toFirebaseEmail(identifier) {
        if (!identifier) return null;
        const s = String(identifier).trim();
        if (isEmailLike(s)) return s.toLowerCase();
        return phoneToSyntheticEmail(s);
    }

    /* ═══════════════════════════════════════════════════════════
       Auth Operations
       ═══════════════════════════════════════════════════════════ */

    async function register(identifier, password) {
        if (!state.auth) {
            return { success: false, offline: true, user: null, error: "Firebase Auth غير متاح." };
        }

        if (!identifier || !password) {
            return { success: false, user: null, error: "المعرّف وكلمة المرور مطلوبان." };
        }

        const email = toFirebaseEmail(identifier);

        try {
            const result = await withTimeout(
                state.auth.createUserWithEmailAndPassword(email, String(password)),
                OPERATION_TIMEOUT_MS,
                "التسجيل"
            );

            return {
                success: true,
                user: result.user,
                firebaseEmail: email,
                isSynthetic: !isEmailLike(identifier),
                error: null
            };
        } catch (err) {
            return {
                success: false,
                user: null,
                error: normalizeFirebaseError(err),
                code: err.code || null
            };
        }
    }

    async function login(identifier, password) {
        if (!state.auth) {
            return { success: false, offline: true, user: null, error: "Firebase Auth غير متاح." };
        }

        if (!identifier || !password) {
            return { success: false, user: null, error: "المعرّف وكلمة المرور مطلوبان." };
        }

        const email = toFirebaseEmail(identifier);

        try {
            const result = await withTimeout(
                state.auth.signInWithEmailAndPassword(email, String(password)),
                OPERATION_TIMEOUT_MS,
                "تسجيل الدخول"
            );

            return { success: true, user: result.user, error: null };
        } catch (err) {
            return {
                success: false,
                user: null,
                error: normalizeFirebaseError(err),
                code: err.code || null
            };
        }
    }

    async function logout() {
        if (!state.auth) {
            state.currentUser = null;
            clearProfileCache();
            return { success: true, offline: true };
        }

        try {
            await withTimeout(state.auth.signOut(), OPERATION_TIMEOUT_MS, "تسجيل الخروج");
            state.currentUser = null;
            clearProfileCache();
            return { success: true };
        } catch (err) {
            return { success: false, error: normalizeFirebaseError(err) };
        }
    }

    async function resetPassword(identifier) {
        if (!state.auth) {
            return { success: false, error: "Firebase Auth غير متاح." };
        }

        if (!identifier) {
            return { success: false, error: "البريد الإلكتروني مطلوب." };
        }

        const email = toFirebaseEmail(identifier);

        try {
            await withTimeout(
                state.auth.sendPasswordResetEmail(email),
                OPERATION_TIMEOUT_MS,
                "إرسال رابط الاستعادة"
            );
            return { success: true };
        } catch (err) {
            return { success: false, error: normalizeFirebaseError(err), code: err.code || null };
        }
    }

    /* ═══════════════════════════════════════════════════════════
       🎯 getCurrentUser — يدمج مع users/{uid}
       ═══════════════════════════════════════════════════════════ */

    let _profileCache = null;
    let _profileCacheUid = null;
    let _profileCacheTime = 0;

    function clearProfileCache() {
        _profileCache = null;
        _profileCacheUid = null;
        _profileCacheTime = 0;
    }

    /**
     * يبني كائن مستخدم كامل من Firebase User + DB profile
     */
    async function buildFullUser(firebaseUser) {
        if (!firebaseUser) return null;

        const base = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || null,
            emailVerified: !!firebaseUser.emailVerified,
            displayName: firebaseUser.displayName || null,
            photoURL: firebaseUser.photoURL || null,
            phoneNumber: firebaseUser.phoneNumber || null,
            providerId: firebaseUser.providerData?.[0]?.providerId || "password",
            // Defaults
            role: "user",
            name: null,
            phone: null,
            company: null,
            createdAt: null
        };

        // حاول جلب الـ profile من DB
        try {
            const result = await withTimeout(
                getUserProfile(firebaseUser.uid),
                OPERATION_TIMEOUT_MS,
                "جلب profile"
            );

            if (result?.success && result.data && typeof result.data === "object") {
                const profile = result.data;

                return {
                    ...base,
                    name: profile.name || base.displayName || null,
                    phone: profile.phone || base.phoneNumber || null,
                    company: profile.company || null,
                    role: profile.role || "user",
                    email: profile.email || base.email,
                    createdAt: profile.createdAt || null,
                    // احتفظ بالأصل للرجوع
                    _firebase: {
                        emailVerified: base.emailVerified,
                        photoURL: base.photoURL
                    }
                };
            }
        } catch (err) {
            console.warn("[Firebase] profile fetch failed:", err.message);
        }

        return base;
    }

    /**
     * يُعيد المستخدم الحالي مع دوره الكامل (async)
     * النتيجة تُخزَّن مؤقتاً 5 دقائق
     */
    async function getCurrentUser() {
        const firebaseUser = state.currentUser || (state.auth ? state.auth.currentUser : null);

        if (!firebaseUser) {
            clearProfileCache();
            return null;
        }

        // Cache hit?
        const now = Date.now();
        if (_profileCache
            && _profileCacheUid === firebaseUser.uid
            && (now - _profileCacheTime) < PROFILE_CACHE_TTL_MS) {
            return _profileCache;
        }

        const full = await buildFullUser(firebaseUser);

        _profileCache = full;
        _profileCacheUid = firebaseUser.uid;
        _profileCacheTime = now;

        return full;
    }

    /**
     * نسخة متزامنة (بدون DB) — للاستخدام في سياقات ضيقة
     * @deprecated استخدم getCurrentUser() بدلاً منها
     */
    function getCurrentUserSync() {
        const firebaseUser = state.currentUser || (state.auth ? state.auth.currentUser : null);
        if (!firebaseUser) return null;

        // إن كان الـ cache متاحاً، استخدمه
        if (_profileCache && _profileCacheUid === firebaseUser.uid) {
            return _profileCache;
        }

        return {
            uid: firebaseUser.uid,
            email: firebaseUser.email || null,
            displayName: firebaseUser.displayName || null,
            phoneNumber: firebaseUser.phoneNumber || null,
            role: "user"
        };
    }

    function isAuthenticated() {
        return !!(state.currentUser || (state.auth ? state.auth.currentUser : null));
    }

    function getCurrentUserId() {
        const u = state.currentUser || (state.auth ? state.auth.currentUser : null);
        return u ? u.uid : null;
    }

    /* ═══════════════════════════════════════════════════════════
       Database Operations
       ═══════════════════════════════════════════════════════════ */

    function databaseRef(path = "") {
        if (!state.database) return null;

        const root = getConfig().firebase?.database?.root || "acousticEngineering";
        const cleanPath = String(path).replace(/^\/+|\/+$/g, "");
        const finalPath = cleanPath ? `${root}/${cleanPath}` : root;

        return state.database.ref(finalPath);
    }

    async function set(path, data) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true, error: "DB غير متاح." };

        try {
            await withTimeout(ref.set(data), OPERATION_TIMEOUT_MS, "set");
            return { success: true, error: null };
        } catch (err) {
            return { success: false, error: normalizeFirebaseError(err), code: err.code || null };
        }
    }

    async function update(path, data) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true, error: "DB غير متاح." };

        try {
            await withTimeout(ref.update(data), OPERATION_TIMEOUT_MS, "update");
            return { success: true };
        } catch (err) {
            return { success: false, error: normalizeFirebaseError(err) };
        }
    }

    async function push(path, data) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true, key: null, error: "DB غير متاح." };

        try {
            const pushed = ref.push();
            await withTimeout(pushed.set(data), OPERATION_TIMEOUT_MS, "push");
            return {
                success: true,
                key: pushed.key,
                path: `${path}/${pushed.key}`
            };
        } catch (err) {
            return { success: false, key: null, error: normalizeFirebaseError(err) };
        }
    }

    async function get(path) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true, data: null, error: "DB غير متاح." };

        try {
            const snapshot = await withTimeout(
                ref.once("value"),
                OPERATION_TIMEOUT_MS,
                "get"
            );
            return {
                success: true,
                exists: snapshot.exists(),
                data: snapshot.val()
            };
        } catch (err) {
            return { success: false, data: null, error: normalizeFirebaseError(err) };
        }
    }

    async function remove(path) {
        const ref = databaseRef(path);
        if (!ref) return { success: false, offline: true };

        try {
            await withTimeout(ref.remove(), OPERATION_TIMEOUT_MS, "remove");
            return { success: true };
        } catch (err) {
            return { success: false, error: normalizeFirebaseError(err) };
        }
    }

    /* ═══════════════════════════════════════════════════════════
       User Profile
       ═══════════════════════════════════════════════════════════ */

    function userPath(uid, section = "") {
        const base = `users/${String(uid || "").trim()}`;
        return section ? `${base}/${section}` : base;
    }

    async function saveUserProfile(uid, profile) {
        if (!uid) return { success: false, error: "User ID مطلوب." };

        const clean = {
            ...profile,
            uid,
            updatedAt: Date.now()
        };

        // ✅ استخدم ServerValue للتوافق الزمني (اختياري)
        try {
            if (window.firebase?.database?.ServerValue) {
                clean.serverUpdatedAt = window.firebase.database.ServerValue.TIMESTAMP;
            }
        } catch { /* ignore */ }

        const result = await update(userPath(uid), clean);

        // ✅ أبطِل الـ cache (الدور قد تغيّر)
        if (result.success) clearProfileCache();

        return result;
    }

    async function getUserProfile(uid) {
        if (!uid) return { success: false, data: null };
        return get(userPath(uid));
    }

    async function deleteUserProfile(uid) {
        if (!uid) return { success: false };
        const result = await remove(userPath(uid));
        if (result.success) clearProfileCache();
        return result;
    }

    /* ═══════════════════════════════════════════════════════════
       Projects
       ═══════════════════════════════════════════════════════════ */

    function projectPath(projectId) {
        return `projects/${projectId}`;
    }

    async function saveProject(projectId, project) {
        if (!projectId) return { success: false, error: "Project ID مطلوب." };

        const uid = getCurrentUserId();
        const payload = {
            ...project,
            id: projectId,
            ownerId: project.ownerId || uid || null,
            updatedAt: Date.now()
        };

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

    /* ═══════════════════════════════════════════════════════════
       Registrations & Reports
       ═══════════════════════════════════════════════════════════ */

    async function saveRegistration(registration) {
        const payload = {
            ...registration,
            createdAt: registration.createdAt || Date.now(),
            updatedAt: Date.now()
        };
        return push("registrations", payload);
    }

    async function saveReport(reportId, report) {
        if (!reportId) return { success: false };
        return set(`reports/${reportId}`, {
            ...report,
            id: reportId,
            updatedAt: Date.now()
        });
    }

    /* ═══════════════════════════════════════════════════════════
       Storage
       ═══════════════════════════════════════════════════════════ */

    function sanitizeFileName(name) {
        return String(name || "file")
            .replace(/[^\w.-]/g, "_")
            .slice(0, 100);
    }

    function storageRef(path = "") {
        if (!state.storage) return null;

        const root = getConfig().firebase?.storage?.root || "acoustic-engineering";
        const cleanPath = String(path).replace(/^\/+|\/+$/g, "");
        const finalPath = cleanPath ? `${root}/${cleanPath}` : root;

        return state.storage.ref(finalPath);
    }

    async function uploadFile(path, file, metadata = {}) {
        const ref = storageRef(path);
        if (!ref) return { success: false, offline: true, error: "Storage غير متاح." };
        if (!file) return { success: false, error: "لا يوجد ملف." };

        const safeMetadata = {
            contentType: file.type || "application/octet-stream",
            cacheControl: "public,max-age=86400",
            ...metadata
        };

        try {
            const snapshot = await withTimeout(
                ref.put(file, safeMetadata),
                OPERATION_TIMEOUT_MS * 2, // رفع الملفات قد يحتاج وقتاً أكثر
                "رفع الملف"
            );

            const url = await snapshot.ref.getDownloadURL();

            return {
                success: true,
                url,
                path: snapshot.ref.fullPath,
                size: snapshot.totalBytes,
                metadata: snapshot.metadata
            };
        } catch (err) {
            return {
                success: false,
                url: null,
                error: normalizeFirebaseError(err),
                code: err.code || null
            };
        }
    }

    async function deleteFile(path) {
        const ref = storageRef(path);
        if (!ref) return { success: false, offline: true };

        try {
            await withTimeout(ref.delete(), OPERATION_TIMEOUT_MS, "حذف الملف");
            return { success: true };
        } catch (err) {
            return { success: false, error: normalizeFirebaseError(err) };
        }
    }

    /* ═══════════════════════════════════════════════════════════
       Error Normalization
       ═══════════════════════════════════════════════════════════ */

    function normalizeFirebaseError(error) {
        if (!error) return "خطأ غير معروف في Firebase.";

        const code = error.code || "";
        const messages = {
            // Auth
            "auth/email-already-in-use": "البريد مسجّل بالفعل.",
            "auth/invalid-email": "البريد غير صحيح.",
            "auth/weak-password": "كلمة المرور ضعيفة (6 أحرف على الأقل).",
            "auth/user-not-found": "لا يوجد حساب بهذا المعرّف.",
            "auth/wrong-password": "كلمة المرور غير صحيحة.",
            "auth/invalid-credential": "بيانات الدخول غير صحيحة.",
            "auth/invalid-login-credentials": "بيانات الدخول غير صحيحة.",
            "auth/too-many-requests": "محاولات كثيرة. حاول بعد قليل.",
            "auth/network-request-failed": "تعذّر الاتصال بالشبكة.",
            "auth/user-disabled": "الحساب معطّل.",
            "auth/requires-recent-login": "يجب تسجيل الدخول مرة أخرى.",
            "auth/unauthorized-domain": "هذا النطاق غير مصرّح له. راجع الإدارة.",
            "auth/operation-not-allowed": "هذه العملية غير مسموح بها حالياً.",

            // Database
            "PERMISSION_DENIED": "ليس لديك صلاحية.",
            "permission-denied": "ليس لديك صلاحية.",
            "PERMISSION_DENIED_FIREBASE": "ليس لديك صلاحية.",
            "UNAVAILABLE": "الخدمة غير متاحة مؤقتاً.",
            "NETWORK_ERROR": "تعذّر الاتصال بالشبكة.",

            // Storage
            "storage/unauthorized": "صلاحية الرفع مرفوضة.",
            "storage/canceled": "تم إلغاء الرفع.",
            "storage/quota-exceeded": "تجاوزت مساحة التخزين.",
            "storage/invalid-format": "صيغة الملف غير مدعومة."
        };

        return messages[code] || error.message || "خطأ في Firebase.";
    }

    /* ═══════════════════════════════════════════════════════════
       Public API
       ═══════════════════════════════════════════════════════════ */

    const FirebaseAPI = {
        // State
        state,

        // Init
        initialize,
        waitForReady,
        loadFirebaseSDK,
        isConfigured,
        isReady: () => _ready,

        // Auth
        isAuthenticated,
        getCurrentUser,          // async — يُدمج مع DB
        getCurrentUserSync,      // sync — بدون DB
        getCurrentUserId,
        register,
        login,
        logout,
        resetPassword,

        // Database
        databaseRef,
        set,
        update,
        push,
        get,
        remove,

        // User Profile
        userPath,
        saveUserProfile,
        getUserProfile,
        deleteUserProfile,

        // Projects
        projectPath,
        saveProject,
        getProject,
        deleteProject,

        // Reports & Registrations
        saveRegistration,
        saveReport,

        // Storage
        storageRef,
        uploadFile,
        deleteFile,
        sanitizeFileName,

        // Utilities
        toFirebaseEmail,
        phoneToSyntheticEmail,
        isEmailLike,
        normalizeFirebaseError,
        clearProfileCache
    };

    /* ═══════════════ Exposure ═══════════════ */
    AE.firebase = FirebaseAPI;
    window.AcousticFirebase = FirebaseAPI;

    /* ═══════════════ Cross-module bridge ═══════════════ */
    // أعلم auth.js بتغيّر الجلسة (بعد أن أصبح لدينا profile كامل)
    window.addEventListener("firebase:auth-changed", async (event) => {
        const detail = event.detail || {};
        if (detail.user) {
            try {
                const full = await getCurrentUser();
                emit("firebase:user-profile-ready", { user: full });
            } catch { /* ignore */ }
        } else {
            clearProfileCache();
        }
    });

    /* ═══════════════ Boot ═══════════════ */
    function boot() {
        initialize().catch(err => {
            console.error("[Firebase] boot error:", err);
            enableOfflineMode(err.message || "خطأ في بدء Firebase");
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    console.log("[firebase.js] v2.0.0 جاهز");

})();
