/* ============================================================
   Acoustic Engineering — js/config.js
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    const APP = {
        name: "هندسة صوتية", nameEn: "Acoustic Engineering",
        version: "1.0.0", environment: "production",
        language: "ar", direction: "rtl", country: "SD"
    };

    const ROUTES = {
        home: "index.html", register: "register.html",
        app: "app.html", admin: "admin.html", report: "report.html"
    };

    const FIREBASE = {
        enabled: true, initialized: false,
        config: {
            apiKey: "AIzaSyAquOcS-y7V9Ld3TFbW_jIwHAasOLH9x3M",
            authDomain: "acoustic-engineering.firebaseapp.com",
            databaseURL: "https://acoustic-engineering-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "acoustic-engineering",
            storageBucket: "acoustic-engineering.firebasestorage.app",
            messagingSenderId: "319566823634",
            appId: "1:319566823634:web:af81c2cdf3a0590b66ad0b",
            measurementId: "G-S25X84164E"
        },
        services: { authentication: true, realtimeDatabase: true, storage: true },
        auth: { persistence: "local", allowEmailPassword: true },
        database: {
            root: "acousticEngineering", users: "users", projects: "projects",
            registrations: "registrations", speakers: "speakers",
            reports: "reports", activity: "activity", settings: "settings"
        },
        storage: {
            root: "acoustic-engineering", datasheets: "datasheets",
            projectFiles: "projects", reports: "reports", userFiles: "users"
        }
    };

    const ROLES = { visitor: "visitor", user: "user", engineer: "engineer", admin: "admin", owner: "owner" };

    const PERMISSIONS = {
        visitor: ["view_public"],
        user: ["view_app","create_project","edit_project","delete_project","save_project","generate_report","download_report","upload_datasheet"],
        engineer: ["view_app","create_project","edit_project","delete_project","save_project","generate_report","download_report","upload_datasheet","engineering_design","auto_design","advanced_analysis"],
        admin: ["view_app","create_project","edit_project","delete_project","save_project","generate_report","download_report","upload_datasheet","engineering_design","auto_design","advanced_analysis","view_users","view_registrations","view_projects","manage_users","manage_settings"],
        owner: ["*"]
    };

    const ENGINEERING = {
        defaults: {
            room: { width: 12, depth: 8, height: 3 },
            stage: { width: 6, depth: 2, x: 3, y: 0.5 },
            audience: { size: 100 },
            target: { spl: 95, coverage: 90, headroom: 6 },
            mounting: { height: 2.8 }
        },
        profiles: {
            speech: { name: "Speech", targetSPL: 85, coverageTarget: 90, headroom: 6 },
            meeting: { name: "Meeting", targetSPL: 88, coverageTarget: 90, headroom: 6 },
            banquet: { name: "Banquet", targetSPL: 95, coverageTarget: 90, headroom: 6 },
            music: { name: "Music", targetSPL: 100, coverageTarget: 90, headroom: 10 },
            theater: { name: "Theater", targetSPL: 92, coverageTarget: 95, headroom: 8 },
            worship: { name: "Worship", targetSPL: 88, coverageTarget: 95, headroom: 6 },
            stadium: { name: "Stadium", targetSPL: 100, coverageTarget: 90, headroom: 10 },
            gym: { name: "Gym", targetSPL: 95, coverageTarget: 90, headroom: 8 }
        }
    };

    const VENUE_TYPES = [
        { id: "hotel", ar: "فندق" }, { id: "garden", ar: "حديقة" },
        { id: "meeting", ar: "قاعة اجتماعات" }, { id: "banquet", ar: "قاعة مناسبات" },
        { id: "event", ar: "قاعة فعاليات" }, { id: "gym", ar: "صالة رياضية" },
        { id: "office", ar: "مكاتب" }, { id: "theater", ar: "مسرح" },
        { id: "stadium", ar: "ملعب" }, { id: "mosque", ar: "مسجد" },
        { id: "school", ar: "مدرسة" }, { id: "restaurant", ar: "مطعم" },
        { id: "outdoor", ar: "مساحة خارجية" }, { id: "custom", ar: "مبنى مخصص" }
    ];

    const ROOM_MATERIALS = {
        low: { name: "Low", absorption: 0.55 },
        medium: { name: "Medium", absorption: 0.30 },
        high: { name: "High", absorption: 0.12 }
    };

    const SPEAKER_DEFAULTS = {
        power: 500, rms: 500, maxSPL: 125,
        horizontalCoverage: 90, verticalCoverage: 60,
        frequencyLow: 50, frequencyHigh: 20000,
        mountingHeight: 2.8, mounting: "Wall"
    };

    const CANVAS = { minZoom: 0.25, maxZoom: 5, defaultZoom: 1, gridSize: 0.5, snap: true, grid: true, background: "#0b0f14" };

    const REPORT = { title: "تقرير هندسي", titleEn: "Acoustic Report", footer: "Acoustic Engineering" };

    const FILES = {
        maxDatasheetSize: 20 * 1024 * 1024,
        allowedExtensions: [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".xlsx", ".xls"],
        allowedDatasheetTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"]
    };

    const SECURITY = { sessionTimeout: 86400000, registrationRequired: true, requireLoginForProjects: true, maxProjectNameLength: 150, maxPhoneLength: 30 };

    const LOCAL_STORAGE = { prefix: "acoustic_engineering_", keys: { settings: "settings", user: "user", projects: "projects", activeProject: "active_project" } };

    const UI = { theme: "dark", toastDuration: 3500 };

    const FEATURES = {
        registration: true, authentication: true, projectManagement: true,
        speakerLibrary: true, datasheetUpload: true, manualDesign: true,
        automaticDesign: true, engineeringAnalysis: true, coverageMap: true,
        heatmap: true, bom: true, report: true, reportHTML: true,
        reportJSON: true, printReport: true, firebaseSync: true,
        offlineMode: true, adminDashboard: true
    };

    const MESSAGES = {
        ar: { loading: "جاري المعالجة...", saved: "تم الحفظ", error: "حدث خطأ", loginRequired: "يجب تسجيل الدخول" },
        en: { loading: "Processing...", saved: "Saved", error: "Error", loginRequired: "Please sign in" }
    };

    function getFirebaseConfig() { return { ...FIREBASE.config }; }
    function isFirebaseConfigured() {
        const c = FIREBASE.config;
        return !!(c.apiKey && c.authDomain && c.projectId && c.appId && c.databaseURL);
    }
    function isFeatureEnabled(f) { return !!FEATURES[f]; }
    function getMessage(key, lang = "ar") { return MESSAGES[lang]?.[key] || key; }
    function getVenue(id) { return VENUE_TYPES.find(v => v.id === id) || null; }
    function getEngineeringProfile(id) { return ENGINEERING.profiles[id] || ENGINEERING.profiles.meeting; }
    function getPermissions(role) { return PERMISSIONS[role] || PERMISSIONS.visitor; }
    function hasPermission(role, perm) { const p = getPermissions(role); return p.includes("*") || p.includes(perm); }
    function sanitizeText(v, max = 500) { if (v == null) return ""; return String(v).replace(/[<>]/g,"").trim().slice(0,max); }
    function isValidPhone(v) { const p = String(v||"").trim(); return p ? /^[+]?[0-9\s\-()]{7,30}$/.test(p) : false; }
    function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim()); }
    function isAllowedFile(file) {
        if (!file) return false;
        if (file.size > FILES.maxDatasheetSize) return false;
        if (FILES.allowedDatasheetTypes.includes(file.type)) return true;
        const n = file.name.toLowerCase();
        return FILES.allowedExtensions.some(e => n.endsWith(e));
    }

    const CONFIG = {
        app: APP, routes: ROUTES, firebase: FIREBASE, roles: ROLES,
        permissions: PERMISSIONS, engineering: ENGINEERING, venueTypes: VENUE_TYPES,
        roomMaterials: ROOM_MATERIALS, speakerDefaults: SPEAKER_DEFAULTS,
        canvas: CANVAS, report: REPORT, files: FILES, security: SECURITY,
        localStorage: LOCAL_STORAGE, ui: UI, features: FEATURES, messages: MESSAGES,
        getFirebaseConfig, isFirebaseConfigured, isFeatureEnabled, getMessage,
        getVenue, getEngineeringProfile, getPermissions, hasPermission,
        sanitizeText, isValidPhone, isValidEmail, isAllowedFile
    };

    AE.config = CONFIG;
    window.AcousticConfig = CONFIG;
})();
