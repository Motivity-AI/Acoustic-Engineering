/* ============================================================
   Acoustic Engineering — js/engine.js
   Engineering Calculation & Intelligent Design Engine
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    const state = {
        version: "1.0",
        room: { width: 12, depth: 8, height: 3, listenerHeight: 1.2, wallMaterial: "standard", reflectionLevel: "medium" },
        stage: { enabled: false, width: 6, depth: 3, x: 3, y: 0, height: 0.6 },
        audience: { count: 100, areaRatio: 0.75 },
        target: { spl: 85, headroom: 10, coverage: 90, uniformity: 6 },
        design: {
            mode: "intelligent", speakerId: null,
            mountingHeight: 2.5, preferredMounting: "wall",
            overlap: 0.15, edgeMargin: 0.5,
            maxSpacingFactor: 0.85, minSPL: 79, maxSPL: 105
        },
        speakers: [], coveragePoints: [], analysis: null, result: null
    };

    function num(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
    function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
    function distance(x1, y1, x2, y2) { return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)); }
    function rad(d) { return d * Math.PI / 180; }
    function deg(r) { return r * 180 / Math.PI; }
    function round(v, d = 2) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

    function average(values) { return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0; }
    function min(values) { return values.length ? Math.min(...values) : 0; }
    function max(values) { return values.length ? Math.max(...values) : 0; }

    function emit(name, detail = {}) {
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    }

    function setRoom(data = {}) {
        state.room.width = Math.max(1, num(data.width, state.room.width));
        state.room.depth = Math.max(1, num(data.depth, state.room.depth));
        state.room.height = Math.max(1, num(data.height, state.room.height));
        if (data.listenerHeight !== undefined) state.room.listenerHeight = Math.max(0.5, num(data.listenerHeight, 1.2));
        if (data.wallMaterial) state.room.wallMaterial = data.wallMaterial;
        if (data.reflectionLevel) state.room.reflectionLevel = data.reflectionLevel;
        emit("engine:room-updated", { room: getRoom() });
        return getRoom();
    }

    function getRoom() { return { ...state.room }; }
    function getRoomArea() { return state.room.width * state.room.depth; }
    function getRoomVolume() { return getRoomArea() * state.room.height; }

    function setStage(data = {}) {
        if (data.enabled !== undefined) state.stage.enabled = !!data.enabled;
        state.stage.width = Math.max(0.5, num(data.width, state.stage.width));
        state.stage.depth = Math.max(0.5, num(data.depth, state.stage.depth));
        state.stage.x = num(data.x, state.stage.x);
        state.stage.y = num(data.y, state.stage.y);
        state.stage.height = Math.max(0, num(data.height, state.stage.height));
        return { ...state.stage };
    }

    function setAudience(data = {}) {
        if (data.count !== undefined) state.audience.count = Math.max(0, Math.round(num(data.count, state.audience.count)));
        if (data.areaRatio !== undefined) state.audience.areaRatio = clamp(num(data.areaRatio, 0.75), 0.1, 1);
        return { ...state.audience };
    }

    function setTargets(data = {}) {
        if (data.spl !== undefined) state.target.spl = num(data.spl, state.target.spl);
        if (data.headroom !== undefined) state.target.headroom = Math.max(0, num(data.headroom, state.target.headroom));
        if (data.coverage !== undefined) state.target.coverage = clamp(num(data.coverage, state.target.coverage), 1, 100);
        if (data.uniformity !== undefined) state.target.uniformity = Math.max(1, num(data.uniformity, state.target.uniformity));
        return { ...state.target };
    }

    function getSpeakerDatabase() {
        if (AE.speaker && typeof AE.speaker.getAll === "function") return AE.speaker.getAll();
        if (window.SpeakerDatabase && typeof window.SpeakerDatabase.getAll === "function") return window.SpeakerDatabase.getAll();
        return [];
    }

    function getSpeakerById(id) {
        if (AE.speaker && typeof AE.speaker.get === "function") return AE.speaker.get(id);
        return getSpeakerDatabase().find(s => s.id === id) || null;
    }

    function recommendSpeaker(requirements = {}) {
        const db = getSpeakerDatabase();
        if (!db.length) return null;
        let c = [...db];
        if (requirements.category) c = c.filter(s => s.category === requirements.category);
        if (requirements.minPower) c = c.filter(s => num(s.power?.rms) >= requirements.minPower);
        if (requirements.minSPL) c = c.filter(s => num(s.maxSPL) >= requirements.minSPL);
        c.sort((a, b) => num(b.maxSPL) - num(a.maxSPL));
        return c[0] || null;
    }

    function getCoverageDimensions(speaker, mountingHeight = state.design.mountingHeight) {
        if (!speaker) return { width: 0, depth: 0, area: 0 };
        const listenerHeight = state.room.listenerHeight;
        const effectiveHeight = Math.max(0.5, mountingHeight - listenerHeight);
        const hAngle = clamp(num(speaker.coverage?.horizontal, 90), 1, 180);
        const vAngle = clamp(num(speaker.coverage?.vertical, 60), 1, 180);
        const width = 2 * effectiveHeight * Math.tan(rad(hAngle / 2));
        const depth = 2 * effectiveHeight * Math.tan(rad(vAngle / 2));
        return {
            width: Math.abs(width), depth: Math.abs(depth),
            area: Math.abs(width * depth), effectiveHeight,
            horizontalAngle: hAngle, verticalAngle: vAngle
        };
    }

    function calculateDistanceLoss(d) { return 20 * Math.log10(Math.max(0.5, num(d, 1))); }

    function calculateSPL(speaker, distanceMeters, inputPower = null) {
        if (!speaker) return 0;
        let sourceSPL = num(speaker.maxSPL, 0);
        const rms = num(speaker.power?.rms, 0);
        if (inputPower !== null && rms > 0) {
            const ratio = Math.max(num(inputPower) / rms, 0.001);
            sourceSPL += 10 * Math.log10(ratio);
        }
        return sourceSPL - calculateDistanceLoss(distanceMeters);
    }

    function isPointCovered(speakerObject, speaker, point) {
        if (!speakerObject || !speaker || !point) return false;
        const dx = point.x - speakerObject.x, dy = point.y - speakerObject.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.01) return true;
        const bearing = deg(Math.atan2(dy, dx));
        let rel = bearing - num(speakerObject.rotation, 0);
        while (rel > 180) rel -= 360;
        while (rel < -180) rel += 360;
        const hLimit = num(speaker.coverage?.horizontal, 90) / 2;
        return Math.abs(rel) <= hLimit;
    }

    function createCoverageGrid(options = {}) {
        const spacing = Math.max(0.5, num(options.spacing, 1));
        const width = num(options.width, state.room.width);
        const depth = num(options.depth, state.room.depth);
        const points = [];
        for (let y = spacing / 2; y < depth; y += spacing) {
            for (let x = spacing / 2; x < width; x += spacing) {
                points.push({
                    id: `p_${points.length + 1}`, x: round(x, 3), y: round(y, 3),
                    spl: 0, covered: false, speakerCount: 0, contributors: []
                });
            }
        }
        state.coveragePoints = points;
        return points;
    }

    function calculatePointSPL(point, speakerObjects) {
        if (!point || !speakerObjects?.length) return { spl: 0, covered: false, speakerCount: 0, contributors: [] };
        const contributors = [];
        speakerObjects.forEach(obj => {
            const speaker = getSpeakerById(obj.speakerId);
            if (!speaker || obj.mute || obj.enabled === false) return;
            const d = Math.max(0.5, distance(obj.x, obj.y, point.x, point.y));
            if (!isPointCovered(obj, speaker, point)) return;
            const spl = calculateSPL(speaker, d, obj.power || speaker.power?.rms) + num(obj.gain, 0);
            contributors.push({
                objectId: obj.id, speakerId: speaker.id,
                model: speaker.model, distance: d, spl
            });
        });
        if (!contributors.length) return { spl: 0, covered: false, speakerCount: 0, contributors: [] };
        const energy = contributors.reduce((sum, c) => sum + Math.pow(10, c.spl / 10), 0);
        const totalSPL = 10 * Math.log10(energy);
        return { spl: totalSPL, covered: totalSPL >= state.target.minSPL, speakerCount: contributors.length, contributors };
    }

    function analyzeCoverage(speakerObjects = state.speakers, options = {}) {
        const spacing = num(options.spacing, Math.max(0.5, Math.min(1.5, state.room.width / 10)));
        const points = createCoverageGrid({ width: state.room.width, depth: state.room.depth, spacing });
        const results = points.map(p => ({ ...p, ...calculatePointSPL(p, speakerObjects) }));
        const splValues = results.map(p => p.spl).filter(s => s > 0);
        const coveredCount = results.filter(p => p.spl >= state.target.spl).length;
        const coveragePercent = results.length ? (coveredCount / results.length) * 100 : 0;
        const avgSPL = average(splValues);
        const minSPL = min(splValues);
        const maxSPL = max(splValues);
        const uniformity = maxSPL - minSPL;
        const analysis = {
            points: results, totalPoints: results.length,
            coveredPoints: coveredCount, coveragePercent: round(coveragePercent, 2),
            averageSPL: round(avgSPL, 2), minimumSPL: round(minSPL, 2),
            maximumSPL: round(maxSPL, 2), uniformity: round(uniformity, 2),
            targetSPL: state.target.spl, targetCoverage: state.target.coverage
        };
        state.analysis = analysis;
        emit("engine:coverage-analysis", analysis);
        return analysis;
    }

    function clampSpeakerPosition(x, y, speaker, margin = state.design.edgeMargin) {
        const coverage = getCoverageDimensions(speaker);
        return {
            x: clamp(x, margin, state.room.width - margin),
            y: clamp(y, margin, state.room.depth - margin),
            halfWidth: Math.min(coverage.width / 2, state.room.width / 2),
            halfDepth: Math.min(coverage.depth / 2, state.room.depth / 2)
        };
    }

    function calculateDistributedLayout(speaker, options = {}) {
        if (!speaker) return [];
        const mountingHeight = num(options.mountingHeight, state.design.mountingHeight);
        const dimensions = getCoverageDimensions(speaker, mountingHeight);
        const overlap = clamp(num(options.overlap, state.design.overlap), 0, 0.5);
        const effectiveWidth = Math.max(1, dimensions.width * (1 - overlap));
        const effectiveDepth = Math.max(1, dimensions.depth * (1 - overlap));
        const edge = Math.max(0.25, num(options.edgeMargin, state.design.edgeMargin));
        const availableWidth = Math.max(1, state.room.width - edge * 2);
        const availableDepth = Math.max(1, state.room.depth - edge * 2);
        let columns = Math.max(1, Math.ceil(availableWidth / effectiveWidth));
        let rows = Math.max(1, Math.ceil(availableDepth / effectiveDepth));
        const maxSpeakers = num(options.maxSpeakers, 100);
        while (columns * rows > maxSpeakers) {
            if (columns >= rows) columns--; else rows--;
            columns = Math.max(1, columns);
            rows = Math.max(1, rows);
        }
        const spacingX = availableWidth / columns;
        const spacingY = availableDepth / rows;
        const layout = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const x = edge + spacingX * (col + 0.5);
                const y = edge + spacingY * (row + 0.5);
                let rotation = 0;
                if (options.pointToCenter !== false) {
                    const cx = state.room.width / 2;
                    const cy = state.room.depth / 2;
                    rotation = deg(Math.atan2(cy - y, cx - x));
                }
                layout.push({
                    id: createObjectId(), type: "speaker",
                    speakerId: speaker.id, model: speaker.model,
                    x: round(x, 3), y: round(y, 3), z: mountingHeight,
                    rotation: round(rotation, 2),
                    power: speaker.power?.rms || 0, maxSPL: speaker.maxSPL || 0,
                    horizontalCoverage: speaker.coverage?.horizontal || 90,
                    verticalCoverage: speaker.coverage?.vertical || 60,
                    mountingHeight,
                    mounting: options.mounting || state.design.preferredMounting,
                    enabled: true, mute: false, gain: 0, delay: 0
                });
            }
        }
        return layout;
    }

    function calculateFrontMainLayout(speaker, options = {}) {
        if (!speaker) return [];
        const count = Math.max(1, Math.round(num(options.count, 2)));
        const stage = state.stage;
        const y = stage.enabled ? Math.max(0.5, stage.y - 0.8) : 0.8;
        const center = state.room.width / 2;
        const spacing = Math.min(5, state.room.width / Math.max(2, count));
        const layout = [];
        for (let i = 0; i < count; i++) {
            const x = count === 1 ? center : center + (i - (count - 1) / 2) * spacing;
            const rotation = deg(Math.atan2((state.room.depth - y) - y, center - x));
            layout.push({
                id: createObjectId(), type: "speaker",
                speakerId: speaker.id, model: speaker.model,
                x: round(x, 3), y: round(y, 3),
                z: num(options.mountingHeight, state.room.height * 0.7),
                rotation: round(rotation, 2),
                power: speaker.power?.rms || 0, maxSPL: speaker.maxSPL || 0,
                horizontalCoverage: speaker.coverage?.horizontal || 90,
                verticalCoverage: speaker.coverage?.vertical || 60,
                mountingHeight: num(options.mountingHeight, state.room.height * 0.7),
                mounting: options.mounting || "stand",
                enabled: true, mute: false, gain: 0, delay: 0
            });
        }
        return layout;
    }

    function createObjectId() {
        return "spkobj_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
    }

    function autoDesign(options = {}) {
        const requestedSpeakerId = options.speakerId || state.design.speakerId;
        let speaker = requestedSpeakerId ? getSpeakerById(requestedSpeakerId) : null;
        if (!speaker) {
            speaker = recommendSpeaker({
                category: options.category || "fullrange",
                minPower: options.minPower || 100,
                minSPL: options.minSPL || 115
            });
        }
        if (!speaker) {
            const error = "No suitable speaker found.";
            emit("engine:error", { message: error });
            return { success: false, error };
        }
        state.design.speakerId = speaker.id;
        const mode = options.mode || state.design.mode;
        let layout = [];
        if (mode === "distributed") {
            layout = calculateDistributedLayout(speaker, options);
        } else if (mode === "front") {
            layout = calculateFrontMainLayout(speaker, options);
        } else {
            layout = calculateDistributedLayout(speaker, options);
        }
        layout = layout.map(obj => {
            const pos = clampSpeakerPosition(obj.x, obj.y, speaker);
            return { ...obj, x: round(pos.x, 3), y: round(pos.y, 3) };
        });
        const analysis = analyzeCoverage(layout, { spacing: options.gridSpacing || 1 });
        const warnings = generateWarnings(layout, analysis, speaker);
        const summary = buildEngineeringSummary(layout, analysis, speaker, warnings);
        const result = { success: true, mode, speaker, layout, analysis, warnings, summary, timestamp: new Date().toISOString() };
        state.speakers = layout;
        state.analysis = analysis;
        state.result = result;
        emit("engine:auto-design-complete", result);
        return result;
    }

    function calculateOverlap(objects = state.speakers) {
        const overlaps = [];
        for (let i = 0; i < objects.length; i++) {
            for (let j = i + 1; j < objects.length; j++) {
                const a = objects[i], b = objects[j];
                const d = distance(a.x, a.y, b.x, b.y);
                const spkA = getSpeakerById(a.speakerId);
                const spkB = getSpeakerById(b.speakerId);
                if (!spkA || !spkB) continue;
                const cA = getCoverageDimensions(spkA, a.mountingHeight);
                const cB = getCoverageDimensions(spkB, b.mountingHeight);
                const overlapDist = Math.max(cA.width, cA.depth) / 2 + Math.max(cB.width, cB.depth) / 2;
                if (d < overlapDist) {
                    overlaps.push({
                        a: a.id, b: b.id, distance: round(d, 2),
                        overlapPercent: round((1 - d / overlapDist) * 100, 1)
                    });
                }
            }
        }
        return overlaps;
    }

    function analyzeSpacing(objects = state.speakers) {
        if (objects.length < 2) return { minimum: 0, maximum: 0, average: 0, distances: [] };
        const distances = [];
        for (let i = 0; i < objects.length; i++) {
            for (let j = i + 1; j < objects.length; j++) {
                distances.push(distance(objects[i].x, objects[i].y, objects[j].x, objects[j].y));
            }
        }
        return { minimum: round(min(distances), 2), maximum: round(max(distances), 2), average: round(average(distances), 2), distances };
    }

    function calculateDelayForLayout(objects = state.speakers, referencePoint = null) {
        if (!objects.length) return [];
        const ref = referencePoint || { x: state.room.width / 2, y: state.room.depth * 0.25 };
        const distances = objects.map(o => distance(o.x, o.y, ref.x, ref.y));
        const minD = min(distances);
        return objects.map((o, i) => ({
            id: o.id, distance: round(distances[i], 2),
            delayMs: round((distances[i] - minD) / 343 * 1000, 2)
        }));
    }

    function generateWarnings(objects, analysis, speaker) {
        const warnings = [];
        if (!objects.length) {
            warnings.push({ level: "critical", code: "NO_SPEAKERS", message: "لم يتم وضع أي سماعات." });
            return warnings;
        }
        if (analysis.coveragePercent < state.target.coverage) {
            warnings.push({ level: "warning", code: "LOW_COVERAGE", message: `التغطية ${round(analysis.coveragePercent, 1)}% أقل من الهدف ${state.target.coverage}%.` });
        }
        if (analysis.minimumSPL < state.target.spl) {
            warnings.push({ level: "warning", code: "LOW_SPL", message: `أقل SPL ${round(analysis.minimumSPL, 1)} dB أقل من الهدف.` });
        }
        if (analysis.uniformity > state.target.uniformity) {
            warnings.push({ level: "warning", code: "LOW_UNIFORMITY", message: `فرق التغطية ${round(analysis.uniformity, 1)} dB يتجاوز الحد.` });
        }
        return warnings;
    }

    function buildEngineeringSummary(objects, analysis, speaker, warnings) {
        const spacing = analyzeSpacing(objects);
        const delay = calculateDelayForLayout(objects);
        const dimensions = getCoverageDimensions(speaker);
        const critical = warnings.filter(w => w.level === "critical").length;
        const warningCount = warnings.filter(w => w.level === "warning").length;
        let status = "acceptable";
        if (critical > 0) status = "critical";
        else if (warningCount > 0) status = "review";
        return {
            room: { width: state.room.width, depth: state.room.depth, height: state.room.height, area: round(getRoomArea(), 2), volume: round(getRoomVolume(), 2) },
            speaker: { id: speaker.id, manufacturer: speaker.manufacturer, model: speaker.model, rms: speaker.power?.rms || 0, maxSPL: speaker.maxSPL || 0 },
            quantity: objects.length,
            coverage: { percentage: analysis.coveragePercent, averageSPL: analysis.averageSPL, minimumSPL: analysis.minimumSPL, maximumSPL: analysis.maximumSPL, uniformity: analysis.uniformity },
            footprint: { width: round(dimensions.width, 2), depth: round(dimensions.depth, 2), area: round(dimensions.area, 2) },
            spacing, delay, warnings: warnings.length, criticalWarnings: critical, reviewWarnings: warningCount, status
        };
    }

    function generateBOM(objects = state.speakers) {
        const groups = {};
        objects.forEach(obj => {
            const speaker = getSpeakerById(obj.speakerId);
            if (!speaker) return;
            const key = speaker.id;
            if (!groups[key]) {
                groups[key] = {
                    speakerId: speaker.id, manufacturer: speaker.manufacturer,
                    model: speaker.model, type: speaker.type, quantity: 0,
                    rms: speaker.power?.rms || 0, maxSPL: speaker.maxSPL || 0,
                    coverage: `${speaker.coverage?.horizontal || 0}° × ${speaker.coverage?.vertical || 0}°`
                };
            }
            groups[key].quantity++;
        });
        return Object.values(groups);
    }

    function analyzeDesign(objects = state.speakers, options = {}) {
        const coverage = analyzeCoverage(objects, options);
        const overlaps = calculateOverlap(objects);
        const spacing = analyzeSpacing(objects);
        const delays = calculateDelayForLayout(objects, options.referencePoint);
        const bom = generateBOM(objects);
        const speaker = objects.length ? getSpeakerById(objects[0].speakerId) : null;
        const warnings = generateWarnings(objects, coverage, speaker);
        const result = {
            coverage, overlaps, spacing, delays, bom, warnings,
            room: getRoom(), stage: { ...state.stage }, target: { ...state.target },
            speakerCount: objects.length, timestamp: new Date().toISOString()
        };
        state.analysis = result;
        emit("engine:design-analysis", result);
        return result;
    }

    function getDesignData() {
        return {
            engineVersion: state.version,
            room: { ...state.room }, stage: { ...state.stage },
            audience: { ...state.audience }, target: { ...state.target },
            design: { ...state.design },
            speakers: state.speakers.map(o => ({ ...o })),
            analysis: state.analysis ? JSON.parse(JSON.stringify(state.analysis)) : null
        };
    }

    function loadDesign(data) {
        if (!data) return false;
        if (data.room) setRoom(data.room);
        if (data.stage) setStage(data.stage);
        if (data.audience) setAudience(data.audience);
        if (data.target) setTargets(data.target);
        if (data.design) state.design = { ...state.design, ...data.design };
        if (Array.isArray(data.speakers)) state.speakers = data.speakers.map(o => ({ ...o }));
        if (data.analysis) state.analysis = data.analysis;
        emit("engine:design-loaded", getDesignData());
        return true;
    }

    function reset() {
        state.speakers = [];
        state.coveragePoints = [];
        state.analysis = null;
        state.result = null;
        state.design.speakerId = null;
        emit("engine:reset");
    }

    AE.engine = {
        state, init: () => true,
        setRoom, getRoom, getRoomArea, getRoomVolume,
        setStage, setAudience, setTargets,
        getSpeakerDatabase, getSpeakerById, recommendSpeaker,
        getCoverageDimensions, calculateDistanceLoss, calculateSPL,
        isPointCovered, createCoverageGrid, calculatePointSPL,
        analyzeCoverage, calculateDistributedLayout, calculateFrontMainLayout,
        autoDesign, calculateOverlap, analyzeSpacing, calculateDelayForLayout,
        generateWarnings, buildEngineeringSummary, generateBOM,
        analyzeDesign, getDesignData, loadDesign, reset
    };
    window.AcousticEngine = AE.engine;
})();
