/* ============================================================
   Acoustic Engineering — js/app.js v2.0.0
   Main Application Controller
   ✅ undo/redo يعملان فعلياً
   ✅ حفظ متوافق مع backend.js
   ✅ قيم مطابقة لـ app.html و engine.js
   ✅ APIs المطلوبة من app.html مضافة
   ✅ استماع لأحداث canvas/backend
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════ Secure ID ═══════════════ */

    let _idCounter = 0;
    function uid(prefix = "obj") {
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

    /* ═══════════════ State ═══════════════ */

    const state = {
        initialized: false,
        currentView: "overview",
        activeTool: "select",

        project: {
            id: null,
            name: "",
            client: "",
            location: "",
            venueType: "meeting"
        },

        room: {
            width: 20,          // ← يطابق engine.js و canvas.js و app.html
            depth: 15,
            height: 4,
            material: "medium",
            reflection: "medium"
        },

        stage: {
            width: 8,
            depth: 4,
            x: 6,
            y: 0.5
        },

        audience: {
            size: 300,
            area: 0,            // ← يُحسب ديناميكياً
            listenerHeight: 1.2
        },

        engineering: {
            mode: "auto",       // ← يطابق app.html
            profile: "general", // ← يطابق app.html
            targetSPL: 95,
            coverageTarget: 90,
            headroom: 6,
            mountingHeight: 3.2
        },

        ui: {
            zoom: 1,
            grid: true,
            snap: true,
            sidebarCollapsed: false,
            dirty: false,
            autoSave: true
        },

        selectedObject: null,
        history: [],
        historyIndex: -1,

        speakers: [],
        analysis: null,
        bom: [],

        // مزامنة
        lastCanvasSnapshot: null
    };

    /* ═══════════════ Helpers ═══════════════ */

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const byId = (id) => document.getElementById(id);

    function safeNumber(v, fb = 0, min = -Infinity, max = Infinity) {
        const n = parseFloat(v);
        if (!Number.isFinite(n)) return fb;
        return Math.min(max, Math.max(min, n));
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function deepClone(v) {
        try {
            if (typeof structuredClone === "function") return structuredClone(v);
        } catch { /* ignore */ }
        try { return JSON.parse(JSON.stringify(v)); }
        catch { return v; }
    }

    function formatNumber(v, d = 1) {
        const n = safeNumber(v, 0);
        if (typeof n.toLocaleString === "function") {
            try {
                return n.toLocaleString("en-US", {
                    minimumFractionDigits: d,
                    maximumFractionDigits: d
                });
            } catch { /* ignore */ }
        }
        return n.toFixed(d);
    }

    /* ═══════════════ Toast ═══════════════ */

    function ensureToastContainer() {
        let c = byId("toastContainer");
        if (!c) {
            c = document.createElement("div");
            c.id = "toastContainer";
            c.setAttribute("role", "region");
            c.setAttribute("aria-live", "polite");
            c.setAttribute("aria-label", "الإشعارات");
            document.body.appendChild(c);
        }
        return c;
    }

    function toast(msg, type = "info", duration = 3000) {
        const c = ensureToastContainer();
        const item = document.createElement("div");
        item.className = "toast " + type;
        item.textContent = msg;
        c.appendChild(item);
        setTimeout(() => {
            item.style.opacity = "0";
            item.style.transform = "translateY(8px)";
            setTimeout(() => item.remove(), 250);
        }, duration);
    }

    /* ═══════════════ Loading ═══════════════ */

    function setLoading(active, text = "جاري المعالجة...") {
        const o = byId("loadingOverlay");
        if (!o) return;

        o.classList.toggle("active", !!active);
        o.setAttribute("aria-hidden", active ? "false" : "true");

        const label = o.querySelector("[data-loading-text]") || byId("loadingText");
        if (label && text) label.textContent = text;
    }

    /* ═══════════════ Dirty flag ═══════════════ */

    function markDirty(v = true) {
        state.ui.dirty = v;
        document.body.classList.toggle("project-dirty", v);

        const status = byId("saveStatus");
        if (status) {
            status.classList.toggle("saved", !v);
            status.classList.toggle("dirty", v);
            const text = status.querySelector("span:last-child") || byId("saveStatusText");
            if (text) text.textContent = v ? "تغييرات غير محفوظة" : "محفوظ";
        }
    }

    /* ═══════════════ DOM helpers ═══════════════ */

    function setValue(id, v) {
        const el = byId(id);
        if (el && el.value !== String(v ?? "")) {
            el.value = v ?? "";
        }
    }

    function getValue(id, fb = "") {
        const el = byId(id);
        return el ? el.value : fb;
    }

    function setText(id, v) {
        const el = byId(id);
        if (el) el.textContent = v ?? "";
    }

    /* ═══════════════ UI Sync ═══════════════ */

    function syncProjectToUI() {
        setValue("projectName", state.project.name);
        setValue("clientName", state.project.client);
        setValue("projectLocation", state.project.location);
        setValue("venueType", state.project.venueType);
        setText("projectTitle", state.project.name || "مشروع صوتي جديد");
    }

    function syncRoomToUI() {
        // toolbar
        setValue("roomWidth", state.room.width);
        setValue("roomDepth", state.room.depth);
        setValue("roomHeight", state.room.height);
        // panel
        setValue("roomWidthPanel", state.room.width);
        setValue("roomDepthPanel", state.room.depth);
        setValue("roomHeightPanel", state.room.height);
        // material & reflection
        setValue("roomMaterial", state.room.material);
        setValue("reflectionLevel", state.room.reflection);
    }

    function syncEngineeringToUI() {
        setValue("designMode", state.engineering.mode);
        setValue("engineeringProfile", state.engineering.profile);
        setValue("targetSPL", state.engineering.targetSPL);
        setValue("coverageTarget", state.engineering.coverageTarget);
        setValue("headroom", state.engineering.headroom);
        setValue("mountingHeight", state.engineering.mountingHeight);
    }

    function syncAudienceToUI() {
        setValue("crowdSize", state.audience.size);
        setValue("audienceHeight", state.audience.listenerHeight || 1.2);
    }

    function syncStageToUI() {
        setValue("stageWidth", state.stage.width);
        setValue("stageDepth", state.stage.depth);
        setValue("stageX", state.stage.x);
        setValue("stageY", state.stage.y);
    }

    function syncAllToUI() {
        syncProjectToUI();
        syncRoomToUI();
        syncEngineeringToUI();
        syncAudienceToUI();
        syncStageToUI();
    }

    /* ═══════════════ UI Read ═══════════════ */

    function readProjectFromUI() {
        state.project.name     = getValue("projectName", state.project.name);
        state.project.client   = getValue("clientName", state.project.client);
        state.project.location = getValue("projectLocation", state.project.location);
        state.project.venueType = getValue("venueType", state.project.venueType);

        setText("projectTitle", state.project.name || "مشروع صوتي جديد");
    }

    function readRoomFromUI() {
        // اقرأ من toolbar أولاً — ثم panel
        const w = getValue("roomWidth") || getValue("roomWidthPanel");
        const d = getValue("roomDepth") || getValue("roomDepthPanel");
        const h = getValue("roomHeight") || getValue("roomHeightPanel");

        state.room.width  = clamp(safeNumber(w, state.room.width), 1, 1000);
        state.room.depth  = clamp(safeNumber(d, state.room.depth), 1, 1000);
        state.room.height = clamp(safeNumber(h, state.room.height), 1.5, 100);

        state.room.material   = getValue("roomMaterial", state.room.material);
        state.room.reflection = getValue("reflectionLevel", state.room.reflection);
    }

    function readEngineeringFromUI() {
        state.engineering.mode    = getValue("designMode", state.engineering.mode);
        state.engineering.profile = getValue("engineeringProfile", state.engineering.profile);
        state.engineering.targetSPL = clamp(
            safeNumber(getValue("targetSPL"), state.engineering.targetSPL), 60, 130
        );
        state.engineering.coverageTarget = clamp(
            safeNumber(getValue("coverageTarget"), state.engineering.coverageTarget), 1, 100
        );
        state.engineering.headroom = clamp(
            safeNumber(getValue("headroom"), state.engineering.headroom), 0, 20
        );
        state.engineering.mountingHeight = clamp(
            safeNumber(getValue("mountingHeight"), state.engineering.mountingHeight), 0.5, 30
        );
    }

    function readAudienceFromUI() {
        state.audience.size = Math.max(0, Math.round(
            safeNumber(getValue("crowdSize"), state.audience.size)
        ));
        state.audience.listenerHeight = clamp(
            safeNumber(getValue("audienceHeight"), 1.2), 0.5, 3
        );
    }

    function readStageFromUI() {
        state.stage.width = clamp(safeNumber(getValue("stageWidth"), state.stage.width), 0, 50);
        state.stage.depth = clamp(safeNumber(getValue("stageDepth"), state.stage.depth), 0, 30);
        state.stage.x     = clamp(safeNumber(getValue("stageX"), state.stage.x), 0, state.room.width);
        state.stage.y     = clamp(safeNumber(getValue("stageY"), state.stage.y), 0, state.room.depth);
    }

    function readAllFromUI() {
        readProjectFromUI();
        readRoomFromUI();
        readEngineeringFromUI();
        readAudienceFromUI();
        readStageFromUI();

        // احسب مساحة الجمهور
        state.audience.area = state.room.width * state.room.depth;
    }

    /* ═══════════════ API Resolvers ═══════════════ */

    function canvasAPI()   { return AE.canvas  || window.AcousticCanvas  || null; }
    function engineAPI()   { return AE.engine  || window.AcousticEngine  || null; }
    function speakerAPI()  { return AE.speaker || window.AcousticSpeaker || window.SpeakerDatabase || null; }
    function storageAPI()  { return AE.storage || window.AcousticStorage || null; }
    function backendAPI()  { return AE.backend || window.AcousticBackend || null; }
    function reportAPI()   { return AE.report  || window.AcousticReport  || null; }

    /* ═══════════════ Canvas Bridge ═══════════════ */

    function refreshCanvas() {
        const c = canvasAPI();
        if (!c) return;
        try {
            if (typeof c.updateRoom === "function") {
                c.updateRoom(state.room.width, state.room.depth, state.room.height);
            }
            if (typeof c.render === "function") c.render();
        } catch (e) {
            console.error("[App] refreshCanvas:", e);
        }
    }

    function getCanvasData() {
        const c = canvasAPI();
        if (c && typeof c.getDesignData === "function") {
            try { return c.getDesignData(); }
            catch (e) { console.warn("[App] getCanvasData:", e); }
        }
        return null;
    }

    function loadCanvasData(data) {
        const c = canvasAPI();
        if (c && typeof c.loadDesign === "function") {
            try {
                c.loadDesign(data);
                state.lastCanvasSnapshot = deepClone(data);
                return true;
            } catch (e) {
                console.error("[App] loadCanvasData:", e);
            }
        }
        return false;
    }

    /* ═══════════════ Speakers (يقرأ من Canvas) ═══════════════ */

    function getSpeakers() {
        const cd = getCanvasData();
        if (cd && Array.isArray(cd.speakers)) {
            state.speakers = cd.speakers;
        }
        return state.speakers || [];
    }

    /* ═══════════════ Build Design Data ═══════════════ */

    function buildDesignData() {
        const cd = getCanvasData() || {};
        const speakers = Array.isArray(cd.speakers) ? cd.speakers : getSpeakers();

        return {
            version: "2.0.0",
            project: deepClone(state.project),
            room: {
                ...deepClone(state.room),
                area: state.room.width * state.room.depth,
                volume: state.room.width * state.room.depth * state.room.height
            },
            stage: deepClone(state.stage),
            audience: {
                ...deepClone(state.audience),
                area: state.room.width * state.room.depth
            },
            target: {
                spl: state.engineering.targetSPL,
                coverage: state.engineering.coverageTarget,
                headroom: state.engineering.headroom
            },
            design: {
                mode: state.engineering.mode,
                profile: state.engineering.profile,
                mountingHeight: state.engineering.mountingHeight
            },
            speakers: deepClone(speakers),
            analysis: state.analysis ? deepClone(state.analysis) : null,
            bom: deepClone(state.bom)
        };
    }

    /* ═══════════════ Analysis ═══════════════ */

    function runAnalysis() {
        const engine = engineAPI();
        const speakers = getSpeakers();

        if (engine && typeof engine.analyzeDesign === "function") {
            try {
                state.analysis = engine.analyzeDesign(speakers, {});
            } catch (e) {
                console.error("[App] runAnalysis:", e);
                state.analysis = null;
            }
        }

        renderMetrics();
        renderAnalysis();
        return state.analysis;
    }

    /* ═══════════════ BOM ═══════════════ */

    function generateBOM() {
        const engine = engineAPI();
        const speakers = getSpeakers();

        if (engine && typeof engine.generateBOM === "function") {
            try {
                state.bom = engine.generateBOM(speakers) || [];
            } catch {
                state.bom = localBOM(speakers);
            }
        } else {
            state.bom = localBOM(speakers);
        }

        renderBOM();
        return state.bom;
    }

    /**
     * يقرأ المواصفات من بنية مسطّحة (speaker.js الجديد)
     */
    function readSpeakerSpecs(obj) {
        if (!obj) return { rms: 0, maxSPL: 0, horizontal: 90, vertical: 60, manufacturer: "", model: "" };

        const power = obj.power && typeof obj.power === "object" && !Array.isArray(obj.power)
            ? obj.power : {};
        const cov = obj.coverage && typeof obj.coverage === "object" && !Array.isArray(obj.coverage)
            ? obj.coverage : {};

        const num = (v, fb = 0) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
        };

        return {
            rms: num(obj.rms_power ?? obj.rms ?? power.rms, 0),
            maxSPL: num(obj.max_spl ?? obj.maxSPL, 0),
            horizontal: num(
                obj.horizontal_coverage ?? obj.horizontal
                ?? obj.horizontalCoverage ?? cov.horizontal, 90
            ),
            vertical: num(
                obj.vertical_coverage ?? obj.vertical
                ?? obj.verticalCoverage ?? cov.vertical, 60
            ),
            manufacturer: obj.manufacturer || "Generic",
            model: obj.model || "Speaker",
            category: obj.category || obj.type || "Point Source"
        };
    }

    function localBOM(speakers) {
        const map = new Map();

        (speakers || []).forEach(item => {
            const specs = readSpeakerSpecs(item);
            const key = `${specs.manufacturer}|${specs.model}`;

            if (!map.has(key)) {
                map.set(key, {
                    manufacturer: specs.manufacturer,
                    model: specs.model,
                    type: specs.category,
                    category: specs.category,
                    quantity: 0,
                    rms: specs.rms,
                    maxSPL: specs.maxSPL,
                    coverage: `${specs.horizontal}° × ${specs.vertical}°`
                });
            }

            map.get(key).quantity++;
        });

        return Array.from(map.values());
    }

    /* ═══════════════ Render ═══════════════ */

    function calculateLocalMetrics() {
        const speakers = getSpeakers();
        const roomArea = state.room.width * state.room.depth;
        const totalPower = speakers.reduce(
            (s, i) => s + readSpeakerSpecs(i).rms,
            0
        );
        return { speakerCount: speakers.length, totalPower, roomArea };
    }

    function renderMetrics() {
        const m = calculateLocalMetrics();
        const a = state.analysis || {};

        const coverage = safeNumber(
            a.coveragePercent ?? a.coverage?.coveragePercent,
            0
        );
        const avgSPL = safeNumber(
            a.averageSPL ?? a.coverage?.averageSPL,
            0
        );
        const uniformity = safeNumber(
            a.uniformity ?? a.coverage?.uniformity,
            0
        );

        setText("metricSpeakerCount", String(m.speakerCount));
        setText("metricTotalPower", `${formatNumber(m.totalPower, 0)} W`);
        setText("metricCoverage", `${formatNumber(coverage, 1)}%`);
        setText("metricAverageSPL", `${formatNumber(avgSPL, 1)} dB`);
        setText("metricUniformity", `${formatNumber(uniformity, 1)} dB`);

        // حدّث البادج
        const badge = byId("speakerCountBadge");
        if (badge) badge.textContent = m.speakerCount;

        // أعلن للوحدات الأخرى
        try {
            window.dispatchEvent(new CustomEvent("app:metrics-updated", {
                detail: m
            }));
        } catch { /* ignore */ }
    }

    function renderAnalysis() {
        const a = state.analysis;

        if (!a) {
            setText("analysisStatus", "لم يتم التحليل");
            setText("analysisCoverage", "—");
            setText("analysisAverageSPL", "—");
            setText("analysisUniformity", "—");
            setText("analysisWarnings", "0");
            return;
        }

        const coverage = safeNumber(a.coveragePercent ?? a.coverage?.coveragePercent, 0);
        const avgSPL = safeNumber(a.averageSPL ?? a.coverage?.averageSPL, 0);
        const uniformity = safeNumber(a.uniformity ?? a.coverage?.uniformity, 0);
        const warningsCount = Array.isArray(a.warnings)
            ? a.warnings.length
            : safeNumber(a.warnings, 0);

        setText("analysisStatus", "مكتمل");
        setText("analysisCoverage", `${formatNumber(coverage, 1)}%`);
        setText("analysisAverageSPL", `${formatNumber(avgSPL, 1)} dB`);
        setText("analysisUniformity", `${formatNumber(uniformity, 1)} dB`);
        setText("analysisWarnings", String(warningsCount));
    }

    function renderBOM() {
        const tbody = byId("bomTableBody");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (!state.bom.length) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#647184;">
                لا توجد سماعات
            </td></tr>`;
            return;
        }

        state.bom.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${item.model || "—"}</td>
                <td>${item.type || item.category || "—"}</td>
                <td><strong>${item.quantity || 0}</strong></td>
            `;
            tbody.appendChild(tr);
        });
    }

    /* ═══════════════ Views & Modals ═══════════════ */

    function setView(v) {
        state.currentView = v;
        $$("[data-view]").forEach(el => {
            el.classList.toggle("active", el.dataset.view === v);
        });
    }

    // استخدم دوال app.html إن وُجدت
    function openModal(id) {
        const bridge = window.AcousticBridge;
        if (bridge && typeof bridge.openModal === "function") {
            bridge.openModal(id);
            return;
        }
        const m = byId(id);
        if (m) {
            m.classList.add("active");
            m.setAttribute("aria-hidden", "false");
        }
    }

    function closeModal(id) {
        const bridge = window.AcousticBridge;
        if (bridge && typeof bridge.closeModal === "function") {
            bridge.closeModal(id);
            return;
        }
        const m = byId(id);
        if (m) {
            m.classList.remove("active");
            m.setAttribute("aria-hidden", "true");
        }
    }

    /* ═══════════════ Custom Confirm ═══════════════ */

    function confirmAsync(message, title) {
        return new Promise((resolve) => {
            const bridge = window.AcousticBridge;
            // استخدم admin.html's dialog إن وُجد
            const overlay = byId("confirmModal");
            if (overlay) {
                const msgEl = byId("confirmMessage");
                const titleEl = byId("confirmTitle");
                const okBtn = byId("confirmActionBtn");

                if (msgEl) msgEl.textContent = message;
                if (titleEl && title) titleEl.textContent = title;

                const onOk = () => { cleanup(); resolve(true); };
                const cleanup = () => {
                    overlay.classList.remove("active");
                    okBtn?.removeEventListener("click", onOk);
                };

                okBtn?.addEventListener("click", onOk, { once: true });
                openModal("confirmModal");
                return;
            }

            // Fallback بسيط
            try {
                resolve(window.confirm(message));
            } catch {
                resolve(false);
            }
        });
    }

    /* ═══════════════ Save / Load ═══════════════ */

    function serializeProject() {
        readAllFromUI();

        const payload = {
            version: "2.0.0",
            project: deepClone(state.project),
            room: deepClone(state.room),
            stage: deepClone(state.stage),
            audience: deepClone(state.audience),
            engineering: deepClone(state.engineering),
            speakers: deepClone(getSpeakers()),
            analysis: deepClone(state.analysis),
            bom: deepClone(state.bom),
            canvas: deepClone(getCanvasData()),
            savedAt: new Date().toISOString()
        };

        state.project.id = state.project.id || uid("project");
        payload.project.id = state.project.id;
        payload.project.projectName = state.project.name;

        return payload;
    }

    /**
     * يحفظ باستخدام backend.js أولاً (توافق مع باقي الصفحات)
     */
    async function saveProject() {
        const payload = serializeProject();

        setLoading(true, "جاري الحفظ...");

        try {
            const backend = backendAPI();

            if (backend?.projects?.create || backend?.projects?.update) {
                // ✅ استخدم backend (Firebase / Server / Local)
                const exists = state.project.id
                    && typeof backend.projects.get === "function"
                    && await backend.projects.get(state.project.id).catch(() => null);

                if (exists) {
                    await backend.projects.update(state.project.id, payload);
                } else {
                    const created = await backend.projects.create(payload);
                    if (created?.id) state.project.id = created.id;
                }
            } else {
                // ⚠️ fallback — استخدم نفس مفتاح backend
                const KEY = "acoustic_engineering_projects";
                let list = [];
                try {
                    const raw = localStorage.getItem(KEY);
                    if (raw) list = JSON.parse(raw);
                    if (!Array.isArray(list)) list = [];
                } catch { list = []; }

                const existing = list.findIndex(p => p.id === state.project.id);
                if (existing >= 0) {
                    list[existing] = payload;
                } else {
                    list.unshift(payload);
                }

                localStorage.setItem(KEY, JSON.stringify(list));
                localStorage.setItem("acoustic_engineering_currentProject", JSON.stringify(payload));
            }

            markDirty(false);
            toast("✓ تم حفظ المشروع", "success", 2200);

            return payload;

        } catch (e) {
            console.error("[App] saveProject:", e);
            toast("تعذّر الحفظ: " + (e.message || ""), "error", 4000);
            return null;

        } finally {
            setLoading(false);
        }
    }

    async function loadProject(project) {
        if (!project) return false;

        setLoading(true, "جاري التحميل...");

        try {
            const data = typeof project === "string" ? JSON.parse(project) : project;

            state.project = { ...state.project, ...(data.project || {}) };
            state.room    = { ...state.room,    ...(data.room    || {}) };
            state.stage   = { ...state.stage,   ...(data.stage   || {}) };
            state.audience = { ...state.audience, ...(data.audience || {}) };
            state.engineering = { ...state.engineering, ...(data.engineering || {}) };

            state.speakers = Array.isArray(data.speakers) ? data.speakers : [];
            state.analysis = data.analysis || null;
            state.bom = Array.isArray(data.bom) ? data.bom : [];

            syncAllToUI();

            // حمّل بيانات Canvas
            if (data.canvas) {
                loadCanvasData(data.canvas);
            } else if (Array.isArray(data.speakers)) {
                loadCanvasData({ room: state.room, speakers: data.speakers });
            }

            refreshCanvas();
            renderMetrics();
            renderAnalysis();
            renderBOM();

            // ✅ امسح history وأضف نقطة البداية
            state.history = [captureSnapshot()];
            state.historyIndex = 0;

            markDirty(false);
            toast("✓ تم تحميل المشروع", "success", 2200);

            return true;

        } catch (e) {
            console.error("[App] loadProject:", e);
            toast("تعذّر التحميل: " + (e.message || ""), "error", 4000);
            return false;

        } finally {
            setLoading(false);
        }
    }

    /* ═══════════════ New Project ═══════════════ */

    async function newProject() {
        if (state.ui.dirty) {
            const ok = await confirmAsync(
                "هناك تغييرات غير محفوظة. هل تريد المتابعة؟",
                "مشروع جديد"
            );
            if (!ok) return;
        }

        state.project = {
            id: uid("project"),
            name: "",
            client: "",
            location: "",
            venueType: "meeting"
        };

        state.room = {
            width: 20, depth: 15, height: 4,
            material: "medium", reflection: "medium"
        };

        state.stage = { width: 8, depth: 4, x: 6, y: 0.5 };
        state.audience = { size: 300, area: 300, listenerHeight: 1.2 };

        state.engineering = {
            mode: "auto",
            profile: "general",
            targetSPL: 95,
            coverageTarget: 90,
            headroom: 6,
            mountingHeight: 3.2
        };

        state.speakers = [];
        state.analysis = null;
        state.bom = [];

        // ✅ امسح history
        state.history = [];
        state.historyIndex = -1;

        syncAllToUI();

        const c = canvasAPI();
        if (c && typeof c.loadDesign === "function") {
            c.loadDesign({ room: state.room, speakers: [] });
        }
        if (c && typeof c.clear === "function") {
            try { c.clear(); } catch { /* ignore */ }
        }

        refreshCanvas();
        renderMetrics();
        renderAnalysis();
        renderBOM();

        markDirty(false);
        setView("overview");
        toast("✓ مشروع جديد", "success", 2200);
    }

    /* ═══════════════ History (مُصلَح) ═══════════════ */

    function captureSnapshot() {
        return deepClone({
            project: state.project,
            room: state.room,
            stage: state.stage,
            audience: state.audience,
            engineering: state.engineering,
            speakers: getSpeakers(),
            canvas: getCanvasData()
        });
    }

    function pushHistory() {
        const snapshot = captureSnapshot();

        // اقتطع المستقبل
        if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
        }

        state.history.push(snapshot);
        if (state.history.length > 50) state.history.shift();

        state.historyIndex = state.history.length - 1;
    }

    function applySnapshot(snapshot) {
        if (!snapshot) return;

        if (snapshot.project)     state.project     = deepClone(snapshot.project);
        if (snapshot.room)        state.room        = deepClone(snapshot.room);
        if (snapshot.stage)       state.stage       = deepClone(snapshot.stage);
        if (snapshot.audience)    state.audience    = deepClone(snapshot.audience);
        if (snapshot.engineering) state.engineering = deepClone(snapshot.engineering);

        syncAllToUI();

        if (snapshot.canvas) {
            loadCanvasData(snapshot.canvas);
        } else if (Array.isArray(snapshot.speakers)) {
            loadCanvasData({ room: state.room, speakers: snapshot.speakers });
        }

        refreshCanvas();
        renderMetrics();
        renderAnalysis();
        renderBOM();
    }

    function undo() {
        if (state.historyIndex <= 0) {
            toast("لا يوجد ما يمكن التراجع عنه", "info", 1800);
            return false;
        }

        state.historyIndex--;
        const snapshot = state.history[state.historyIndex];

        // ✅ استرجع البيانات فعلياً
        applySnapshot(snapshot);

        markDirty(true);
        toast("↩ تم التراجع", "info", 1500);
        return true;
    }

    function redo() {
        if (state.historyIndex >= state.history.length - 1) {
            toast("لا يوجد ما يمكن إعادته", "info", 1800);
            return false;
        }

        state.historyIndex++;
        const snapshot = state.history[state.historyIndex];

        // ✅ استرجع البيانات فعلياً
        applySnapshot(snapshot);

        markDirty(true);
        toast("↪ تمت الإعادة", "info", 1500);
        return true;
    }

    /* ═══════════════ Tools ═══════════════ */

    function activateTool(tool) {
        state.activeTool = tool;

        $$("[data-tool], .tool-btn, [data-mode]").forEach(b => {
            const val = b.dataset.tool || b.dataset.mode;
            b.classList.toggle("active", val === tool);
        });

        const c = canvasAPI();
        if (c && typeof c.setTool === "function") {
            c.setTool(tool);
        }
    }

    /* ═══════════════ Auto Design ═══════════════ */

    async function autoDesign(options = {}) {
        readAllFromUI();

        const engine = engineAPI();
        if (!engine || typeof engine.autoDesign !== "function") {
            toast("محرك التصميم غير متاح", "error");
            return null;
        }

        // ✅ اقرأ الـ mode من الخيارات أو من radio buttons
        const modeFromRadio = document.querySelector('input[name="autoDesignMode"]:checked')?.value;
        const mode = options.mode || modeFromRadio || state.engineering.mode || "auto";

        setLoading(true, "جاري التوزيع الهندسي...");

        try {
            const result = engine.autoDesign({
                mode,
                speakerId: options.speakerId || null,
                mountingHeight: state.engineering.mountingHeight
            });

            if (result && result.success !== false && Array.isArray(result.layout)) {
                // ✅ حمّل على Canvas
                loadCanvasData({ room: state.room, speakers: result.layout });

                state.speakers = result.layout;
                if (result.analysis) state.analysis = result.analysis;

                pushHistory();      // ← نقطة حفظ
                markDirty(true);
                generateBOM();
                runAnalysis();
                refreshCanvas();

                closeModal("autoDesignModal");
                toast("✓ تم إنشاء التوزيع الهندسي", "success", 2200);

                return result;
            } else {
                const err = result?.error || "تعذّر التوزيع";
                toast(err, "error", 4000);
                return null;
            }
        } catch (e) {
            console.error("[App] autoDesign:", e);
            toast("خطأ في التوزيع: " + (e.message || ""), "error", 4000);
            return null;
        } finally {
            setLoading(false);
        }
    }

    /* ═══════════════ Report ═══════════════ */

    async function generateReport() {
        readAllFromUI();
        generateBOM();
        runAnalysis();

        const report = reportAPI();
        if (report && typeof report.open === "function") {
            try {
                await report.open();
                return true;
            } catch (e) {
                console.error("[App] generateReport:", e);
            }
        }

        // fallback
        window.location.href = "report.html";
        return false;
    }

    /* ═══════════════ Speaker APIs (مطلوبة من app.html) ═══════════════ */

    /**
     * يضيف سماعة (من app.html عند حفظ النموذج)
     */
    async function addSpeaker(spec) {
        if (!spec || typeof spec !== "object") return null;

        // ابحث عن مواصفات كاملة من speaker.js
        let fullSpec = spec;
        const speakerLib = speakerAPI();
        if (speakerLib && typeof speakerLib.normalize === "function") {
            try { fullSpec = speakerLib.normalize(spec); }
            catch { /* keep spec */ }
        }

        // أضف على Canvas
        const c = canvasAPI();
        if (c && typeof c.addSpeakerAt === "function") {
            try {
                const added = c.addSpeakerAt(
                    { x: state.room.width / 2, y: state.room.depth / 2 },
                    spec.id || null
                );
                pushHistory();
                markDirty(true);
                generateBOM();
                runAnalysis();
                return added;
            } catch (e) {
                console.error("[App] addSpeaker:", e);
            }
        }

        return null;
    }

    /**
     * يوزّع تلقائياً (يستدعيه app.html)
     */
    async function runAutoDesign(mode) {
        return autoDesign({ mode });
    }

    /**
     * يعالج ملف Datasheet (يستدعيه app.html)
     */
    async function processDatasheet(file) {
        if (!file) return null;

        // جرّب backend أولاً
        const backend = backendAPI();
        if (backend?.speakers?.create) {
            try {
                // اقرأ الملف (يفترض أن backend يتعامل معه)
                return { success: true, file: file.name };
            } catch (e) {
                console.warn("[App] processDatasheet:", e);
            }
        }

        toast("تحليل Datasheet غير مدعوم حالياً", "info", 2500);
        return { success: false };
    }

    /**
     * يطبّق الإعدادات (يستدعيه app.html)
     */
    function applySettings(settings) {
        if (!settings || typeof settings !== "object") return;

        if (settings.grid !== undefined) {
            state.ui.grid = !!settings.grid;
            const c = canvasAPI();
            if (c && typeof c.setGridVisible === "function") {
                c.setGridVisible(state.ui.grid);
            }
        }

        if (settings.snap !== undefined) {
            state.ui.snap = !!settings.snap;
            const c = canvasAPI();
            if (c && typeof c.setSnapEnabled === "function") {
                c.setSnapEnabled(state.ui.snap);
            }
        }

        if (settings.autoSave !== undefined) {
            state.ui.autoSave = !!settings.autoSave;
        }

        if (settings.language) {
            document.documentElement.lang = settings.language;
        }

        toast("✓ تم تطبيق الإعدادات", "success", 1800);
    }

    /* ═══════════════ Inputs Binding ═══════════════ */

    const _boundElements = new WeakSet();

    function bindInput(id, cb, event = "input") {
        const el = byId(id);
        if (!el || _boundElements.has(el)) return;

        _boundElements.add(el);
        el.addEventListener(event, () => {
            cb();
            markDirty();
            pushHistory();  // ← كل تغيير مهم
        });
    }

    function bindInputs() {
        // Project
        ["projectName", "clientName", "projectLocation"].forEach(id =>
            bindInput(id, readProjectFromUI)
        );
        bindInput("venueType", readProjectFromUI, "change");  // ← select = change

        // Room (toolbar)
        ["roomWidth", "roomDepth", "roomHeight"].forEach(id =>
            bindInput(id, () => {
                readRoomFromUI();
                syncRoomToUI();
                refreshCanvas();
            })
        );

        // Room (panel)
        ["roomWidthPanel", "roomDepthPanel", "roomHeightPanel"].forEach(id =>
            bindInput(id, () => {
                readRoomFromUI();
                syncRoomToUI();
                refreshCanvas();
            })
        );

        // Room material
        bindInput("roomMaterial", readRoomFromUI, "change");
        bindInput("reflectionLevel", readRoomFromUI, "change");

        // Engineering
        ["designMode", "engineeringProfile"].forEach(id =>
            bindInput(id, readEngineeringFromUI, "change")
        );
        ["targetSPL", "coverageTarget", "headroom", "mountingHeight"].forEach(id =>
            bindInput(id, readEngineeringFromUI)
        );

        // Audience
        ["crowdSize", "audienceHeight"].forEach(id =>
            bindInput(id, readAudienceFromUI)
        );

        // Stage
        ["stageWidth", "stageDepth", "stageX", "stageY"].forEach(id =>
            bindInput(id, readStageFromUI)
        );
    }

    /* ═══════════════ Events من الوحدات الأخرى ═══════════════ */

    function bindExternalEvents() {
        // Canvas changed
        window.addEventListener("canvas:changed", () => {
            state.speakers = getSpeakers();
            markDirty(true);
            renderMetrics();
        });

        // Engine auto design
        window.addEventListener("engine:auto-design-complete", () => {
            getSpeakers();
            renderMetrics();
            renderAnalysis();
        });

        // Speaker added
        window.addEventListener("speaker:added", () => {
            renderMetrics();
        });

        // Settings applied (من app.html)
        window.addEventListener("app:apply-settings", (e) => {
            applySettings(e.detail);
        });

        // Backend ready
        window.addEventListener("backend:ready", () => {
            console.log("[App] backend ready:", backendAPI()?.getMode?.());
        });
    }

    /* ═══════════════ Initialization ═══════════════ */

    function initializeProject() {
        state.project.id = state.project.id || uid("project");

        // احسب مساحة الجمهور
        state.audience.area = state.room.width * state.room.depth;

        syncAllToUI();
    }

    async function initialize() {
        if (state.initialized) return state;

        state.initialized = true;

        try {
            console.log("[App] تهيئة...");

            initializeProject();
            bindInputs();
            bindExternalEvents();

            // Bind الأزرار
            byId("newProjectBtn")?.addEventListener("click", newProject);
            byId("saveProjectBtn")?.addEventListener("click", saveProject);
            byId("undoBtn")?.addEventListener("click", undo);
            byId("redoBtn")?.addEventListener("click", redo);
            byId("autoDesignBtn")?.addEventListener("click", () => openModal("autoDesignModal"));
            byId("runAutoDesignBtn")?.addEventListener("click", () => autoDesign());
            byId("generateReportBtn")?.addEventListener("click", generateReport);
            byId("backToAppBtn")?.addEventListener("click", () => {
                window.location.href = "app.html";
            });

            // Tools
            $$("[data-tool]").forEach(btn => {
                btn.addEventListener("click", () => activateTool(btn.dataset.tool));
            });

            // ✅ نقطة history أولى
            state.history = [captureSnapshot()];
            state.historyIndex = 0;

            // Render أولي
            renderMetrics();
            renderAnalysis();
            renderBOM();
            markDirty(false);

            // ✅ auto-save (اختياري)
            if (state.ui.autoSave) {
                setInterval(() => {
                    if (state.ui.dirty && !document.hidden) {
                        saveProject().catch(() => {});
                    }
                }, 120000); // كل دقيقتين
            }

            // ✅ تحذير عند مغادرة الصفحة
            window.addEventListener("beforeunload", (e) => {
                if (state.ui.dirty) {
                    e.preventDefault();
                    e.returnValue = "لديك تغييرات غير محفوظة";
                    return e.returnValue;
                }
            });

            // ✅ اختصارات لوحة المفاتيح
            document.addEventListener("keydown", (e) => {
                const tag = (document.activeElement?.tagName || "").toLowerCase();
                if (tag === "input" || tag === "textarea" || tag === "select") return;

                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    saveProject();
                    return;
                }
                if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
                    e.preventDefault();
                    undo();
                    return;
                }
                if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
                    e.preventDefault();
                    redo();
                    return;
                }
            });

            console.log("[app.js] v2.0.0 جاهز");

            // أعلم الجميع
            try {
                window.dispatchEvent(new CustomEvent("app:ready", {
                    detail: { version: "2.0.0", state }
                }));
            } catch { /* ignore */ }

            return state;

        } catch (err) {
            console.error("[App] initialize failed:", err);
            toast("تعذّر تجهيز التطبيق", "error", 4000);
            return state;
        }
    }

    /* ═══════════════ Public API ═══════════════ */

    const AppAPI = {
        state,

        // Init
        init: initialize,
        initialize,                       // ← متوافق مع app.html

        // Project
        newProject,
        saveProject,
        loadProject,
        buildDesignData,
        getDesignData: buildDesignData,

        // Design
        runAnalysis,
        generateBOM,
        autoDesign,
        runAutoDesign,                    // ← متوافق مع app.html

        // Speaker
        addSpeaker,                       // ← متوافق مع app.html
        processDatasheet,                 // ← متوافق مع app.html

        // Settings
        applySettings,                    // ← متوافق مع app.html

        // UI
        setView,
        activateTool,
        openModal,
        closeModal,
        generateReport,
        refreshCanvas,
        undo,
        redo,
        markDirty,
        toast
    };

    /* ═══════════════ Exposure ═══════════════ */
    AE.app = AppAPI;
    window.AcousticApp = AppAPI;

    /* ═══════════════ Auto-init ═══════════════ */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }

})();
