/* ============================================================
   Acoustic Engineering — js/backend.js v2.0.0
   Unified backend layer: Firebase → Server → LocalStorage
   مع إصلاحات كاملة: أمان، سباق، speakers CRUD، تزامن
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    /* ═══════════════ Dynamic resolution (لا تجميد) ═══════════════ */

    function getFirebase() {
        return AE.firebase || window.AcousticFirebase || null;
    }

    function getAPI() {
        return AE.api || window.AcousticAPI || null;
    }

    function getConfig() {
        return AE.config || window.AcousticConfig || {};
    }

    function getSpeaker() {
        return AE.speaker || window.AcousticSpeaker || null;
    }

    /* ═══════════════ State ═══════════════ */

    const state = {
        mode: "detecting",
        ready: false,
        error: null,
        firebaseAvailable: false,
        serverAvailable: false,
        detectedAt: null
    };

    /* ═══════════════ Ready promise (يمنع السباق) ═══════════════ */
    let resolveReady;
    const readyPromise = new Promise(resolve => { resolveReady = resolve; });

    function waitForReady() {
        return readyPromise;
    }

    /* ═══════════════ Events ═══════════════ */

    function emit(name, detail = {}) {
        try {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        } catch (err) {
            console.warn("[Backend] emit failed:", name, err);
        }
    }

    /* ═══════════════ Secure IDs ═══════════════ */

    function generateId(prefix = "id") {
        try {
            if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
                return `${prefix}_${crypto.randomUUID()}`;
            }
            if (typeof crypto !== "undefined" && crypto.getRandomValues) {
                const bytes = new Uint8Array(8);
                crypto.getRandomValues(bytes);
                const hex = Array.from(bytes)
                    .map(b => b.toString(16).padStart(2, "0"))
                    .join("");
                return `${prefix}_${hex}`;
            }
        } catch { /* ignore */ }

        // fallback ضعيف لكن على الأقل يعمل
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }

    /* ═══════════════ Safe storage (Safari Private Mode) ═══════════════ */

    function safeGet(key, fallback = null) {
        try {
            const v = localStorage.getItem(key);
            return v === null ? fallback : v;
        } catch { return fallback; }
    }

    function safeSet(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch { return false; }
    }

    function safeRemove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch { return false; }
    }

    function safeParse(raw, fallback = null) {
        if (!raw) return fallback;
        try { return JSON.parse(raw); }
        catch { return fallback; }
    }

    /* ═══════════════ Password hashing (للوضع المحلي فقط) ═══════════════ */

    async function hashPassword(password) {
        const str = String(password || "");
        try {
            if (typeof crypto !== "undefined" && crypto.subtle) {
                const data = new TextEncoder().encode(str + "|acoustic-salt");
                const digest = await crypto.subtle.digest("SHA-256", data);
                return Array.from(new Uint8Array(digest))
                    .map(b => b.toString(16).padStart(2, "0"))
                    .join("");
            }
        } catch { /* ignore */ }

        // fallback بسيط (ليس آمناً تشفيرياً، لكنه أفضل من لا شيء)
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return "weak_" + Math.abs(hash).toString(16);
    }

    async function verifyPassword(password, hash) {
        if (!hash) return false;
        const computed = await hashPassword(password);
        return computed === hash;
    }

    /* ═══════════════ Local storage keys ═══════════════ */

    const KEYS = {
        user: "acoustic_engineering_user",
        projects: "acoustic_engineering_projects",
        speakers: "acoustic_engineering_speakers"
    };

    /* ═══════════════ Detection ═══════════════ */

    async function detect() {
        if (state.ready) return state.mode;

        state.mode = "detecting";
        state.error = null;
        emit("backend:detecting");

        /* ─── 1. Firebase ─── */
        const firebase = getFirebase();
        const config = getConfig();

        if (firebase && typeof config.isFirebaseConfigured === "function") {
            try {
                if (config.isFirebaseConfigured()) {
                    if (!firebase.state?.initialized
                        && typeof firebase.initialize === "function") {
                        await firebase.initialize();
                    }

                    if (firebase.state?.available && !firebase.state?.offline) {
                        state.firebaseAvailable = true;
                        state.mode = "firebase";
                        state.ready = true;
                        state.detectedAt = Date.now();

                        const detail = { mode: "firebase", source: firebase };
                        emit("backend:ready", detail);
                        try { resolveReady(detail); } catch { /* ignore */ }
                        return "firebase";
                    }
                }
            } catch (err) {
                console.warn("[Backend] Firebase detection failed:", err);
                state.error = err.message;
            }
        }

        /* ─── 2. Server ─── */
        const api = getAPI();

        if (api && typeof api.checkServer === "function") {
            try {
                const available = await api.checkServer();
                if (available) {
                    state.serverAvailable = true;
                    state.mode = "server";
                    state.ready = true;
                    state.detectedAt = Date.now();

                    const detail = { mode: "server", source: api };
                    emit("backend:ready", detail);
                    try { resolveReady(detail); } catch { /* ignore */ }
                    return "server";
                }
            } catch (err) {
                console.warn("[Backend] Server detection failed:", err);
                state.error = err.message;
            }
        }

        /* ─── 3. Local (fallback دائماً متاح) ─── */
        state.mode = "local";
        state.ready = true;
        state.detectedAt = Date.now();

        const detail = { mode: "local", source: null };
        emit("backend:ready", detail);
        try { resolveReady(detail); } catch { /* ignore */ }

        return "local";
    }

    /* ═══════════════════════════════════════════════════════════
       AUTH MODULE
       ═══════════════════════════════════════════════════════════ */

    const auth = {
        async register(data) {
            await waitForReady();

            const mode = state.mode;
            const { name, email, phone, company, password } = data || {};

            /* ─── تحقق أساسي ─── */
            if (!name || !phone || !password) {
                return {
                    success: false,
                    error: "الاسم ورقم الهاتف وكلمة المرور مطلوبة"
                };
            }

            if (String(password).length < 8) {
                return {
                    success: false,
                    error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
                };
            }

            /* ─── Firebase ─── */
            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb) {
                    return { success: false, error: "Firebase غير متاح" };
                }

                const result = await fb.register(email || phone, password);

                if (result.success) {
                    /* ─── حفظ الملف الشخصي ─── */
                    try {
                        await fb.saveUserProfile(result.user.uid, {
                            uid: result.user.uid,
                            name,
                            email: email || null,
                            phone,
                            company: company || null,
                            role: "user",
                            createdAt: Date.now()
                        });
                    } catch (err) {
                        console.warn("[Backend] saveUserProfile failed:", err);
                    }

                    /* ─── سجل التسجيل ─── */
                    try {
                        await fb.saveRegistration({
                            uid: result.user.uid,
                            name,
                            email: email || null,
                            phone,
                            company: company || null,
                            role: "user",
                            source: "registration",
                            createdAt: Date.now()
                        });
                    } catch (err) {
                        console.warn("[Backend] saveRegistration failed:", err);
                    }
                }

                return {
                    success: result.success,
                    user: result.user,
                    error: result.error
                };
            }

            /* ─── Server ─── */
            if (mode === "server") {
                const api = getAPI();
                if (!api?.auth?.register) {
                    return { success: false, error: "API غير متاح" };
                }

                try {
                    return await api.auth.register({
                        name,
                        phone,
                        email: email || null,
                        company: company || null,
                        password
                    });
                } catch (err) {
                    return {
                        success: false,
                        error: err?.message || "تعذّر الاتصال بالخادم"
                    };
                }
            }

            /* ─── Local ─── */
            const passwordHash = await hashPassword(password);
            const user = {
                uid: generateId("u"),
                name,
                email: email || null,
                phone,
                company: company || null,
                role: "user",
                local: true,
                passwordHash,        // ⚠️ مخزّن مشفّراً
                createdAt: Date.now()
            };

            // لا نُخزّن passwordHash في الحالة العامة
            const safeUser = { ...user };
            delete safeUser.passwordHash;

            safeSet(KEYS.user, JSON.stringify(user));

            return { success: true, user: safeUser };
        },

        async login(emailOrPhone, password) {
            await waitForReady();

            const mode = state.mode;
            const identifier = String(emailOrPhone || "").trim();

            if (!identifier || !password) {
                return { success: false, error: "أدخل بيانات الدخول كاملة" };
            }

            /* ─── Firebase ─── */
            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb) return { success: false, error: "Firebase غير متاح" };

                try {
                    const result = await fb.login(identifier, password);
                    return {
                        success: result.success,
                        user: result.user,
                        error: result.error
                    };
                } catch (err) {
                    return {
                        success: false,
                        error: err?.message || "تعذّر تسجيل الدخول"
                    };
                }
            }

            /* ─── Server ─── */
            if (mode === "server") {
                const api = getAPI();
                if (!api?.auth?.login) {
                    return { success: false, error: "API غير متاح" };
                }

                try {
                    return await api.auth.login(identifier, password);
                } catch (err) {
                    return {
                        success: false,
                        error: err?.message || "تعذّر تسجيل الدخول"
                    };
                }
            }

            /* ─── Local ─── */
            const raw = safeGet(KEYS.user);
            const saved = safeParse(raw);

            if (!saved) {
                return {
                    success: false,
                    error: "لا يوجد حساب محلي. أنشئ حساباً أولاً."
                };
            }

            const matches =
                saved.email === identifier
                || saved.phone === identifier;

            if (!matches) {
                return { success: false, error: "بيانات الدخول غير صحيحة" };
            }

            // ✅ التحقق من كلمة المرور
            const valid = await verifyPassword(password, saved.passwordHash);

            if (!valid) {
                return { success: false, error: "بيانات الدخول غير صحيحة" };
            }

            const user = { ...saved };
            delete user.passwordHash;

            return { success: true, user };
        },

        async logout() {
            await waitForReady();

            const mode = state.mode;

            try {
                if (mode === "firebase") {
                    const fb = getFirebase();
                    if (fb?.logout) await fb.logout();
                } else if (mode === "server") {
                    const api = getAPI();
                    if (api?.auth?.logout) await api.auth.logout();
                }
            } catch (err) {
                console.warn("[Backend] logout error:", err);
            }

            safeRemove(KEYS.user);
            return { success: true };
        },

        async getCurrentUser() {
            await waitForReady();

            const mode = state.mode;

            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb?.getCurrentUser) return null;

                try {
                    return await fb.getCurrentUser();
                } catch {
                    return null;
                }
            }

            if (mode === "server") {
                const api = getAPI();
                if (!api?.auth?.me) return null;

                try {
                    const r = await api.auth.me();
                    return r?.user || null;
                } catch {
                    return null;
                }
            }

            /* ─── Local ─── */
            const raw = safeGet(KEYS.user);
            const saved = safeParse(raw);
            if (!saved) return null;

            const user = { ...saved };
            delete user.passwordHash;
            return user;
        },

        async resetPassword(email) {
            await waitForReady();

            if (state.mode === "firebase") {
                const fb = getFirebase();
                if (typeof fb?.resetPassword === "function") {
                    return await fb.resetPassword(email);
                }
            }

            if (state.mode === "server") {
                const api = getAPI();
                if (typeof api?.auth?.resetPassword === "function") {
                    return await api.auth.resetPassword(email);
                }
            }

            return {
                success: false,
                error: "خدمة استعادة كلمة المرور غير متاحة في هذا الوضع"
            };
        }
    };

    /* ═══════════════════════════════════════════════════════════
       PROJECTS MODULE
       ═══════════════════════════════════════════════════════════ */

    const projects = {
        async list() {
            await waitForReady();

            const mode = state.mode;

            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb?.get) return [];

                try {
                    const result = await fb.get("projects");
                    if (!result?.success || !result.data) return [];

                    const currentUid = fb.getCurrentUserId?.();
                    const all = Object.values(result.data);

                    if (!currentUid) return all;
                    return all.filter(p => !p.ownerId || p.ownerId === currentUid);
                } catch {
                    return [];
                }
            }

            if (mode === "server") {
                const api = getAPI();
                if (!api?.projects?.list) return [];

                try {
                    const r = await api.projects.list();
                    return r?.projects || [];
                } catch {
                    return [];
                }
            }

            /* ─── Local ─── */
            const raw = safeGet(KEYS.projects);
            return safeParse(raw, []);
        },

        async get(id) {
            await waitForReady();

            const mode = state.mode;

            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb?.get) return null;

                const r = await fb.get(`projects/${id}`);
                return r?.success ? r.data : null;
            }

            if (mode === "server") {
                const api = getAPI();
                if (!api?.projects?.get) return null;

                const r = await api.projects.get(id);
                return r?.project || null;
            }

            const all = await this.list();
            return all.find(p => String(p.id) === String(id)) || null;
        },

        async create(data) {
            await waitForReady();

            const mode = state.mode;

            /* ─── Firebase ─── */
            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb?.set) throw new Error("Firebase غير متاح");

                const id = generateId("p");
                const project = {
                    ...data,
                    id,
                    projectId: id,
                    ownerId: fb.getCurrentUserId?.(),
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                const result = await fb.set(`projects/${id}`, project);
                if (!result?.success) {
                    throw new Error(result?.error || "تعذّر حفظ المشروع");
                }

                return project;
            }

            /* ─── Server ─── */
            if (mode === "server") {
                const api = getAPI();
                if (!api?.projects?.create) throw new Error("API غير متاح");

                const r = await api.projects.create(data);
                if (!r?.success) throw new Error(r?.message || "تعذّر إنشاء المشروع");

                return r.project;
            }

            /* ─── Local ─── */
            const list = await this.list();
            const project = {
                ...data,
                id: generateId("p"),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            list.unshift(project);
            safeSet(KEYS.projects, JSON.stringify(list));

            return project;
        },

        async update(id, data) {
            await waitForReady();

            const mode = state.mode;

            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb?.update) throw new Error("Firebase غير متاح");

                const updated = { ...data, id, updatedAt: Date.now() };
                await fb.update(`projects/${id}`, updated);
                return updated;
            }

            if (mode === "server") {
                const api = getAPI();
                if (!api?.projects?.update) throw new Error("API غير متاح");

                const r = await api.projects.update(id, data);
                return r?.project || null;
            }

            const list = await this.list();
            const index = list.findIndex(p => String(p.id) === String(id));
            if (index === -1) throw new Error("المشروع غير موجود");

            list[index] = { ...list[index], ...data, updatedAt: Date.now() };
            safeSet(KEYS.projects, JSON.stringify(list));

            return list[index];
        },

        async delete(id, options = {}) {
            await waitForReady();

            const mode = state.mode;

            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb?.remove) throw new Error("Firebase غير متاح");

                await fb.remove(`projects/${id}`);
                return { success: true };
            }

            if (mode === "server") {
                const api = getAPI();
                if (!api?.projects?.delete) throw new Error("API غير متاح");

                return await api.projects.delete(id, options);
            }

            const list = await this.list();
            const filtered = list.filter(p => String(p.id) !== String(id));
            safeSet(KEYS.projects, JSON.stringify(filtered));

            return { success: true };
        }
    };

    /* ═══════════════════════════════════════════════════════════
       SPEAKERS MODULE — CRUD كامل 🎯
       ═══════════════════════════════════════════════════════════ */

    const speakers = {
        async list() {
            await waitForReady();

            const mode = state.mode;

            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb?.get) return [];

                try {
                    const r = await fb.get("speakers");
                    if (r?.success && r.data) {
                        return Object.entries(r.data).map(([id, spec]) => ({
                            id,
                            ...spec
                        }));
                    }
                } catch { /* ignore */ }

                return [];
            }

            if (mode === "server") {
                const api = getAPI();
                if (api?.speakers?.list) {
                    try {
                        const r = await api.speakers.list();
                        return r?.speakers || [];
                    } catch { /* ignore */ }
                }
                return [];
            }

            /* ─── Local ─── */
            const raw = safeGet(KEYS.speakers);
            return safeParse(raw, []);
        },

        async getById(id) {
            await waitForReady();

            if (state.mode === "server") {
                const api = getAPI();
                if (api?.speakers?.get) {
                    try {
                        const r = await api.speakers.get(id);
                        return r?.speaker || null;
                    } catch { return null; }
                }
            }

            const list = await this.list();
            return list.find(s => String(s.id) === String(id)) || null;
        },

        async create(spec) {
            await waitForReady();

            if (!spec || typeof spec !== "object") {
                throw new Error("مواصفات غير صالحة");
            }

            const mode = state.mode;

            /* ─── Firebase ─── */
            if (mode === "firebase") {
                const fb = getFirebase();
                if (!fb?.set) throw new Error("Firebase غير متاح");

                const id = generateId("spk");
                const record = {
                    ...spec,
                    id,
                    createdAt: Date.now(),
                    createdBy: fb.getCurrentUserId?.()
                };

                const r = await fb.set(`speakers/${id}`, record);
                if (!r?.success) throw new Error(r?.error || "تعذّر الحفظ");

                return record;
            }

            /* ─── Server ─── */
            if (mode === "server") {
                const api = getAPI();
                if (api?.speakers?.create) {
                    const r = await api.speakers.create(spec);
                    return r?.speaker || r;
                }
                // لا API — استمر إلى Local
            }

            /* ─── Local ─── */
            const list = await this.list();
            const record = {
                ...spec,
                id: generateId("spk"),
                createdAt: Date.now()
            };

            list.push(record);
            safeSet(KEYS.speakers, JSON.stringify(list));

            return record;
        },

        async update(id, changes) {
            await waitForReady();

            if (!id) throw new Error("معرّف مطلوب");

            if (state.mode === "server") {
                const api = getAPI();
                if (api?.speakers?.update) {
                    const r = await api.speakers.update(id, changes);
                    return r?.speaker || r;
                }
            }

            const list = await this.list();
            const index = list.findIndex(s => String(s.id) === String(id));
            if (index === -1) throw new Error("السماعة غير موجودة");

            list[index] = { ...list[index], ...changes, updatedAt: Date.now() };
            safeSet(KEYS.speakers, JSON.stringify(list));

            return list[index];
        },

        async delete(id) {
            await waitForReady();

            if (!id) throw new Error("معرّف مطلوب");

            if (state.mode === "server") {
                const api = getAPI();
                if (api?.speakers?.delete) {
                    return await api.speakers.delete(id);
                }
            }

            const list = await this.list();
            const filtered = list.filter(s => String(s.id) !== String(id));
            safeSet(KEYS.speakers, JSON.stringify(filtered));

            return { success: true };
        },

        /**
         * إضافة مواصفات كاملة (يتوافق مع js/speaker.js)
         */
        async addSpec(spec) {
            return this.create(spec);
        }
    };

    /* ═══════════════════════════════════════════════════════════
       REPORTS MODULE
       ═══════════════════════════════════════════════════════════ */

    const reports = {
        async generate(payload) {
            await waitForReady();

            if (state.mode === "server") {
                const api = getAPI();
                if (api?.reports?.generate) {
                    const r = await api.reports.generate(payload);
                    return {
                        success: true,
                        mode: "pdf",
                        report: r.report,
                        file: r.file
                    };
                }
            }

            // Firebase / Local → افتح HTML
            const reportApi = AE.report || window.AcousticReport;
            if (reportApi?.open) {
                try {
                    await reportApi.open();
                } catch (err) {
                    console.warn("[Backend] report.open failed:", err);
                }
                return { success: true, mode: "html" };
            }

            // fallback: انتقل لصفحة HTML
            window.location.href = "report.html";
            return { success: true, mode: "html", redirect: true };
        },

        async list() {
            await waitForReady();

            if (state.mode === "server") {
                const api = getAPI();
                if (api?.reports?.list) {
                    const r = await api.reports.list();
                    return r?.reports || [];
                }
            }

            return [];
        }
    };

    /* ═══════════════════════════════════════════════════════════
       PUBLIC API
       ═══════════════════════════════════════════════════════════ */

    const Backend = {
        state,

        /* Detection */
        detect,
        waitForReady,

        /* Mode */
        getMode: () => state.mode,
        getModeLabel: () => {
            const labels = {
                firebase: "Firebase Cloud",
                server: "Local Server",
                local: "Local Storage",
                detecting: "Detecting..."
            };
            return labels[state.mode] || "Unknown";
        },
        isReady: () => state.ready,
        isFirebaseMode: () => state.mode === "firebase",
        isServerMode: () => state.mode === "server",
        isLocalMode: () => state.mode === "local",

        /* Subscribe */
        onReady: (cb) => {
            if (typeof cb !== "function") return () => {};
            if (state.ready) {
                try { cb({ mode: state.mode }); } catch { /* ignore */ }
                return () => {};
            }
            const handler = (e) => cb(e.detail);
            window.addEventListener("backend:ready", handler);
            return () => window.removeEventListener("backend:ready", handler);
        },

        /* Modules */
        auth,
        projects,
        speakers,
        reports,

        /* Utility */
        generateId,
        hashPassword
    };

    /* ═══════════════ Exposure ═══════════════ */
    AE.backend = Backend;
    window.AcousticBackend = Backend;

    /* ═══════════════ Cross-tab sync (Local mode) ═══════════════ */
    window.addEventListener("storage", (event) => {
        if (!event.key) return;
        if (!event.key.startsWith("acoustic_engineering_")) return;

        emit("backend:storage-changed", {
            key: event.key,
            oldValue: event.oldValue,
            newValue: event.newValue
        });
    });

    /* ═══════════════ Auto-detect ═══════════════ */
    /* ⚠️ نُشغّل detect فوراً بدون 300ms — waitForReady يحمي الباقي */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            detect().catch(err => {
                console.error("[Backend] auto-detect failed:", err);
                // في حالة فشل كارثي، انتقل إلى local
                state.mode = "local";
                state.ready = true;
                try { resolveReady({ mode: "local" }); } catch { /* ignore */ }
            });
        }, { once: true });
    } else {
        detect().catch(err => {
            console.error("[Backend] auto-detect failed:", err);
            state.mode = "local";
            state.ready = true;
            try { resolveReady({ mode: "local" }); } catch { /* ignore */ }
        });
    }

    console.log("[backend.js] v2.0.0 جاهز");

})();
