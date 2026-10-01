/* ============================================================
   Acoustic Engineering — js/storage.js v2.0.0
   Local + Cloud project persistence
   ✅ مفاتيح موحّدة مع app.js و report.html
   ✅ saveProject يحفظ أو يُحدّث (لا تكرار)
   ✅ Backend dynamic (لا تجميد)
   ✅ حماية من Quota Exceeded
   ✅ ID آمن + مزامنة تبويبات
   ✅ waitForReady() لمنع السباق
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════ Resolution ═══════════════ */

    function getBackend() {
        return AE.backend || window.AcousticBackend || null;
    }

    function getConfig() {
        return AE.config || window.AcousticConfig || {};
    }

    /* ═══════════════════════════════════════════════════════════
       المفاتيح الموحّدة (يجب أن تتطابق مع app.js و report.html)
       ═══════════════════════════════════════════════════════════ */

    const KEYS = Object.freeze({
        // المفتاح الرئيسي الذي يستخدمه app.js
        PROJECTS: "acoustic_engineering_projects",

        // المفتاح الحالي (يستخدمه app.js)
        CURRENT_PROJECT: "acoustic_engineering_currentProject",

        // مفاتيح قديمة للتوافق الخلفي
        CURRENT_PROJECT_LEGACY: "acousticEngineering_currentProject",
        CURRENT_PROJECT_LEGACY_2: "acoustic_engineering_activeProject",

        // الإعدادات
        SETTINGS: "acoustic_engineering_settings",

        // السماعات (نفس ما في backend.js)
        SPEAKERS: "acoustic_engineering_speakers",

        // المستخدم (نفس ما في backend.js)
        USER: "acoustic_engineering_user"
    });

    /* ═══════════════ Safe Storage ═══════════════ */

    function safeSet(key, value) {
        try {
            const json = JSON.stringify(value);
            localStorage.setItem(key, json);
            return { success: true, size: json.length };
        } catch (err) {
            if (err.name === "QuotaExceededError" ||
                err.code === 22 ||
                err.code === 1014) {
                console.warn("[Storage] Quota exceeded for key:", key);
                return { success: false, error: "QUOTA_EXCEEDED", message: "المساحة المتاحة ممتلئة. احذف مشاريع قديمة." };
            }
            console.warn("[Storage] setItem failed:", err.message);
            return { success: false, error: "STORAGE_ERROR", message: err.message };
        }
    }

    function safeGet(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null || raw === undefined) return fallback;
            return JSON.parse(raw);
        } catch (err) {
            console.warn("[Storage] parse failed for key:", key, err.message);
            return fallback;
        }
    }

    function safeRemove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch {
            return false;
        }
    }

    /* ═══════════════ Quota Check ═══════════════ */

    /**
     * يقدّر حجم localStorage الحالي بالبايت
     */
    function estimateStorageSize() {
        let total = 0;
        try {
            for (const key in localStorage) {
                if (!Object.prototype.hasOwnProperty.call(localStorage, key)) continue;
                total += key.length + (localStorage.getItem(key) || "").length;
            }
        } catch { /* ignore */ }
        return total * 2; // UTF-16 → بايت
    }

    /**
     * هل يمكننا الحفظ؟
     * @param {number} additionalBytes
     * @param {number} maxBytes — افتراضي 4.5 MB (أقل من 5 MB للأمان)
     */
    function canStore(additionalBytes = 0, maxBytes = 4.5 * 1024 * 1024) {
        const current = estimateStorageSize();
        return (current + additionalBytes) < maxBytes;
    }

    /* ═══════════════ Secure ID ═══════════════ */

    let _idCounter = 0;

    function generateId(prefix = "project") {
        try {
            if (typeof crypto !== "undefined") {
                if (typeof crypto.randomUUID === "function") {
                    return `${prefix}_${crypto.randomUUID()}`;
                }
                if (crypto.getRandomValues) {
                    const b = new Uint8Array(8);
                    crypto.getRandomValues(b);
                    const hex = Array.from(b)
                        .map(x => x.toString(16).padStart(2, "0"))
                        .join("");
                    return `${prefix}_${hex}`;
                }
            }
        } catch { /* ignore */ }

        return `${prefix}_${Date.now().toString(36)}_${_idCounter++}`;
    }

    /* ═══════════════ Ready Promise ═══════════════ */

    let resolveReady;
    const readyPromise = new Promise(resolve => { resolveReady = resolve; });
    let _ready = false;

    async function waitForReady() {
        const backend = getBackend();
        if (backend && typeof backend.waitForReady === "function") {
            try {
                await Promise.race([
                    backend.waitForReady(),
                    new Promise(r => setTimeout(r, 3000))
                ]);
            } catch { /* ignore */ }
        }
        if (!_ready) {
            try { await readyPromise; } catch { /* ignore */ }
        }
    }

    function markReady() {
        if (_ready) return;
        _ready = true;
        try { resolveReady(); } catch { /* ignore */ }
    }

    /* ═══════════════════════════════════════════════════════════
       PROJECTS
       ═══════════════════════════════════════════════════════════ */

    /**
     * يحفظ مشروعاً — يُحدّث إن كان `id` موجوداً، وإلا يُنشئ
     */
    async function saveProject(project) {
        if (!project || typeof project !== "object") {
            return { success: false, error: "INVALID_PROJECT", message: "بيانات المشروع غير صالحة" };
        }

        await waitForReady();

        const backend = getBackend();
        const hasId = project.id && String(project.id).length > 0;
        const projectId = hasId ? project.id : generateId("project");
        const now = Date.now();

        const payload = {
            ...project,
            id: projectId,
            updatedAt: now,
            createdAt: project.createdAt || now,
            savedAt: new Date().toISOString()
        };

        /* ─── 1. Backend mode ─── */
        if (backend?.projects) {
            try {
                const mode = backend.getMode?.();

                if (mode === "firebase" || mode === "server") {
                    // هل المشروع موجود؟
                    let exists = false;
                    if (hasId && typeof backend.projects.get === "function") {
                        try {
                            const found = await backend.projects.get(projectId);
                            exists = !!found;
                        } catch { /* ignore */ }
                    }

                    if (exists && typeof backend.projects.update === "function") {
                        await backend.projects.update(projectId, payload);
                    } else if (typeof backend.projects.create === "function") {
                        await backend.projects.create(payload);
                    }

                    setCurrentProject(payload);
                    return { success: true, project: payload };
                }

                // في الوضع المحلي، لا نثق بـ backend.projects.create (يُكرر)
                // → ننتقل إلى LocalStorage
            } catch (err) {
                console.warn("[Storage] backend save failed, falling back to local:", err);
            }
        }

        /* ─── 2. LocalStorage ─── */
        const projects = safeGet(KEYS.PROJECTS, []);
        const list = Array.isArray(projects) ? projects : [];

        const index = list.findIndex(p => String(p.id) === String(projectId));

        if (index >= 0) {
            list[index] = payload;
        } else {
            list.unshift(payload);
        }

        // احذف أقدم المشاريع إذا تجاوزنا الحد الأقصى
        const MAX_PROJECTS = 100;
        if (list.length > MAX_PROJECTS) {
            list.length = MAX_PROJECTS;
        }

        const result = safeSet(KEYS.PROJECTS, list);
        if (!result.success) {
            return {
                success: false,
                error: result.error,
                message: result.message || "تعذّر الحفظ"
            };
        }

        // ✅ حدّث المشروع الحالي بمفتاح واحد
        setCurrentProject(payload);

        return { success: true, project: payload };
    }

    /**
     * يحمّل مشروعاً بالمعرّف
     */
    async function loadProject(id) {
        if (!id) return { success: false, error: "INVALID_ID", message: "معرّف غير صالح" };

        await waitForReady();

        const backend = getBackend();

        /* ─── Backend mode ─── */
        if (backend?.projects?.get) {
            try {
                const mode = backend.getMode?.();
                if (mode === "firebase" || mode === "server") {
                    const p = await backend.projects.get(id);
                    if (p) return { success: true, project: p };
                }
            } catch (err) {
                console.warn("[Storage] backend load failed:", err);
            }
        }

        /* ─── LocalStorage ─── */
        const projects = safeGet(KEYS.PROJECTS, []);
        const list = Array.isArray(projects) ? projects : [];
        const p = list.find(x => String(x.id) === String(id));

        return { success: !!p, project: p || null };
    }

    /**
     * يُعيد قائمة المشاريع
     */
    async function loadProjects() {
        await waitForReady();

        const backend = getBackend();

        /* ─── Backend mode ─── */
        if (backend?.projects?.list) {
            try {
                const mode = backend.getMode?.();
                if (mode === "firebase" || mode === "server") {
                    const list = await backend.projects.list();
                    return { success: true, projects: Array.isArray(list) ? list : [] };
                }
            } catch (err) {
                console.warn("[Storage] backend list failed:", err);
            }
        }

        /* ─── LocalStorage ─── */
        const projects = safeGet(KEYS.PROJECTS, []);
        return { success: true, projects: Array.isArray(projects) ? projects : [] };
    }

    /**
     * يحذف مشروعاً
     */
    async function deleteProject(id, options = {}) {
        if (!id) return { success: false, error: "INVALID_ID" };

        await waitForReady();

        const backend = getBackend();

        /* ─── Backend mode ─── */
        if (backend?.projects?.delete) {
            try {
                const mode = backend.getMode?.();
                if (mode === "firebase" || mode === "server") {
                    const result = await backend.projects.delete(id, options);
                    if (result?.success !== false) {
                        // إن كان المشروع الحالي محذوفاً → امسح
                        const current = getCurrentProject();
                        if (current && String(current.id) === String(id)) {
                            clearCurrentProject();
                        }
                        return { success: true };
                    }
                }
            } catch (err) {
                console.warn("[Storage] backend delete failed:", err);
            }
        }

        /* ─── LocalStorage ─── */
        const projects = safeGet(KEYS.PROJECTS, []);
        const list = Array.isArray(projects) ? projects : [];
        const filtered = list.filter(x => String(x.id) !== String(id));

        safeSet(KEYS.PROJECTS, filtered);

        // إن كان المشروع الحالي محذوفاً → امسح
        const current = getCurrentProject();
        if (current && String(current.id) === String(id)) {
            clearCurrentProject();
        }

        return { success: true };
    }

    /**
     * حذف كل المشاريع
     */
    function clearAllProjects() {
        safeRemove(KEYS.PROJECTS);
        clearCurrentProject();
        return { success: true };
    }

    /* ═══════════════════════════════════════════════════════════
       CURRENT PROJECT
       ═══════════════════════════════════════════════════════════ */

    /**
     * يُعيد المشروع الحالي — يقرأ من 3 مفاتيح للتوافق
     */
    function getCurrentProject() {
        // 1. المفتاح الرئيسي (app.js)
        let p = safeGet(KEYS.CURRENT_PROJECT, null);
        if (p && typeof p === "object") return p;

        // 2. مفاتيح قديمة (report.html / register.html)
        p = safeGet(KEYS.CURRENT_PROJECT_LEGACY, null);
        if (p && typeof p === "object") {
            // رحّله للمفتاح الجديد
            try { setCurrentProject(p); } catch { /* ignore */ }
            return p;
        }

        p = safeGet(KEYS.CURRENT_PROJECT_LEGACY_2, null);
        if (p && typeof p === "object") {
            try { setCurrentProject(p); } catch { /* ignore */ }
            return p;
        }

        return null;
    }

    /**
     * يضبط المشروع الحالي — يكتب في جميع المفاتيح للتوافق
     */
    function setCurrentProject(project) {
        if (!project || typeof project !== "object") return false;

        const withMeta = {
            ...project,
            _savedAt: Date.now()
        };

        // اكتب في المفتاح الرئيسي
        const r1 = safeSet(KEYS.CURRENT_PROJECT, withMeta);

        // اكتب في المفاتيح القديمة للتوافق الخلفي
        try { safeSet(KEYS.CURRENT_PROJECT_LEGACY, withMeta); } catch { /* ignore */ }

        return r1.success;
    }

    /**
     * امسح المشروع الحالي
     */
    function clearCurrentProject() {
        safeRemove(KEYS.CURRENT_PROJECT);
        safeRemove(KEYS.CURRENT_PROJECT_LEGACY);
        safeRemove(KEYS.CURRENT_PROJECT_LEGACY_2);
        return true;
    }

    /* ═══════════════════════════════════════════════════════════
       SETTINGS
       ═══════════════════════════════════════════════════════════ */

    const DEFAULT_SETTINGS = Object.freeze({
        autoSave: true,
        grid: true,
        snap: true,
        coverage: true,
        language: "ar",
        theme: "dark"
    });

    function getSettings() {
        const saved = safeGet(KEYS.SETTINGS, {});
        return { ...DEFAULT_SETTINGS, ...(saved || {}) };
    }

    function saveSettings(settings) {
        if (!settings || typeof settings !== "object") return getSettings();

        const merged = {
            ...getSettings(),
            ...settings,
            updatedAt: Date.now()
        };

        safeSet(KEYS.SETTINGS, merged);

        try {
            window.dispatchEvent(new CustomEvent("storage:settings-changed", {
                detail: merged
            }));
        } catch { /* ignore */ }

        return merged;
    }

    /* ═══════════════════════════════════════════════════════════
       CROSS-TAB SYNC
       ═══════════════════════════════════════════════════════════ */

    window.addEventListener("storage", (event) => {
        if (!event.key) return;
        if (!event.key.startsWith("acoustic_")) return;

        try {
            window.dispatchEvent(new CustomEvent("storage:changed", {
                detail: {
                    key: event.key,
                    oldValue: event.oldValue,
                    newValue: event.newValue
                }
            }));
        } catch { /* ignore */ }
    });

    /* ═══════════════════════════════════════════════════════════
       MIGRATION — نقل المفاتيح القديمة
       ═══════════════════════════════════════════════════════════ */

    function migrateLegacyData() {
        try {
            /* ─── 1. رحّل currentProject القديم ─── */
            const oldCurrent = safeGet(KEYS.CURRENT_PROJECT_LEGACY, null);
            if (oldCurrent && !safeGet(KEYS.CURRENT_PROJECT, null)) {
                setCurrentProject(oldCurrent);
                console.log("[Storage] migrated currentProject to new key");
            }

            /* ─── 2. تأكد أن المشاريع مصفوفة ─── */
            const projects = safeGet(KEYS.PROJECTS, null);
            if (projects && !Array.isArray(projects)) {
                safeSet(KEYS.PROJECTS, []);
                console.warn("[Storage] reset corrupted projects array");
            }

        } catch (err) {
            console.warn("[Storage] migration failed:", err);
        }
    }

    /* ═══════════════════════════════════════════════════════════
       API
       ═══════════════════════════════════════════════════════════ */

    const StorageAPI = {
        // Constants
        KEYS,
        DEFAULT_SETTINGS,

        // Ready
        waitForReady,
        isReady: () => _ready,

        // Projects
        saveProject,
        loadProject,
        loadProjects,
        deleteProject,
        clearAllProjects,

        // Current
        getCurrentProject,
        setCurrentProject,
        clearCurrentProject,

        // Settings
        getSettings,
        saveSettings,

        // Utilities
        generateId,
        estimateStorageSize,
        canStore,

        // Low-level (للاستخدام المتقدّم فقط)
        localSet: (k, v) => safeSet(k, v).success,
        localGet: safeGet,
        localRemove: safeRemove,

        // Migration
        migrate: migrateLegacyData
    };

    /* ═══════════════ Exposure ═══════════════ */
    AE.storage = StorageAPI;
    window.AcousticStorage = StorageAPI;

    /* ═══════════════ Auto-init ═══════════════ */
    function init() {
        try {
            migrateLegacyData();
        } catch (err) {
            console.warn("[Storage] init failed:", err);
        } finally {
            markReady();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

    console.log("[storage.js] v2.0.0 جاهز");

})();
