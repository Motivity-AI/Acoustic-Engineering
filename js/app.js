/* ============================================================
   Acoustic Engineering — js/app.js
   Main Application Controller
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    const state = {
        initialized: false, currentView: "overview", activeTool: "select",
        project: { id: null, name: "", client: "", location: "", venueType: "meeting" },
        room: { width: 12, depth: 8, height: 3, material: "medium", reflection: "medium" },
        stage: { width: 6, depth: 2, x: 3, y: 0.5 },
        audience: { size: 100, area: 0 },
        engineering: {
            mode: "intelligent", profile: "meeting",
            targetSPL: 95, coverageTarget: 90, headroom: 6, mountingHeight: 2.8
        },
        ui: { zoom: 1, grid: true, snap: true, sidebarCollapsed: false, dirty: false },
        selectedObject: null,
        history: [], historyIndex: -1,
        speakers: [], analysis: null, bom: []
    };

    AE.app = AE.app || {};
    AE.app.state = state;

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const byId = (id) => document.getElementById(id);

    function safeNumber(v, fb = 0) { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function uid(prefix = "obj") { return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }
    function deepClone(v) { try { return JSON.parse(JSON.stringify(v)); } catch { return v; } }
    function formatNumber(v, d = 1) {
        const n = safeNumber(v, 0);
        return n.toLocaleString("ar", { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    function toast(msg, type = "info") {
        const c = byId("toastContainer") || (() => {
            const el = document.createElement("div");
            el.id = "toastContainer";
            document.body.appendChild(el);
            return el;
        })();
        const item = document.createElement("div");
        item.className = "toast toast-" + type;
        item.textContent = msg;
        c.appendChild(item);
        setTimeout(() => item.remove(), 3000);
    }

    function setLoading(active, text = "جاري المعالجة...") {
        const o = byId("loadingOverlay");
        if (!o) return;
        o.classList.toggle("active", !!active);
        const label = o.querySelector("[data-loading-text]");
        if (label) label.textContent = text;
    }

    function markDirty(v = true) {
        state.ui.dirty = v;
        document.body.classList.toggle("project-dirty", v);
        const status = byId("saveStatus");
        if (status) status.textContent = v ? "تغييرات غير محفوظة" : "محفوظ";
    }

    function setValue(id, v) { const el = byId(id); if (el) el.value = v ?? ""; }
    function getValue(id, fb = "") { const el = byId(id); return el ? el.value : fb; }
    function setText(id, v) { const el = byId(id); if (el) el.textContent = v ?? ""; }

    function syncProjectToUI() {
        setValue("projectName", state.project.name);
        setValue("clientName", state.project.client);
        setValue("projectLocation", state.project.location);
        setValue("venueType", state.project.venueType);
    }

    function syncRoomToUI() {
        setValue("roomWidth", state.room.width);
        setValue("roomDepth", state.room.depth);
        setValue("roomHeight", state.room.height);
    }

    function syncEngineeringToUI() {
        setValue("designMode", state.engineering.mode);
        setValue("targetSPL", state.engineering.targetSPL);
        setValue("coverageTarget", state.engineering.coverageTarget);
        setValue("mountingHeight", state.engineering.mountingHeight);
    }

    function syncAllToUI() {
        syncProjectToUI();
        syncRoomToUI();
        syncEngineeringToUI();
    }

    function readProjectFromUI() {
        state.project.name = getValue("projectName");
        state.project.client = getValue("clientName");
        state.project.location = getValue("projectLocation");
        state.project.venueType = getValue("venueType", state.project.venueType);
    }

    function readRoomFromUI() {
        state.room.width = Math.max(1, safeNumber(getValue("roomWidth"), state.room.width));
        state.room.depth = Math.max(1, safeNumber(getValue("roomDepth"), state.room.depth));
        state.room.height = Math.max(1.5, safeNumber(getValue("roomHeight"), state.room.height));
    }

    function readEngineeringFromUI() {
        state.engineering.mode = getValue("designMode", state.engineering.mode);
        state.engineering.targetSPL = clamp(safeNumber(getValue("targetSPL"), state.engineering.targetSPL), 60, 120);
        state.engineering.coverageTarget = clamp(safeNumber(getValue("coverageTarget"), state.engineering.coverageTarget), 50, 100);
        state.engineering.mountingHeight = Math.max(1, safeNumber(getValue("mountingHeight"), state.engineering.mountingHeight));
    }

    function readAllFromUI() {
        readProjectFromUI();
        readRoomFromUI();
        readEngineeringFromUI();
    }

    function canvasAPI() { return window.AcousticCanvas || AE.canvas || null; }

    function refreshCanvas() {
        const c = canvasAPI();
        if (!c) return;
        try {
            if (typeof c.updateRoom === "function") {
                c.updateRoom({ width: state.room.width, depth: state.room.depth, height: state.room.height });
            }
            if (typeof c.render === "function") c.render();
        } catch (e) { console.error("Canvas refresh error:", e); }
    }

    function getCanvasData() {
        const c = canvasAPI();
        if (c && typeof c.getDesignData === "function") {
            try { return c.getDesignData(); } catch (e) { console.warn(e); }
        }
        return null;
    }

    function loadCanvasData(data) {
        const c = canvasAPI();
        if (c && typeof c.loadDesign === "function") {
            try { c.loadDesign(data); return true; } catch (e) { console.error(e); }
        }
        return false;
    }

    function speakerAPI() { return AE.speaker || window.AcousticSpeaker || null; }

    function getSpeakers() {
        const cd = getCanvasData();
        if (cd && Array.isArray(cd.speakers)) { state.speakers = cd.speakers; return state.speakers; }
        return state.speakers || [];
    }

    function engineAPI() { return AE.engine || window.AcousticEngine || null; }

    function buildDesignData() {
        const cd = getCanvasData() || {};
        const speakers = Array.isArray(cd.speakers) ? cd.speakers : getSpeakers();
        return {
            version: "1.0.0", project: deepClone(state.project),
            room: { ...deepClone(state.room), area: state.room.width * state.room.depth, volume: state.room.width * state.room.depth * state.room.height },
            stage: deepClone(state.stage),
            audience: { ...deepClone(state.audience), area: state.room.width * state.room.depth },
            target: { spl: state.engineering.targetSPL, coverage: state.engineering.coverageTarget, headroom: state.engineering.headroom },
            design: { mode: state.engineering.mode, profile: state.engineering.profile, mountingHeight: state.engineering.mountingHeight },
            speakers: deepClone(speakers),
            analysis: state.analysis ? deepClone(state.analysis) : null,
            bom: deepClone(state.bom)
        };
    }

    function runAnalysis() {
        const engine = engineAPI();
        if (engine && typeof engine.analyzeDesign === "function") {
            try {
                state.analysis = engine.analyzeDesign(getSpeakers(), {});
            } catch (e) { console.error("Analysis failed:", e); }
        }
        renderMetrics();
        renderAnalysis();
        return state.analysis;
    }

    function generateBOM() {
        const engine = engineAPI();
        const speakers = getSpeakers();
        if (engine && typeof engine.generateBOM === "function") {
            try { state.bom = engine.generateBOM(speakers) || []; }
            catch (e) { state.bom = localBOM(speakers); }
        } else {
            state.bom = localBOM(speakers);
        }
        renderBOM();
        return state.bom;
    }

    function localBOM(speakers) {
        const map = new Map();
        (speakers || []).forEach(item => {
            const key = `${item.manufacturer || ""}|${item.model || "Speaker"}`;
            if (!map.has(key)) {
                map.set(key, {
                    manufacturer: item.manufacturer || "—", model: item.model || "Speaker",
                    type: item.type || "speaker", quantity: 0,
                    rms: safeNumber(item.rms, item.power), maxSPL: safeNumber(item.maxSPL, 0),
                    coverage: `${safeNumber(item.horizontalCoverage, 90)}° × ${safeNumber(item.verticalCoverage, 60)}°`
                });
            }
            map.get(key).quantity++;
        });
        return Array.from(map.values());
    }

    function autoDesign() {
        readAllFromUI();
        const engine = engineAPI();
        if (!engine || typeof engine.autoDesign !== "function") {
            toast("محرك التصميم غير متاح", "error");
            return;
        }
        setLoading(true, "جاري التوزيع الهندسي...");
        try {
            const result = engine.autoDesign({
                mode: state.engineering.mode,
                speakerId: null,
                mountingHeight: state.engineering.mountingHeight
            });
            if (result && result.layout) {
                loadCanvasData({ room: state.room, speakers: result.layout });
                state.speakers = result.layout;
                if (result.analysis) state.analysis = result.analysis;
            }
            markDirty();
            generateBOM();
            runAnalysis();
            refreshCanvas();
            closeModal("autoDesignModal");
            toast("تم إنشاء التوزيع الهندسي", "success");
        } catch (e) {
            console.error(e);
            toast("خطأ في التوزيع", "error");
        } finally { setLoading(false); }
    }

    function calculateLocalMetrics() {
        const speakers = getSpeakers();
        const roomArea = state.room.width * state.room.depth;
        const totalPower = speakers.reduce((s, i) => s + safeNumber(i.rms || i.power, 0), 0);
        return { speakerCount: speakers.length, totalPower, roomArea };
    }

    function renderMetrics() {
        const m = calculateLocalMetrics();
        const a = state.analysis || {};
        setText("metricSpeakerCount", m.speakerCount);
        setText("metricTotalPower", `${formatNumber(m.totalPower, 0)} W`);
        setText("metricCoverage", `${formatNumber(safeNumber(a.coveragePercent, 0), 1)}%`);
        setText("metricAverageSPL", `${formatNumber(safeNumber(a.averageSPL, 0), 1)} dB`);
        setText("metricUniformity", `${formatNumber(safeNumber(a.uniformity, 0), 1)} dB`);
    }

    function renderAnalysis() {
        const a = state.analysis;
        if (!a) { setText("analysisStatus", "لم يتم التحليل"); return; }
        setText("analysisCoverage", `${formatNumber(a.coveragePercent, 1)}%`);
        setText("analysisAverageSPL", `${formatNumber(a.averageSPL, 1)} dB`);
        setText("analysisMinimumSPL", `${formatNumber(a.minimumSPL, 1)} dB`);
        setText("analysisMaximumSPL", `${formatNumber(a.maximumSPL, 1)} dB`);
        setText("analysisUniformity", `${formatNumber(a.uniformity, 1)} dB`);
    }

    function renderBOM() {
        const tbody = byId("bomTableBody");
        if (!tbody) return;
        tbody.innerHTML = "";
        if (!state.bom.length) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">لا توجد سماعات</td></tr>`;
            return;
        }
        state.bom.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${item.model}</td><td>${item.type}</td><td>${item.quantity}</td>`;
            tbody.appendChild(tr);
        });
    }

    function setView(v) {
        state.currentView = v;
        $$("[data-view]").forEach(el => el.classList.toggle("active", el.dataset.view === v));
    }

    function openModal(id) { const m = byId(id); if (m) m.classList.add("active"); }
    function closeModal(id) { const m = byId(id); if (m) m.classList.remove("active"); }

    function storageAPI() { return AE.storage || window.AcousticStorage || null; }

    async function saveProject() {
        readAllFromUI();
        const payload = {
            version: "1.0.0", project: deepClone(state.project),
            room: deepClone(state.room), stage: deepClone(state.stage),
            audience: deepClone(state.audience), engineering: deepClone(state.engineering),
            speakers: deepClone(getSpeakers()),
            analysis: deepClone(state.analysis), bom: deepClone(state.bom),
            canvas: deepClone(getCanvasData()), savedAt: new Date().toISOString()
        };
        state.project.id = state.project.id || uid("project");
        payload.project.id = state.project.id;
        setLoading(true, "جاري الحفظ...");
        try {
            const storage = storageAPI();
            if (storage && typeof storage.saveProject === "function") {
                await storage.saveProject(payload);
            } else {
                localStorage.setItem(`acoustic_project_${state.project.id}`, JSON.stringify(payload));
            }
            markDirty(false);
            toast("تم حفظ المشروع", "success");
            return payload;
        } catch (e) {
            console.error(e);
            toast("تعذر الحفظ", "error");
            return null;
        } finally { setLoading(false); }
    }

    async function loadProject(project) {
        if (!project) return;
        setLoading(true, "جاري التحميل...");
        try {
            const data = typeof project === "string" ? JSON.parse(project) : project;
            state.project = { ...state.project, ...(data.project || {}) };
            state.room = { ...state.room, ...(data.room || {}) };
            state.stage = { ...state.stage, ...(data.stage || {}) };
            state.audience = { ...state.audience, ...(data.audience || {}) };
            state.engineering = { ...state.engineering, ...(data.engineering || {}) };
            state.speakers = Array.isArray(data.speakers) ? data.speakers : [];
            state.analysis = data.analysis || null;
            state.bom = Array.isArray(data.bom) ? data.bom : [];
            syncAllToUI();
            if (data.canvas) loadCanvasData(data.canvas);
            refreshCanvas();
            renderMetrics();
            renderAnalysis();
            renderBOM();
            markDirty(false);
            toast("تم التحميل", "success");
        } catch (e) {
            console.error(e);
            toast("تعذر التحميل", "error");
        } finally { setLoading(false); }
    }

    function newProject() {
        if (state.ui.dirty && !confirm("هناك تغييرات غير محفوظة. هل تريد المتابعة؟")) return;
        state.project = { id: uid("project"), name: "", client: "", location: "", venueType: "meeting" };
        state.room = { width: 12, depth: 8, height: 3, material: "medium", reflection: "medium" };
        state.stage = { width: 6, depth: 2, x: 3, y: 0.5 };
        state.audience = { size: 100, area: 96 };
        state.engineering = { mode: "intelligent", profile: "meeting", targetSPL: 95, coverageTarget: 90, headroom: 6, mountingHeight: 2.8 };
        state.speakers = [];
        state.analysis = null;
        state.bom = [];
        syncAllToUI();
        const c = canvasAPI();
        if (c && typeof c.loadDesign === "function") c.loadDesign({ room: state.room, speakers: [] });
        refreshCanvas();
        markDirty(false);
        setView("overview");
        toast("مشروع جديد", "success");
    }

    function captureSnapshot() { return deepClone(buildDesignData()); }

    function pushHistory() {
        const s = captureSnapshot();
        if (state.historyIndex < state.history.length - 1) state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(s);
        if (state.history.length > 50) state.history.shift();
        state.historyIndex = state.history.length - 1;
    }

    function undo() { if (state.historyIndex > 0) { state.historyIndex--; toast("تراجع", "info"); } }
    function redo() { if (state.historyIndex < state.history.length - 1) { state.historyIndex++; toast("إعادة", "info"); } }

    function activateTool(tool) {
        state.activeTool = tool;
        $$("[data-tool], .tool-btn").forEach(b => b.classList.toggle("active", (b.dataset.tool || b.dataset.mode) === tool));
        const c = canvasAPI();
        if (c && typeof c.setTool === "function") c.setTool(tool);
    }

    function generateReport() {
        readAllFromUI();
        generateBOM();
        runAnalysis();
        if (AE.report && typeof AE.report.open === "function") {
            AE.report.open();
        } else {
            toast("وحدة التقارير غير جاهزة", "warning");
        }
    }

    function bindInput(id, cb) {
        const el = byId(id);
        if (el) el.addEventListener("input", () => { cb(); markDirty(); });
    }

    function bindInputs() {
        ["projectName", "clientName", "projectLocation", "venueType"].forEach(id => bindInput(id, readProjectFromUI));
        ["roomWidth", "roomDepth", "roomHeight"].forEach(id => bindInput(id, () => { readRoomFromUI(); refreshCanvas(); }));
        ["designMode", "targetSPL", "coverageTarget", "mountingHeight"].forEach(id => bindInput(id, readEngineeringFromUI));
    }

    function initializeProject() {
        state.project.id = uid("project");
        syncAllToUI();
    }

    function initialize() {
        if (state.initialized) return;
        state.initialized = true;
        initializeProject();
        bindInputs();

        const newBtn = byId("newProjectBtn"); if (newBtn) newBtn.addEventListener("click", newProject);
        const saveBtn = byId("saveProjectBtn"); if (saveBtn) saveBtn.addEventListener("click", saveProject);
        const undoBtn = byId("undoBtn"); if (undoBtn) undoBtn.addEventListener("click", undo);
        const redoBtn = byId("redoBtn"); if (redoBtn) redoBtn.addEventListener("click", redo);
        const autoBtn = byId("autoDesignBtn"); if (autoBtn) autoBtn.addEventListener("click", () => openModal("autoDesignModal"));
        const runAutoBtn = byId("runAutoDesignBtn"); if (runAutoBtn) runAutoBtn.addEventListener("click", autoDesign);
        const reportBtn = byId("generateReportBtn"); if (reportBtn) reportBtn.addEventListener("click", generateReport);
        const backBtn = byId("backToAppBtn"); if (backBtn) backBtn.addEventListener("click", () => { window.location.href = "app.html"; });

        $$("[data-tool]").forEach(btn => {
            btn.addEventListener("click", () => activateTool(btn.dataset.tool));
        });

        renderMetrics();
        renderAnalysis();
        renderBOM();
        markDirty(false);
        console.log("Acoustic App 1.0 initialized");
    }

    AE.app = {
        state, init: initialize, newProject, saveProject, loadProject,
        buildDesignData, getDesignData: buildDesignData,
        runAnalysis, generateBOM, autoDesign,
        setView, activateTool, openModal, closeModal,
        generateReport, refreshCanvas, undo, redo, markDirty, toast
    };
    window.AcousticApp = AE.app;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else { initialize(); }
})();
