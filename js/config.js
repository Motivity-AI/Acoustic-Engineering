/* ============================================================
   Acoustic Engineering — js/config.js v2.0.0
   ✅ مفاتيح localStorage متوافقة مع app.js و storage.js
   ✅ room defaults 20×15×4 (متوافق مع كل المشروع)
   ✅ Firebase config + تحذير أمني
   ✅ دوال مساعدة (format, debounce, escapeHtml, ...)
   ✅ تحقق شامل من الملفات
   ✅ VERSION constants موحّدة
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════════════════════════════════════════════════
       App Info
       ═══════════════════════════════════════════════════════════ */

    const APP = Object.freeze({
        name: "هندسة صوتية",
        nameEn: "Acoustic Engineering",
        version: "2.0.0",
        build: "2025",
        environment: detectEnvironment(),
        language: "ar",
        direction: "rtl",
        locale: "ar",
        country: "SD",
        supportEmail: "support@acoustic-engineering.local"
    });

    function detectEnvironment() {
        try {
            const host = window.location.hostname;
            if (host === "localhost" || host === "127.0.0.1" || host === "") {
                return "development";
            }
            return "production";
        } catch {
            return "production";
        }
    }

    /* ═══════════════════════════════════════════════════════════
       Routes
       ═══════════════════════════════════════════════════════════ */

    const ROUTES = Object.freeze({
        home: "index.html",
        register: "register.html",
        login: "register.html?mode=login",
        app: "app.html",
        admin: "admin.html",
        report: "report.html",
        logout: "register.html?action=logout"
    });

    /* ═══════════════════════════════════════════════════════════
       🎯 localStorage — موحّد مع app.js و storage.js
       ═══════════════════════════════════════════════════════════ */

    const LOCAL_STORAGE = Object.freeze({
        /**
         * البادئة العامة — لكن المفاتيح الفعلية أدناه كاملة
         * ⚠️ لا تستخدم `prefix + key` — استخدم `keys.X` مباشرة
         */
        prefix: "acoustic_engineering_",

        keys: {
            // ✅ مطابق تماماً لـ app.js و storage.js و backend.js
            projects: "acoustic_engineering_projects",
            currentProject: "acoustic_engineering_currentProject",
            user: "acoustic_engineering_user",
            speakers: "acoustic_engineering_speakers",
            settings: "acoustic_engineering_settings",

            // مفاتيح قديمة للتوافق الخلفي
            legacy: {
                currentProject: "acousticEngineering_currentProject",
                activeProject: "acoustic_engineering_activeProject"
            }
        }
    });

    /* ═══════════════════════════════════════════════════════════
       Firebase
       ═══════════════════════════════════════════════════════════
       ⚠️ ملاحظة أمنية مهمة:
       - API Key و Project ID ليسا سريّين في Firebase Web Apps
       - Firebase تعتمد على Security Rules وليس على إخفاء المفاتيح
       - تأكد من ضبط قواعد Firestore/RTDB بشكل صارم
       - أضف نطاقك في Authentication > Settings > Authorized Domains
       ═══════════════════════════════════════════════════════════ */

    const FIREBASE = Object.freeze({
        enabled: true,          // ← يستطيع المطوّر تعطيله يدوياً

        config: {
            apiKey: "AIzaSyAquOcS-y7V9Ld3TFbW_jIwHAasOLH9x3M",
            authDomain: "acoustic-engineering.firebaseapp.com",
            databaseURL: "https://acoustic-engineering-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "acoustic-engineering",
            storageBucket: "acoustic-engineering.firebasestorage.app",
            messagingSenderId: "319566823634",
            appId: "1:319566823634:web:af81c2cdf3a0590b66ad0b"
            // ⚠️ measurementId محذوف — أضفه فقط عند استخدام Analytics
        },

        services: {
            authentication: true,
            realtimeDatabase: true,
            storage: true,
            analytics: false      // ← معطّل افتراضياً
        },

        auth: {
            persistence: "local",   // local | session | none
            allowEmailPassword: true
        },

        database: {
            root: "acousticEngineering",
            users: "users",
            projects: "projects",
            registrations: "registrations",
            speakers: "speakers",
            reports: "reports",
            activity: "activity",
            settings: "settings"
        },

        storage: {
            root: "acoustic-engineering",
            datasheets: "datasheets",
            projectFiles: "projects",
            reports: "reports",
            userFiles: "users"
        }
    });

    /* ═══════════════════════════════════════════════════════════
       Roles & Permissions
       ═══════════════════════════════════════════════════════════ */

    const ROLES = Object.freeze({
        VISITOR: "visitor",
        USER: "user",
        ENGINEER: "engineer",
        ADMIN: "admin",
        OWNER: "owner"
    });

    const PERMISSIONS = Object.freeze({
        visitor: ["view_public"],

        user: [
            "view_app",
            "create_project",
            "edit_own_project",
            "delete_own_project",
            "save_project",
            "generate_report",
            "download_report",
            "upload_datasheet"
        ],

        engineer: [
            "view_app",
            "create_project",
            "edit_own_project",
            "delete_own_project",
            "save_project",
            "generate_report",
            "download_report",
            "upload_datasheet",
            "engineering_design",
            "auto_design",
            "advanced_analysis",
            "manage_speakers"
        ],

        admin: [
            "view_app",
            "create_project",
            "edit_any_project",
            "delete_any_project",
            "save_project",
            "generate_report",
            "download_report",
            "upload_datasheet",
            "engineering_design",
            "auto_design",
            "advanced_analysis",
            "manage_speakers",
            "view_users",
            "view_registrations",
            "view_all_projects",
            "manage_users",
            "reset_user_password",
            "manage_settings",
            "view_admin_dashboard"
        ],

        owner: ["*"]
    });

    /* ═══════════════════════════════════════════════════════════
       🎯 Engineering Defaults — متوافقة مع كل المشروع
       ═══════════════════════════════════════════════════════════ */

    const ENGINEERING = Object.freeze({
        defaults: {
            // ✅ 20×15×4 — نفس ما في app.html و engine.js و canvas.js
            room: Object.freeze({ width: 20, depth: 15, height: 4 }),
            stage: Object.freeze({ width: 8, depth: 4, x: 6, y: 0.5 }),
            audience: Object.freeze({ size: 300, listenerHeight: 1.2 }),
            target: Object.freeze({
                spl: 95,
                coverage: 90,
                headroom: 6,
                uniformity: 6
            }),
            mounting: Object.freeze({ height: 3.2 })
        },

        profiles: Object.freeze({
            speech: {
                name: "Speech",
                nameAr: "خطابة",
                targetSPL: 85,
                coverageTarget: 90,
                headroom: 6
            },
            meeting: {
                name: "Meeting",
                nameAr: "اجتماعات",
                targetSPL: 88,
                coverageTarget: 90,
                headroom: 6
            },
            general: {
                name: "General Purpose",
                nameAr: "غرض عام",
                targetSPL: 92,
                coverageTarget: 90,
                headroom: 6
            },
            banquet: {
                name: "Banquet",
                nameAr: "قاعة مناسبات",
                targetSPL: 95,
                coverageTarget: 90,
                headroom: 6
            },
            music: {
                name: "Music",
                nameAr: "موسيقى",
                targetSPL: 100,
                coverageTarget: 90,
                headroom: 10
            },
            live: {
                name: "Live Event",
                nameAr: "فعالية مباشرة",
                targetSPL: 102,
                coverageTarget: 90,
                headroom: 12
            },
            theater: {
                name: "Theater",
                nameAr: "مسرح",
                targetSPL: 92,
                coverageTarget: 95,
                headroom: 8
            },
            worship: {
                name: "Worship",
                nameAr: "مسجد/كنيسة",
                targetSPL: 88,
                coverageTarget: 95,
                headroom: 6
            },
            stadium: {
                name: "Stadium",
                nameAr: "ملعب",
                targetSPL: 100,
                coverageTarget: 90,
                headroom: 10
            },
            gym: {
                name: "Gym",
                nameAr: "صالة رياضية",
                targetSPL: 95,
                coverageTarget: 90,
                headroom: 8
            },
            outdoor: {
                name: "Outdoor",
                nameAr: "خارجي",
                targetSPL: 98,
                coverageTarget: 85,
                headroom: 12
            }
        })
    });

    /* ═══════════════════════════════════════════════════════════
       Venues
       ═══════════════════════════════════════════════════════════ */

    const VENUE_TYPES = Object.freeze([
        { id: "general", ar: "مبنى عام", en: "General" },
        { id: "hotel", ar: "فندق", en: "Hotel" },
        { id: "garden", ar: "حديقة", en: "Garden" },
        { id: "meeting", ar: "قاعة اجتماعات", en: "Meeting Room" },
        { id: "banquet", ar: "قاعة مناسبات", en: "Banquet Hall" },
        { id: "event", ar: "قاعة فعاليات", en: "Event Hall" },
        { id: "gym", ar: "صالة رياضية", en: "Gym" },
        { id: "office", ar: "مكاتب", en: "Office" },
        { id: "theater", ar: "مسرح", en: "Theater" },
        { id: "stadium", ar: "ملعب", en: "Stadium" },
        { id: "mosque", ar: "مسجد", en: "Mosque" },
        { id: "school", ar: "مدرسة", en: "School" },
        { id: "restaurant", ar: "مطعم", en: "Restaurant" },
        { id: "outdoor", ar: "مساحة خارجية", en: "Outdoor" },
        { id: "custom", ar: "مبنى مخصص", en: "Custom" }
    ]);

    /* ═══════════════════════════════════════════════════════════
       Room Materials
       ═══════════════════════════════════════════════════════════ */

    const ROOM_MATERIALS = Object.freeze({
        low: {
            name: "Low Absorption",
            nameAr: "امتصاص منخفض",
            absorption: 0.55
        },
        medium: {
            name: "Medium Absorption",
            nameAr: "امتصاص متوسط",
            absorption: 0.30
        },
        high: {
            name: "High Absorption",
            nameAr: "امتصاص عالٍ",
            absorption: 0.12
        },
        acoustic: {
            name: "Acoustic Treated",
            nameAr: "معالجة صوتياً",
            absorption: 0.05
        }
    });

    /* ═══════════════════════════════════════════════════════════
       🎯 Speaker Defaults — متوافق مع speaker.js (flat)
       ═══════════════════════════════════════════════════════════
       ملاحظة: القيم الفعلية موجودة في js/speaker.js
       هذا للتوافق مع أكواد قديمة تستدعي CONFIG.speakerDefaults
       ═══════════════════════════════════════════════════════════ */

    const SPEAKER_DEFAULTS = Object.freeze({
        // بنية flat — متوافقة مع speaker.js
        rms_power: 500,
        peak_power: 1000,
        max_spl: 125,
        sensitivity: 96,
        frequency_min: 55,
        frequency_max: 18000,
        horizontal_coverage: 90,
        vertical_coverage: 60,
        impedance: 8,
        weight: 15,
        mounting_type: "Stand",

        // aliases للتوافق الخلفي
        rms: 500,
        power: 500,
        maxSPL: 125,
        horizontalCoverage: 90,
        verticalCoverage: 60,
        frequencyLow: 55,
        frequencyHigh: 18000,
        mountingHeight: 3.2,
        mounting: "Stand"
    });

    /* ═══════════════════════════════════════════════════════════
       Canvas Defaults
       ═══════════════════════════════════════════════════════════ */

    const CANVAS = Object.freeze({
        minZoom: 0.25,
        maxZoom: 5,
        defaultZoom: 1,
        gridSize: 0.5,
        snap: true,
        grid: true,
        background: "#0b0f14",
        snapDistance: 0.25,
        edgeMargin: 0.5
    });

    /* ═══════════════════════════════════════════════════════════
       Report
       ═══════════════════════════════════════════════════════════ */

    const REPORT = Object.freeze({
        title: "تقرير هندسي",
        titleEn: "Acoustic Engineering Report",
        footer: "Acoustic Engineering",
        numberPrefix: "AE",
        defaultFormat: "html",           // html | pdf | json
        formats: ["html", "json", "print"]
    });

    /* ═══════════════════════════════════════════════════════════
       Files
       ═══════════════════════════════════════════════════════════ */

    const FILES = Object.freeze({
        maxDatasheetSize: 10 * 1024 * 1024,    // 10 MB (متوافق مع speakers.js)
        maxImageSize: 5 * 1024 * 1024,         // 5 MB

        allowedExtensions: [
            ".pdf", ".xlsx", ".xls", ".csv",
            ".json", ".txt",
            ".png", ".jpg", ".jpeg", ".webp"
        ],

        allowedDatasheetTypes: [
            "application/pdf",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv",
            "application/json",
            "text/plain",
            "image/png",
            "image/jpeg",
            "image/webp"
        ],

        blockedExtensions: [
            ".exe", ".bat", ".sh", ".cmd", ".ps1",
            ".js", ".mjs", ".html", ".htm", ".svg",
            ".php", ".asp", ".jsp", ".py", ".rb"
        ]
    });

    /* ═══════════════════════════════════════════════════════════
       Security
       ═══════════════════════════════════════════════════════════ */

    const SECURITY = Object.freeze({
        sessionTimeout: 7 * 24 * 60 * 60 * 1000,   // أسبوع
        registrationRequired: true,
        requireLoginForProjects: true,
        maxProjectNameLength: 200,
        maxProjectDescriptionLength: 5000,
        maxPhoneLength: 30,
        maxEmailLength: 254,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        maxSpeakersPerProject: 500
    });

    /* ═══════════════════════════════════════════════════════════
       UI
       ═══════════════════════════════════════════════════════════ */

    const UI = Object.freeze({
        theme: "dark",
        toastDuration: 3000,
        toastLongDuration: 5000,
        animationDuration: 250,
        debounceDelay: 300,
        resizeDebounceDelay: 150,
        autoSaveDelay: 120000     // دقيقتان
    });

    /* ═══════════════════════════════════════════════════════════
       Features
       ═══════════════════════════════════════════════════════════ */

    const FEATURES = Object.freeze({
        registration: true,
        authentication: true,
        projectManagement: true,
        speakerLibrary: true,
        datasheetUpload: true,
        manualDesign: true,
        automaticDesign: true,
        engineeringAnalysis: true,
        coverageMap: true,
        heatmap: true,
        bom: true,
        report: true,
        reportHTML: true,
        reportJSON: true,
        printReport: true,
        firebaseSync: true,
        serverSync: true,
        offlineMode: true,
        adminDashboard: true,
        autoSave: true
    });

    /* ═══════════════════════════════════════════════════════════
       Messages
       ═══════════════════════════════════════════════════════════ */

    const MESSAGES = Object.freeze({
        ar: {
            loading: "جارٍ المعالجة...",
            saved: "تم الحفظ بنجاح",
            error: "حدث خطأ",
            networkError: "تعذّر الاتصال",
            loginRequired: "يجب تسجيل الدخول",
            unauthorized: "ليس لديك صلاحية",
            notFound: "غير موجود",
            success: "تمت العملية بنجاح",
            confirmDelete: "هل أنت متأكد من الحذف؟",
            projectSaved: "تم حفظ المشروع",
            projectDeleted: "تم حذف المشروع",
            reportGenerated: "تم إنشاء التقرير",
            speakerAdded: "تمت إضافة السماعة",
            invalidData: "بيانات غير صالحة"
        },
        en: {
            loading: "Processing...",
            saved: "Saved successfully",
            error: "Error occurred",
            networkError: "Connection failed",
            loginRequired: "Please sign in",
            unauthorized: "Unauthorized",
            notFound: "Not found",
            success: "Operation successful",
            confirmDelete: "Delete this item?",
            projectSaved: "Project saved",
            projectDeleted: "Project deleted",
            reportGenerated: "Report generated",
            speakerAdded: "Speaker added",
            invalidData: "Invalid data"
        }
    });

    /* ═══════════════════════════════════════════════════════════
       Helper Functions
       ═══════════════════════════════════════════════════════════ */

    function getFirebaseConfig() {
        return { ...FIREBASE.config };
    }

    function isFirebaseConfigured() {
        if (!FIREBASE.enabled) return false;
        const c = FIREBASE.config;
        return !!(c.apiKey && c.authDomain && c.projectId && c.appId && c.databaseURL);
    }

    function isFeatureEnabled(feature) {
        return !!FEATURES[feature];
    }

    function getMessage(key, lang) {
        const l = lang || APP.language || "ar";
        return MESSAGES[l]?.[key] || MESSAGES.ar[key] || key;
    }

    function getVenue(id) {
        if (!id) return VENUE_TYPES[0];
        return VENUE_TYPES.find(v => v.id === id) || VENUE_TYPES[0];
    }

    function getAllVenues() {
        return VENUE_TYPES.slice();
    }

    function getEngineeringProfile(id) {
        if (!id) return ENGINEERING.profiles.general;
        return ENGINEERING.profiles[id] || ENGINEERING.profiles.general;
    }

    function getAllProfiles() {
        return Object.entries(ENGINEERING.profiles).map(([key, value]) => ({
            id: key,
            ...value
        }));
    }

    function getRoomMaterial(id) {
        return ROOM_MATERIALS[id] || ROOM_MATERIALS.medium;
    }

    function getPermissions(role) {
        return PERMISSIONS[role] || PERMISSIONS.visitor;
    }

    function hasPermission(role, permission) {
        if (!role || !permission) return false;
        const perms = getPermissions(role);
        return perms.includes("*") || perms.includes(permission);
    }

    /* ═══════════════════════════════════════════════════════════
       Validators
       ═══════════════════════════════════════════════════════════ */

    function sanitizeText(value, maxLength) {
        const max = Math.max(0, Number(maxLength) || 500);
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/[<>]/g, "")
            .trim()
            .slice(0, max);
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[c]));
    }

    function isValidPhone(value) {
        const p = String(value || "").trim();
        if (!p) return false;
        if (p.length > SECURITY.maxPhoneLength) return false;
        return /^[+]?[0-9\s\-()]{7,30}$/.test(p);
    }

    function isValidEmail(value) {
        const e = String(value || "").trim();
        if (!e || e.length > SECURITY.maxEmailLength) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    }

    function isValidPassword(value) {
        const p = String(value || "");
        return p.length >= SECURITY.minPasswordLength
            && p.length <= SECURITY.maxPasswordLength;
    }

    function isEmailLike(value) {
        return isValidEmail(value);
    }

    function isPhoneLike(value) {
        return isValidPhone(value) && !isValidEmail(value);
    }

    function isAllowedFile(file) {
        if (!file) return false;
        if (typeof file.size !== "number") return false;

        // الحجم
        if (file.size > FILES.maxDatasheetSize) return false;
        if (file.size <= 0) return false;

        const name = String(file.name || "").toLowerCase();

        // امتداد محظور
        if (FILES.blockedExtensions.some(ext => name.endsWith(ext))) {
            return false;
        }

        // نوع MIME
        const type = String(file.type || "").toLowerCase();
        if (FILES.allowedDatasheetTypes.includes(type)) return true;

        // امتداد مسموح
        return FILES.allowedExtensions.some(ext => name.endsWith(ext));
    }

    /* ═══════════════════════════════════════════════════════════
       Generic Utilities (مفيدة للكل)
       ═══════════════════════════════════════════════════════════ */

    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function throttle(fn, delay) {
        let last = 0;
        return function (...args) {
            const now = Date.now();
            if (now - last < delay) return;
            last = now;
            fn.apply(this, args);
        };
    }

    function formatBytes(bytes, decimals) {
        const n = Number(bytes);
        if (!Number.isFinite(n) || n <= 0) return "0 B";

        const d = Number.isInteger(decimals) ? decimals : 1;
        const units = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.min(
            Math.floor(Math.log(n) / Math.log(1024)),
            units.length - 1
        );
        const value = n / Math.pow(1024, i);
        return `${value.toFixed(d)} ${units[i]}`;
    }

    function formatNumber(value, decimals) {
        const n = Number(value);
        if (!Number.isFinite(n)) return "—";
        const d = Number.isInteger(decimals) ? decimals : 0;
        try {
            return n.toLocaleString("en-US", {
                minimumFractionDigits: d,
                maximumFractionDigits: d
            });
        } catch {
            return n.toFixed(d);
        }
    }

    function getTimeAgo(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return "";

        const diff = Date.now() - d.getTime();
        const sec = Math.floor(diff / 1000);

        if (sec < 60) return "الآن";
        const min = Math.floor(sec / 60);
        if (min < 60) return `منذ ${min} دقيقة`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `منذ ${hr} ساعة`;
        const day = Math.floor(hr / 24);
        if (day < 30) return `منذ ${day} يوم`;

        try {
            return d.toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" });
        } catch {
            return d.toISOString().slice(0, 10);
        }
    }

    function deepFreeze(obj) {
        if (!obj || typeof obj !== "object") return obj;
        Object.freeze(obj);
        for (const key of Object.keys(obj)) {
            deepFreeze(obj[key]);
        }
        return obj;
    }

    /* ═══════════════════════════════════════════════════════════
       Version Info
       ═══════════════════════════════════════════════════════════ */

    const VERSIONS = Object.freeze({
        app: "2.0.0",
        engine: "2.0.0",
        canvas: "2.1.0",
        speaker: "2.0.0",
        report: "2.0.0",
        geometry: "2.0.0",
        auth: "2.0.0",
        backend: "2.0.0",
        storage: "2.0.0",
        firebase: "2.0.0",
        api: "2.0.0"
    });

    /* ═══════════════════════════════════════════════════════════
       Public API
       ═══════════════════════════════════════════════════════════ */

    const CONFIG = {
        // Sections
        app: APP,
        routes: ROUTES,
        firebase: FIREBASE,
        roles: ROLES,
        permissions: PERMISSIONS,
        engineering: ENGINEERING,
        venueTypes: VENUE_TYPES,
        roomMaterials: ROOM_MATERIALS,
        speakerDefaults: SPEAKER_DEFAULTS,
        canvas: CANVAS,
        report: REPORT,
        files: FILES,
        security: SECURITY,
        localStorage: LOCAL_STORAGE,
        ui: UI,
        features: FEATURES,
        messages: MESSAGES,
        versions: VERSIONS,

        // Getters
        getFirebaseConfig,
        isFirebaseConfigured,
        isFeatureEnabled,
        getMessage,
        getVenue,
        getAllVenues,
        getEngineeringProfile,
        getAllProfiles,
        getRoomMaterial,
        getPermissions,
        hasPermission,

        // Validators
        sanitizeText,
        escapeHtml,
        isValidPhone,
        isValidEmail,
        isValidPassword,
        isEmailLike,
        isPhoneLike,
        isAllowedFile,

        // Utilities
        debounce,
        throttle,
        formatBytes,
        formatNumber,
        getTimeAgo,
        deepFreeze,

        // Environment
        isProduction: () => APP.environment === "production",
        isDevelopment: () => APP.environment === "development"
    };

    /* ═══════════════ Exposure ═══════════════ */
    AE.config = CONFIG;
    window.AcousticConfig = CONFIG;

    /* ═══════════════ Event ═══════════════ */
    try {
        window.dispatchEvent(new CustomEvent("config:ready", {
            detail: { version: APP.version }
        }));
    } catch { /* ignore */ }

    console.log("[config.js] v2.0.0 جاهز");

})();
