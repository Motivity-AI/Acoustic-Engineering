/* ============================================================
   Acoustic Engineering — js/speaker.js
   Speaker Database
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    const DEFAULT_SPEAKERS = [
        { id: "spk_fullrange_8", category: "fullrange", type: "Full Range", model: "Generic Full Range 8", manufacturer: "Generic", power: { rms: 150, program: 300, peak: 600 }, maxSPL: 120, frequency: { low: 70, high: 18000 }, coverage: { horizontal: 90, vertical: 60 }, weight: 8, recommendedHeight: 2.5, mounting: ["wall", "stand"] },
        { id: "spk_fullrange_12", category: "fullrange", type: "Full Range", model: "Generic Full Range 12", manufacturer: "Generic", power: { rms: 500, program: 1000, peak: 2000 }, maxSPL: 128, frequency: { low: 50, high: 18000 }, coverage: { horizontal: 90, vertical: 60 }, weight: 20, recommendedHeight: 2.5, mounting: ["floor", "stand", "wall"] },
        { id: "spk_column", category: "column", type: "Column", model: "Generic Column Array", manufacturer: "Generic", power: { rms: 120, program: 240, peak: 480 }, maxSPL: 115, frequency: { low: 90, high: 18000 }, coverage: { horizontal: 100, vertical: 30 }, weight: 6, recommendedHeight: 2.5, mounting: ["wall", "pole"] },
        { id: "spk_ceiling_6", category: "ceiling", type: "Ceiling Speaker", model: "Generic Ceiling 6", manufacturer: "Generic", power: { rms: 6, program: 12, peak: 24 }, maxSPL: 105, frequency: { low: 90, high: 18000 }, coverage: { horizontal: 100, vertical: 100 }, weight: 1.5, recommendedHeight: 2.8, mounting: ["ceiling"] },
        { id: "spk_linearray", category: "linearray", type: "Line Array", model: "Generic Line Array", manufacturer: "Generic", power: { rms: 700, program: 1400, peak: 2800 }, maxSPL: 135, frequency: { low: 55, high: 20000 }, coverage: { horizontal: 90, vertical: 10 }, weight: 18, recommendedHeight: 6, mounting: ["fly"] },
        { id: "spk_sub18", category: "subwoofer", type: "Subwoofer", model: "Generic Subwoofer 18", manufacturer: "Generic", power: { rms: 1000, program: 2000, peak: 4000 }, maxSPL: 135, frequency: { low: 30, high: 120 }, coverage: { horizontal: 180, vertical: 180 }, weight: 50, recommendedHeight: 0.5, mounting: ["floor"] }
    ];

    const state = { speakers: [], version: "1.0" };

    function num(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function normalize(data = {}) {
        return {
            id: data.id || "spk_" + Date.now().toString(36),
            category: data.category || "fullrange",
            type: data.type || "Loudspeaker",
            model: data.model || "Unnamed",
            manufacturer: data.manufacturer || "Generic",
            description: data.description || "",
            power: {
                rms: num(data.power?.rms, 0),
                program: num(data.power?.program, 0),
                peak: num(data.power?.peak, 0)
            },
            sensitivity: num(data.sensitivity, 0),
            maxSPL: num(data.maxSPL, 0),
            impedance: num(data.impedance, 8),
            frequency: {
                low: num(data.frequency?.low, 0),
                high: num(data.frequency?.high, 0)
            },
            coverage: {
                horizontal: num(data.coverage?.horizontal, 90),
                vertical: num(data.coverage?.vertical, 60)
            },
            dimensions: {
                width: num(data.dimensions?.width, 0),
                height: num(data.dimensions?.height, 0),
                depth: num(data.dimensions?.depth, 0)
            },
            weight: num(data.weight, 0),
            mounting: Array.isArray(data.mounting) ? [...data.mounting] : ["stand"],
            recommendedHeight: num(data.recommendedHeight, 2.5),
            indoor: data.indoor !== undefined ? !!data.indoor : true,
            outdoor: !!data.outdoor,
            source: data.source || "local",
            datasheetUrl: data.datasheetUrl || "",
            notes: data.notes || "",
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    function init(options = {}) {
        if (state.speakers.length === 0) {
            state.speakers = DEFAULT_SPEAKERS.map(normalize);
        }
        if (Array.isArray(options.speakers) && options.speakers.length) {
            state.speakers = options.speakers.map(normalize);
        }
        return getAll();
    }

    function getAll() { return clone(state.speakers); }
    function get(id) { return state.speakers.find(s => s.id === id) || null; }

    function add(data) {
        const s = normalize(data);
        state.speakers.push(s);
        dispatch("speaker:added", s);
        return clone(s);
    }

    function update(id, changes = {}) {
        const i = state.speakers.findIndex(s => s.id === id);
        if (i === -1) return null;
        const updated = normalize({
            ...state.speakers[i], ...changes,
            power: { ...state.speakers[i].power, ...(changes.power || {}) },
            frequency: { ...state.speakers[i].frequency, ...(changes.frequency || {}) },
            coverage: { ...state.speakers[i].coverage, ...(changes.coverage || {}) }
        });
        state.speakers[i] = updated;
        dispatch("speaker:updated", updated);
        return clone(updated);
    }

    function remove(id) {
        const i = state.speakers.findIndex(s => s.id === id);
        if (i === -1) return false;
        const removed = state.speakers.splice(i, 1)[0];
        dispatch("speaker:deleted", removed);
        return true;
    }

    function calculateSPLAtDistance(speaker, distance, inputPower = null) {
        if (!speaker) return 0;
        distance = Math.max(num(distance, 1), 0.5);
        let spl = num(speaker.maxSPL, 0);
        if (inputPower !== null && speaker.power.rms > 0) {
            const ratio = Math.max(inputPower / speaker.power.rms, 0.0001);
            spl += 10 * Math.log10(ratio);
        }
        return spl - 20 * Math.log10(distance);
    }

    function estimateCoverageArea(speaker, mountingHeight, listenerHeight = 1.2) {
        if (!speaker) return 0;
        const h = Math.max(mountingHeight - listenerHeight, 0.5);
        const hA = speaker.coverage.horizontal;
        const vA = speaker.coverage.vertical;
        const hR = h * Math.tan((hA / 2) * Math.PI / 180);
        const vR = h * Math.tan((vA / 2) * Math.PI / 180);
        return Math.PI * Math.abs(hR) * Math.abs(vR);
    }

    function dispatch(name, detail) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    }

    const SpeakerAPI = {
        state, init, getAll, get, add, update, delete: remove,
        calculateSPL: calculateSPLAtDistance,
        estimateCoverageArea,
        load(data) {
            if (!data) return false;
            if (Array.isArray(data)) state.speakers = data.map(normalize);
            else if (Array.isArray(data.speakers)) state.speakers = data.speakers.map(normalize);
            else return false;
            dispatch("speaker:database-loaded");
            return true;
        }
    };

    AE.speaker = SpeakerAPI;
    window.SpeakerDatabase = SpeakerAPI;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => init(), { once: true });
    } else { init(); }
})();
