/* ============================================================
   Acoustic Engineering — js/backend.js
   ⭐ Unified backend layer: Firebase → Server → LocalStorage
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    const state = {
        mode: "detecting", ready: false,
        firebaseAvailable: false, serverAvailable: false
    };

    function emit(name, detail = {}) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    }

    async function detect() {
        state.mode = "detecting";
        emit("backend:detecting");

        // 1. Firebase
        const firebase = AE.firebase || window.AcousticFirebase;
        const config = AE.config || window.AcousticConfig || {};
        if (firebase && typeof config.isFirebaseConfigured === "function") {
            try {
                if (config.isFirebaseConfigured()) {
                    if (!firebase.state?.initialized && typeof firebase.initialize === "function") {
                        await firebase.initialize();
                    }
                    if (firebase.state?.available && !firebase.state?.offline) {
                        state.firebaseAvailable = true;
                        state.mode = "firebase";
                        state.ready = true;
                        emit("backend:ready", { mode: "firebase", source: firebase });
                        return "firebase";
                    }
                }
            } catch (e) { console.warn("[Backend] Firebase failed:", e); }
        }

        // 2. Server
        const api = AE.api || window.AcousticAPI;
        if (api && typeof api.checkServer === "function") {
            try {
                const available = await api.checkServer();
                if (available) {
                    state.serverAvailable = true;
                    state.mode = "server";
                    state.ready = true;
                    emit("backend:ready", { mode: "server", source: api });
                    return "server";
                }
            } catch (e) { console.warn("[Backend] Server failed:", e); }
        }

        // 3. Local
        state.mode = "local";
        state.ready = true;
        emit("backend:ready", { mode: "local", source: null });
        return "local";
    }

    const auth = {
        async register(data) {
            const mode = state.mode;
            if (mode === "firebase") {
                const fb = AE.firebase;
                const result = await fb.register(data.email, data.password);
                if (result.success) {
                    await fb.saveUserProfile(result.user.uid, {
                        uid: result.user.uid, name: data.name, email: data.email,
                        phone: data.phone, role: "user", createdAt: Date.now()
                    });
                    try {
                        await fb.saveRegistration({
                            uid: result.user.uid, name: data.name, email: data.email,
                            phone: data.phone, role: "user",
                            source: "registration", createdAt: Date.now()
                        });
                    } catch (e) { console.warn("Registration log failed:", e); }
                }
                return { success: result.success, user: result.user, error: result.error };
            }
            if (mode === "server") {
                return await AE.api.auth.register({
                    name: data.name, phone: data.phone,
                    email: data.email, company: data.company, password: data.password
                });
            }
            const user = {
                uid: "local_" + Date.now(), name: data.name,
                email: data.email, phone: data.phone, role: "user", local: true
            };
            localStorage.setItem("acoustic_engineering_user", JSON.stringify(user));
            return { success: true, user };
        },
        async login(emailOrPhone, password) {
            const mode = state.mode;
            if (mode === "firebase") {
                const result = await AE.firebase.login(emailOrPhone, password);
                return { success: result.success, user: result.user, error: result.error };
            }
            if (mode === "server") { return await AE.api.auth.login(emailOrPhone, password); }
            const saved = localStorage.getItem("acoustic_engineering_user");
            if (saved) {
                const user = JSON.parse(saved);
                if (user.email === emailOrPhone || user.phone === emailOrPhone) return { success: true, user };
            }
            throw new Error("الوضع المحلي: أنشئ حساباً أولاً.");
        },
        async logout() {
            const mode = state.mode;
            if (mode === "firebase") { await AE.firebase.logout(); }
            else if (mode === "server") { await AE.api.auth.logout(); }
            localStorage.removeItem("acoustic_engineering_user");
            return { success: true };
        },
        async getCurrentUser() {
            const mode = state.mode;
            if (mode === "firebase") return AE.firebase.getCurrentUser();
            if (mode === "server") {
                try { const r = await AE.api.auth.me(); return r.user; } catch { return null; }
            }
            const saved = localStorage.getItem("acoustic_engineering_user");
            return saved ? JSON.parse(saved) : null;
        }
    };

    const projects = {
        async list() {
            const mode = state.mode;
            if (mode === "firebase") {
                try {
                    const result = await AE.firebase.get("projects");
                    if (!result.success || !result.data) return [];
                    return Object.values(result.data).filter(p =>
                        !p.ownerId || p.ownerId === AE.firebase.getCurrentUserId()
                    );
                } catch { return []; }
            }
            if (mode === "server") { const r = await AE.api.projects.list(); return r.projects || []; }
            const raw = localStorage.getItem("acoustic_engineering_projects");
            return raw ? JSON.parse(raw) : [];
        },
        async get(id) {
            const mode = state.mode;
            if (mode === "firebase") {
                const r = await AE.firebase.get(`projects/${id}`);
                return r.success ? r.data : null;
            }
            if (mode === "server") { const r = await AE.api.projects.get(id); return r.project; }
            const all = await this.list();
            return all.find(p => String(p.id) === String(id)) || null;
        },
        async create(data) {
            const mode = state.mode;
            if (mode === "firebase") {
                const id = "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
                const project = {
                    ...data, id, projectId: id,
                    ownerId: AE.firebase.getCurrentUserId(),
                    createdAt: Date.now(), updatedAt: Date.now()
                };
                await AE.firebase.set(`projects/${id}`, project);
                return project;
            }
            if (mode === "server") { const r = await AE.api.projects.create(data); return r.project; }
            const projects = await this.list();
            const project = { ...data, id: "p_" + Date.now(), createdAt: Date.now(), updatedAt: Date.now() };
            projects.unshift(project);
            localStorage.setItem("acoustic_engineering_projects", JSON.stringify(projects));
            return project;
        },
        async update(id, data) {
            const mode = state.mode;
            if (mode === "firebase") {
                const updated = { ...data, id, updatedAt: Date.now() };
                await AE.firebase.update(`projects/${id}`, updated);
                return updated;
            }
            if (mode === "server") { const r = await AE.api.projects.update(id, data); return r.project; }
            const projects = await this.list();
            const index = projects.findIndex(p => String(p.id) === String(id));
            if (index === -1) throw new Error("Project not found");
            projects[index] = { ...projects[index], ...data, updatedAt: Date.now() };
            localStorage.setItem("acoustic_engineering_projects", JSON.stringify(projects));
            return projects[index];
        },
        async delete(id) {
            const mode = state.mode;
            if (mode === "firebase") { await AE.firebase.remove(`projects/${id}`); return { success: true }; }
            if (mode === "server") { return await AE.api.projects.delete(id); }
            const projects = await this.list();
            const filtered = projects.filter(p => String(p.id) !== String(id));
            localStorage.setItem("acoustic_engineering_projects", JSON.stringify(filtered));
            return { success: true };
        }
    };

    const speakers = {
        async list() {
            const mode = state.mode;
            if (mode === "firebase") {
                try {
                    const r = await AE.firebase.get("speakers");
                    if (r.success && r.data) return Object.values(r.data);
                } catch {}
            }
            if (mode === "server") { const r = await AE.api.speakers.list(); return r.speakers || []; }
            if (AE.speaker && typeof AE.speaker.getAll === "function") return AE.speaker.getAll();
            return [];
        }
    };

    const reports = {
        async generate(data) {
            const mode = state.mode;
            if (mode === "server") {
                const r = await AE.api.reports.generate(data);
                return { success: true, mode: "pdf", file: r.file };
            }
            if (AE.report && typeof AE.report.open === "function") {
                AE.report.open();
                return { success: true, mode: "html" };
            }
            return { success: false };
        }
    };

    const Backend = {
        state, detect,
        getMode: () => state.mode,
        getModeLabel: () => ({
            firebase: "Firebase Cloud",
            server: "Local Server",
            local: "Local Storage",
            detecting: "Detecting..."
        }[state.mode] || "Unknown"),
        isReady: () => state.ready,
        onReady: (cb) => {
            if (typeof cb !== "function") return () => {};
            if (state.ready) { cb({ mode: state.mode }); return () => {}; }
            const handler = (e) => cb(e.detail);
            window.addEventListener("backend:ready", handler);
            return () => window.removeEventListener("backend:ready", handler);
        },
        auth, projects, speakers, reports
    };

    AE.backend = Backend;
    window.AcousticBackend = Backend;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => setTimeout(detect, 300), { once: true });
    } else {
        setTimeout(detect, 300);
    }
})();
