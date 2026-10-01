/* ============================================================
   Acoustic Engineering — js/api.js v2.0.0
   REST API client for Express/SQLite backend
   ✅ login يقبل بريداً أو هاتفاً (identifier)
   ✅ timeout على كل الطلبات
   ✅ cache مع TTL + memoization لـ checkServer
   ✅ endpoints كاملة (update, restore, download, specifications)
   ✅ رفع الملفات + تنزيلها
   ✅ normalizing errors + validation errors
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════ Configuration ═══════════════ */

    const DEFAULT_BASE = "/api";
    const DEFAULT_TIMEOUT_MS = 15000;
    const HEALTH_TIMEOUT_MS = 1500;
    const AVAILABLE_TTL_MS = 60 * 1000;   // 60 ثانية

    let _baseUrl = DEFAULT_BASE;

    function getBaseUrl() { return _baseUrl; }
    function setBaseUrl(url) {
        _baseUrl = String(url || DEFAULT_BASE).replace(/\/+$/, "");
    }

    /* ═══════════════ State ═══════════════ */

    const state = {
        serverAvailable: null,           // null | true | false
        lastCheckTime: 0,
        checkPromise: null               // ← memoization
    };

    function emit(name, detail = {}) {
        try {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        } catch { /* ignore */ }
    }

    /* ═══════════════ Error Normalization ═══════════════ */

    function createApiError(message, options = {}) {
        const err = new Error(message || "خطأ في الاتصال بالخادم");
        err.name = "ApiError";
        err.status = options.status || 0;
        err.code = options.code || null;
        err.data = options.data || null;
        err.errors = Array.isArray(options.errors) ? options.errors : [];
        err.isNetworkError = !!options.isNetworkError;
        err.isTimeout = !!options.isTimeout;
        err.isValidation = !!options.isValidation;
        err.isUnauthorized = err.status === 401;
        err.isForbidden = err.status === 403;
        err.isNotFound = err.status === 404;
        return err;
    }

    function normalizeHttpError(status, data) {
        const message = data?.message
                     || data?.error
                     || defaultMessageForStatus(status);

        return createApiError(message, {
            status,
            code: data?.code || null,
            data,
            errors: Array.isArray(data?.errors) ? data.errors : [],
            isValidation: status === 400 && Array.isArray(data?.errors)
        });
    }

    function defaultMessageForStatus(status) {
        const map = {
            400: "بيانات غير صالحة",
            401: "يجب تسجيل الدخول",
            403: "ليس لديك صلاحية",
            404: "العنصر غير موجود",
            409: "تعارض في البيانات",
            413: "الطلب كبير جداً",
            415: "نوع الملف غير مسموح",
            429: "طلبات كثيرة، حاول لاحقاً",
            500: "خطأ داخلي في الخادم",
            502: "الخادم غير متاح مؤقتاً",
            503: "الخدمة غير متاحة",
            504: "انتهت مهلة الاستجابة"
        };
        return map[status] || `خطأ HTTP ${status}`;
    }

    /* ═══════════════ Core Request ═══════════════ */

    /**
     * طلب HTTP موحّد مع timeout + معالجة أخطاء كاملة
     * @param {string} path
     * @param {Object} options
     * @param {string} options.method
     * @param {any}    options.body
     * @param {Object} options.headers
     * @param {Object} options.query
     * @param {number} options.timeout
     * @param {boolean} options.raw — يُعيد Response بدل JSON
     * @param {AbortSignal} options.signal
     */
    async function request(path, options = {}) {
        const url = buildUrl(path, options.query);

        const isFormData = (typeof FormData !== "undefined")
                        && options.body instanceof FormData;

        /* ─── Headers ─── */
        const headers = {
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            ...(options.headers || {})
        };

        /* ─── Body ─── */
        let body = options.body;
        if (body !== undefined && body !== null && !isFormData) {
            if (typeof body === "string") {
                // مُسلسَل مسبقاً
                if (!headers["Content-Type"]) {
                    headers["Content-Type"] = "application/json";
                }
            } else {
                // object
                body = JSON.stringify(body);
                headers["Content-Type"] = "application/json";
            }
        }

        /* ─── Timeout ─── */
        const timeoutMs = Number.isFinite(options.timeout)
            ? options.timeout
            : DEFAULT_TIMEOUT_MS;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        // دمج الإشارات إن وُجدت
        const signal = options.signal
            ? anySignal([options.signal, controller.signal])
            : controller.signal;

        let response;
        try {
            response = await fetch(url, {
                method: options.method || "GET",
                credentials: "include",
                headers,
                body,
                signal,
                mode: "cors",
                cache: "no-store"
            });
        } catch (err) {
            clearTimeout(timer);

            if (err.name === "AbortError") {
                throw createApiError("انتهت مهلة الطلب", {
                    isTimeout: true,
                    code: "TIMEOUT"
                });
            }

            throw createApiError("تعذّر الاتصال بالخادم", {
                isNetworkError: true,
                code: "SERVER_UNREACHABLE"
            });
        } finally {
            clearTimeout(timer);
        }

        /* ─── Raw mode (blob) ─── */
        if (options.raw) {
            if (!response.ok) {
                // جرّب قراءة JSON للخطأ
                let errData = null;
                try { errData = await response.json(); } catch { /* ignore */ }
                throw normalizeHttpError(response.status, errData);
            }
            return response;
        }

        /* ─── JSON mode ─── */
        let data = null;
        const contentType = response.headers.get("Content-Type") || "";

        if (contentType.includes("application/json")) {
            try {
                data = await response.json();
            } catch {
                data = null;
            }
        } else {
            // جرّب قراءة النص
            try {
                const text = await response.text();
                data = text ? { message: text } : null;
            } catch {
                data = null;
            }
        }

        /* ─── HTTP error ─── */
        if (!response.ok) {
            throw normalizeHttpError(response.status, data);
        }

        /* ─── Success flag check (200 + success:false) ─── */
        if (data && typeof data === "object" && data.success === false) {
            throw createApiError(
                data.message || "فشلت العملية",
                {
                    status: response.status,
                    data,
                    errors: Array.isArray(data.errors) ? data.errors : []
                }
            );
        }

        return data;
    }

    function buildUrl(path, query) {
        const base = getBaseUrl();
        const clean = String(path || "").startsWith("/") ? path : "/" + path;

        let url = base + clean;

        if (query && typeof query === "object") {
            const params = new URLSearchParams();
            for (const key of Object.keys(query)) {
                const v = query[key];
                if (v === undefined || v === null || v === "") continue;
                params.append(key, String(v));
            }
            const qs = params.toString();
            if (qs) url += (url.includes("?") ? "&" : "?") + qs;
        }

        return url;
    }

    /**
     * دمج إشارات AbortController
     */
    function anySignal(signals) {
        const controller = new AbortController();

        for (const signal of signals) {
            if (signal.aborted) {
                controller.abort(signal.reason);
                return controller.signal;
            }
            signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
        }

        return controller.signal;
    }

    /* ═══════════════════════════════════════════════════════════
       Server Availability
       ═══════════════════════════════════════════════════════════ */

    /**
     * يتحقق من توفر الخادم — memoized + cache مع TTL
     */
    async function checkServer(options = {}) {
        const force = options.force === true;
        const now = Date.now();

        /* ─── Cache صالح؟ ─── */
        if (!force
            && state.serverAvailable !== null
            && (now - state.lastCheckTime) < AVAILABLE_TTL_MS) {
            return state.serverAvailable;
        }

        /* ─── Memoization — استدعاء متزامن واحد ─── */
        if (state.checkPromise) {
            return state.checkPromise;
        }

        state.checkPromise = (async () => {
            try {
                const response = await fetch(
                    `${getBaseUrl()}/health`,
                    {
                        method: "GET",
                        credentials: "include",
                        headers: { "Accept": "application/json" },
                        signal: AbortSignal.timeout
                            ? AbortSignal.timeout(HEALTH_TIMEOUT_MS)
                            : undefined
                    }
                );

                if (!response.ok) {
                    state.serverAvailable = false;
                    state.lastCheckTime = Date.now();
                    return false;
                }

                const data = await response.json();

                // ✅ يقبل الشكلين: {success:true} أو {ok:true}
                const available = data?.success === true || data?.ok === true;

                state.serverAvailable = available;
                state.lastCheckTime = Date.now();

                emit("api:server-check", { available });

                return available;

            } catch {
                state.serverAvailable = false;
                state.lastCheckTime = Date.now();
                emit("api:server-check", { available: false });
                return false;
            } finally {
                state.checkPromise = null;
            }
        })();

        return state.checkPromise;
    }

    function resetServerStatus() {
        state.serverAvailable = null;
        state.lastCheckTime = 0;
        state.checkPromise = null;
    }

    function isAvailable() {
        return state.serverAvailable === true
            && (Date.now() - state.lastCheckTime) < AVAILABLE_TTL_MS;
    }

    /* ═══════════════════════════════════════════════════════════
       AUTH
       ═══════════════════════════════════════════════════════════ */

    const auth = {
        /**
         * تسجيل حساب جديد
         * @param {Object} data — { name, email, phone, company, password }
         */
        register: (data) =>
            request("/auth/register", { method: "POST", body: data }),

        /**
         * تسجيل الدخول
         * @param {string} identifier — بريد إلكتروني أو رقم هاتف
         * @param {string} password
         */
        login: (identifier, password) =>
            request("/auth/login", {
                method: "POST",
                body: { identifier, password }
            }),

        logout: () =>
            request("/auth/logout", { method: "POST" }),

        me: () =>
            request("/auth/me", { timeout: 5000 }),

        changePassword: (oldPassword, newPassword, confirmPassword) =>
            request("/auth/change-password", {
                method: "POST",
                body: { oldPassword, newPassword, confirmPassword }
            }),

        resetPassword: (email) =>
            request("/auth/reset-password", {
                method: "POST",
                body: { email }
            })
    };

    /* ═══════════════════════════════════════════════════════════
       PROJECTS
       ═══════════════════════════════════════════════════════════ */

    const projects = {
        /**
         * قائمة المشاريع مع pagination + search
         */
        list: (options = {}) =>
            request("/projects", {
                query: {
                    page: options.page,
                    limit: options.limit,
                    q: options.q,
                    archived: options.archived ? "1" : undefined
                }
            }),

        listAll: (options = {}) =>
            request("/projects/all", {
                query: {
                    page: options.page,
                    limit: options.limit
                }
            }),

        get: (id) =>
            request(`/projects/${encodeURIComponent(id)}`),

        create: (data) =>
            request("/projects", { method: "POST", body: data }),

        update: (id, data) =>
            request(`/projects/${encodeURIComponent(id)}`, {
                method: "PUT",
                body: data
            }),

        delete: (id, options = {}) =>
            request(`/projects/${encodeURIComponent(id)}`, {
                method: "DELETE",
                query: {
                    permanent: options.permanent ? "1" : undefined,
                    force: options.force ? "1" : undefined
                }
            }),

        restore: (id) =>
            request(`/projects/${encodeURIComponent(id)}/restore`, {
                method: "POST"
            })
    };

    /* ═══════════════════════════════════════════════════════════
       SPEAKERS
       ═══════════════════════════════════════════════════════════ */

    const speakers = {
        list: (options = {}) =>
            request("/speakers", {
                query: {
                    page: options.page,
                    limit: options.limit,
                    q: options.q,
                    category: options.category
                }
            }),

        get: (id) =>
            request(`/speakers/${encodeURIComponent(id)}`),

        /**
         * جلب المواصفات فقط (بدون ملف)
         */
        getSpecifications: (id) =>
            request(`/speakers/${encodeURIComponent(id)}/specifications`),

        /**
         * إنشاء سماعة — يقبل كائناً أو FormData
         * إذا FormData: أضف 'datasheet' كملف
         */
        create: (data) => {
            const isForm = typeof FormData !== "undefined"
                        && data instanceof FormData;

            return request("/speakers", {
                method: "POST",
                body: isForm ? data : data
            });
        },

        /**
         * تحديث سماعة
         */
        update: (id, data) => {
            const isForm = typeof FormData !== "undefined"
                        && data instanceof FormData;

            return request(`/speakers/${encodeURIComponent(id)}`, {
                method: "PUT",
                body: isForm ? data : data
            });
        },

        delete: (id, options = {}) =>
            request(`/speakers/${encodeURIComponent(id)}`, {
                method: "DELETE",
                query: {
                    force: options.force ? "1" : undefined
                }
            }),

        /**
         * رفع Datasheet لسماعة موجودة
         */
        uploadDatasheet: (id, file) => {
            const form = new FormData();
            form.append("datasheet", file);
            return request(`/speakers/${encodeURIComponent(id)}`, {
                method: "PUT",
                body: form
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════
       REPORTS
       ═══════════════════════════════════════════════════════════ */

    const reports = {
        generate: (data) => {
            if (!data || !data.projectId) {
                throw createApiError("معرّف المشروع مطلوب", {
                    isValidation: true,
                    errors: ["projectId مطلوب"]
                });
            }
            return request("/reports/generate", {
                method: "POST",
                body: data,
                timeout: 60000      // توليد PDF قد يأخذ وقتاً
            });
        },

        list: (options = {}) =>
            request("/reports", {
                query: {
                    page: options.page,
                    limit: options.limit,
                    project_id: options.projectId
                }
            }),

        listAll: (options = {}) =>
            request("/reports/all", {
                query: {
                    page: options.page,
                    limit: options.limit
                }
            }),

        get: (id) =>
            request(`/reports/${encodeURIComponent(id)}`),

        delete: (id) =>
            request(`/reports/${encodeURIComponent(id)}`, {
                method: "DELETE"
            }),

        /**
         * يُعيد URL مباشر للتنزيل (بدون fetch)
         * لاستخدامه في <a href> أو window.open
         */
        downloadUrl: (id) =>
            `${getBaseUrl()}/reports/${encodeURIComponent(id)}/download`,

        /**
         * يُنزّل الملف كـ Blob (لحالات تحتاج تحكم)
         */
        downloadBlob: async (id) => {
            const response = await request(
                `/reports/${encodeURIComponent(id)}/download`,
                { raw: true, timeout: 30000 }
            );

            const blob = await response.blob();

            // استخرج اسم الملف من Content-Disposition
            const cd = response.headers.get("Content-Disposition") || "";
            let filename = `report-${id}.pdf`;
            const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
            if (match) {
                try { filename = decodeURIComponent(match[1]); }
                catch { filename = match[1]; }
            }

            return { blob, filename };
        },

        /**
         * يُنزّل الملف مباشرة (يُشغّل التنزيل)
         */
        download: async (id, customName) => {
            const { blob, filename } = await reports.downloadBlob(id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = customName || filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return { success: true, filename };
        }
    };

    /* ═══════════════════════════════════════════════════════════
       ADMIN (اختصارات لـ admin.html)
       ═══════════════════════════════════════════════════════════ */

    const admin = {
        users: {
            list: (options = {}) =>
                request("/admin/users", { query: options }),
            get: (id) =>
                request(`/admin/users/${encodeURIComponent(id)}`),
            update: (id, data) =>
                request(`/admin/users/${encodeURIComponent(id)}`, {
                    method: "PUT",
                    body: data
                }),
            delete: (id) =>
                request(`/admin/users/${encodeURIComponent(id)}`, {
                    method: "DELETE"
                })
        },

        stats: () =>
            request("/admin/stats"),

        activity: (options = {}) =>
            request("/admin/activity", { query: options }),

        registrations: (options = {}) =>
            request("/admin/registrations", { query: options })
    };

    /* ═══════════════════════════════════════════════════════════
       Public API
       ═══════════════════════════════════════════════════════════ */

    const API = {
        // Config
        getBaseUrl,
        setBaseUrl,

        // State
        state,
        isAvailable,

        // Core
        request,
        checkServer,
        resetServerStatus,

        // Modules
        auth,
        projects,
        speakers,
        reports,
        admin,

        // Error helper
        createApiError
    };

    /* ═══════════════ Exposure ═══════════════ */
    AE.api = API;
    window.AcousticAPI = API;

    console.log("[api.js] v2.0.0 جاهز");

})();
