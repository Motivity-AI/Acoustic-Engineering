/* ============================================================
   Acoustic Engineering — js/storage.js
   Local + Cloud project persistence
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;
    const CONFIG = AE.config || window.AcousticConfig || {};
    const Backend = AE.backend || window.AcousticBackend || null;

    const PREFIX = CONFIG.localStorage?.prefix || "acoustic_engineering_";

    function key(k) { return PREFIX + k; }

    function localSet(k, v) {
        try { localStorage.setItem(key(k), JSON.stringify(v)); return true; }
        catch (e) { console.warn("localSet failed:", e); return false; }
    }

    function localGet(k, fallback = null) {
        try {
            const raw = localStorage.getItem(key(k));
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) { return fallback; }
    }

    function localRemove(k) {
        try { localStorage.removeItem(key(k)); } catch {}
    }

    function generateId(prefix = "project") {
        return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }

    async function saveProject(project) {
        try {
            if (Backend) {
                const result = await Backend.projects.create(project);
                return { success: true, project: result };
            }
            const projects = localGet("projects", []);
            const p = { ...project, id: project.id || generateId(), updatedAt: Date.now() };
            const index = projects.findIndex(x => x.id === p.id);
            if (index >= 0) projects[index] = p; else projects.unshift(p);
            localSet("projects", projects);
            return { success: true, project: p };
        } catch (e) { return { success: false, error: e.message }; }
    }

    async function loadProject(id) {
        try {
            if (Backend) {
                const p = await Backend.projects.get(id);
                return { success: !!p, project: p };
            }
            const projects = localGet("projects", []);
            const p = projects.find(x => String(x.id) === String(id));
            return { success: !!p, project: p };
        } catch (e) { return { success: false, error: e.message }; }
    }

    async function loadProjects() {
        try {
            if (Backend) {
                const projects = await Backend.projects.list();
                return { success: true, projects };
            }
            return { success: true, projects: localGet("projects", []) };
        } catch (e) { return { success: false, projects: [], error: e.message }; }
    }

    async function deleteProject(id) {
        try {
            if (Backend) return await Backend.projects.delete(id);
            const projects = localGet("projects", []);
            localSet("projects", projects.filter(x => String(x.id) !== String(id)));
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    }

    function getCurrentProject() { return localGet("activeProject", null); }
    function setCurrentProject(project) { localSet("activeProject", project); }

    function getSettings() { return localGet("settings", {}); }
    function saveSettings(s) {
        const merged = { ...getSettings(), ...s, updatedAt: Date.now() };
        localSet("settings", merged);
        return merged;
    }

    const StorageAPI = {
        saveProject, loadProject, loadProjects, deleteProject,
        getCurrentProject, setCurrentProject,
        getSettings, saveSettings,
        generateId,
        localSet, localGet, localRemove
    };

    AE.storage = StorageAPI;
    window.AcousticStorage = StorageAPI;
})();
