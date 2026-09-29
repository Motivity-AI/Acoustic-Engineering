/* ============================================================
   Acoustic Engineering — js/api.js
   REST API client for Express/SQLite backend
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;
    const API_BASE = "/api";
    let serverAvailable = null;

    async function request(path, options = {}) {
        const url = `${API_BASE}${path}`;
        const config = {
            credentials: "include",
            ...options,
            headers: {
                ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
                ...(options.headers || {})
            }
        };
        let response;
        try { response = await fetch(url, config); }
        catch (e) { throw new Error("SERVER_UNREACHABLE"); }
        let data;
        try { data = await response.json(); } catch { data = {}; }
        if (!response.ok) {
            const err = new Error(data.message || `HTTP ${response.status}`);
            err.status = response.status; err.data = data; throw err;
        }
        return data;
    }

    async function checkServer() {
        if (serverAvailable !== null) return serverAvailable;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1500);
            const response = await fetch(`${API_BASE}/health`, { signal: controller.signal, credentials: "include" });
            clearTimeout(timeout);
            if (!response.ok) { serverAvailable = false; return false; }
            const data = await response.json();
            serverAvailable = !!data.success;
            return serverAvailable;
        } catch { serverAvailable = false; return false; }
    }

    function resetServerStatus() { serverAvailable = null; }

    const auth = {
        register: (data) => request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
        login: (phone, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ phone, password }) }),
        logout: () => request("/auth/logout", { method: "POST" }),
        me: () => request("/auth/me")
    };

    const projects = {
        list: () => request("/projects"),
        listAll: () => request("/projects/all"),
        get: (id) => request(`/projects/${id}`),
        create: (data) => request("/projects", { method: "POST", body: JSON.stringify(data) }),
        update: (id, data) => request(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
        delete: (id) => request(`/projects/${id}`, { method: "DELETE" })
    };

    const speakers = {
        list: () => request("/speakers"),
        get: (id) => request(`/speakers/${id}`),
        create: (data) => {
            const isForm = data instanceof FormData;
            return request("/speakers", { method: "POST", body: isForm ? data : JSON.stringify(data) });
        },
        delete: (id) => request(`/speakers/${id}`, { method: "DELETE" })
    };

    const reports = {
        generate: (data) => request("/reports/generate", { method: "POST", body: JSON.stringify(data) }),
        list: () => request("/reports"),
        listAll: () => request("/reports/all")
    };

    const API = {
        checkServer, resetServerStatus, request,
        auth, projects, speakers, reports,
        isAvailable: () => serverAvailable === true
    };

    AE.api = API;
    window.AcousticAPI = API;
})();
