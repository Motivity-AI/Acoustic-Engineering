/* ============================================================
   Acoustic Engineering — js/engine.js v2.0.0
   Engineering Calculation & Intelligent Design Engine
   ✅ يدعم بنية speaker.js الجديدة (مسطّحة) + القديمة (متداخلة)
   ✅ متوافق مع app.html المُصلَح
   ✅ مزامنة مع speaker.js عبر events
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════ Resolution helpers ═══════════════ */

    function getSpeakerAPI() {
        return AE.speaker || window.AcousticSpeaker || window.SpeakerDatabase || null;
    }

    /* ═══════════════ State ═══════════════ */

    const state = {
        version: "2.0.0",

        room: {
            width: 20,
            depth: 15,
            height: 4,
            listenerHeight: 1.2,
            wallMaterial: "standard",
            reflectionLevel: "medium"
        },

        stage: {
            enabled: false,
            width: 8,
            depth: 4,
            x: 6,
            y: 0,
            height: 0.6
        },

        audience: {
            count: 300,
            areaRatio: 0.75
        },

        target: {
            spl: 95,
            headroom: 6,
            coverage: 90,
            uniformity: 6
        },

        design: {
            mode: "auto",                    // ← موحّد مع app.html
            speakerId: null,
            mountingHeight: 3.2,
            preferredMounting: "Wall",       // ← يطابق mounting_type
            overlap: 0.15,
            edgeMargin: 0.5,
            maxSpacingFactor: 0.85,
            minSPL: null                     // ← يُحسب من target.spl - headroom
        },

        speakers: [],           // layout objects (مواقع سماعات على المخطط)
        coveragePoints: [],
        analysis: null,
        result: null
    };

    /* ═══════════════ Helpers ═══════════════ */

    function num(v, fb = 0, min = -Infinity, max = Infinity) {
        const n = Number(v);
        if (!Number.isFinite(n)) return fb;
        return Math.min(max, Math.max(min, n));
    }

    function clamp(v, min, max) {
        return Math.min(Math.max(v, min), max);
    }

    function distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    function rad(d) { return d * Math.PI / 180; }
    function deg(r) { return r * 180 / Math.PI; }

    function round(v, d = 2) {
        const f = Math.pow(10, d);
        return Math.round(v * f) / f;
    }

    function average(arr) {
        return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    }

    function min(arr) { return arr.length ? Math.min(...arr) : 0; }
    function max(arr) { return arr.length ? Math.max(...arr) : 0; }

    /* ═══════════════ Secure ID ═══════════════ */

    let _idCounter = 0;
    function createObjectId() {
        try {
            if (typeof crypto !== "undefined") {
                if (typeof crypto.randomUUID === "function") {
                    return "spkobj_" + crypto.randomUUID();
                }
                if (crypto.getRandomValues) {
                    const b = new Uint8Array(8);
                    crypto.getRandomValues(b);
                    const hex = Array.from(b)
                        .map(x => x.toString(16).padStart(2, "0"))
                        .join("");
                    return "spkobj_" + hex;
                }
            }
        } catch { /* ignore */ }
        return "spkobj_" + Date.now().toString(36) + "_" + (_idCounter++);
    }

    /* ═══════════════ Events ═══════════════ */

    function emit(name, detail = {}) {
        try {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        } catch (err) {
            console.warn("[Engine] emit failed:", name, err);
        }
    }

    /* ═══════════════════════════════════════════════════════════
       🎯 دالة محورية: قراءة مواصفات السماعة من أي بنية
       تدعم المسطّحة (speaker.js الجديد) والمتداخلة (القديم)
       ═══════════════════════════════════════════════════════════ */

    function readSpeakerSpecs(speaker) {
        if (!speaker) {
            return {
                rms: 0, peak: 0, maxSPL: 0, sensitivity: 0,
                freqMin: 0, freqMax: 0, horizontal: 90, vertical: 60,
                impedance: 8, weight: 0, category: "Point Source",
                manufacturer: "", model: ""
            };
        }

        const power = speaker.power && typeof speaker.power === "object" && !Array.isArray(speaker.power)
            ? speaker.power : {};
        const freq = speaker.frequency && typeof speaker.frequency === "object" && !Array.isArray(speaker.frequency)
            ? speaker.frequency : {};
        const cov = speaker.coverage && typeof speaker.coverage === "object" && !Array.isArray(speaker.coverage)
            ? speaker.coverage : {};

        return {
            rms: num(speaker.rms_power ?? power.rms, 0, 0, 50000),
            peak: num(speaker.peak_power ?? power.peak ?? power.program, 0, 0, 100000),
            maxSPL: num(speaker.max_spl ?? speaker.maxSPL, 0, 0, 200),
            sensitivity: num(speaker.sensitivity, 0, 0, 150),
            freqMin: num(speaker.frequency_min ?? freq.low, 0, 0, 20000),
            freqMax: num(speaker.frequency_max ?? freq.high, 0, 0, 40000),
            horizontal: num(speaker.horizontal_coverage ?? cov.horizontal, 90, 0.1, 360),
            vertical: num(speaker.vertical_coverage ?? cov.vertical, 60, 0.1, 360),
            impedance: num(speaker.impedance, 8, 0.1, 100),
            weight: num(speaker.weight, 0, 0, 500),
            category: speaker.category || speaker.type || "Point Source",
            manufacturer: speaker.manufacturer || "Generic",
            model: speaker.model || "Unnamed"
        };
    }

    /* ═══════════════ Room ═══════════════ */

    function setRoom(data = {}) {
        state.room.width  = num(data.width,  state.room.width,  1, 1000);
        state.room.depth  = num(data.depth,  state.room.depth,  1, 1000);
        state.room.height = num(data.height, state.room.height, 1, 100);

        if (data.listenerHeight !== undefined) {
            state.room.listenerHeight = num(data.listenerHeight, 1.2, 0.5, 3);
        }
        if (data.wallMaterial) state.room.wallMaterial = String(data.wallMaterial);
        if (data.reflectionLevel) state.room.reflectionLevel = String(data.reflectionLevel);

        emit("engine:room-updated", { room: getRoom() });
        return getRoom();
    }

    function getRoom() { return { ...state.room }; }
    function getRoomArea() { return state.room.width * state.room.depth; }
    function getRoomVolume() { return getRoomArea() * state.room.height; }

    /* ═══════════════ Stage ═══════════════ */

    function setStage(data = {}) {
        if (data.enabled !== undefined) state.stage.enabled = !!data.enabled;
        state.stage.width  = num(data.width,  state.stage.width,  0.5, 50);
        state.stage.depth  = num(data.depth,  state.stage.depth,  0.5, 30);
        state.stage.x      = num(data.x,      state.stage.x,      0, state.room.width);
        state.stage.y      = num(data.y,      state.stage.y,      0, state.room.depth);
        state.stage.height = num(data.height, state.stage.height, 0, 5);
        return { ...state.stage };
    }

    function setAudience(data = {}) {
        if (data.count !== undefined) {
            state.audience.count = Math.max(0, Math.round(num(data.count, 0, 0, 100000)));
        }
        if (data.areaRatio !== undefined) {
            state.audience.areaRatio = clamp(num(data.areaRatio, 0.75), 0.1, 1);
        }
        return { ...state.audience };
    }

    function setTargets(data = {}) {
        if (data.spl !== undefined) {
            state.target.spl = num(data.spl, 95, 60, 130);
        }
        if (data.headroom !== undefined) {
            state.target.headroom = num(data.headroom, 6, 0, 20);
        }
        if (data.coverage !== undefined) {
            state.target.coverage = clamp(num(data.coverage, 90), 1, 100);
        }
        if (data.uniformity !== undefined) {
            state.target.uniformity = num(data.uniformity, 6, 0.5, 30);
        }
        // أعد حساب minSPL
        state.design.minSPL = state.target.spl - state.target.headroom;
        return { ...state.target };
    }

    /* ═══════════════ Speaker DB bridge ═══════════════ */

    function getSpeakerDatabase() {
        const api = getSpeakerAPI();
        if (!api) return [];
        try {
            if (typeof api.list === "function") return api.list();
            if (typeof api.getAll === "function") return api.getAll();
        } catch (err) {
            console.warn("[Engine] getSpeakerDatabase failed:", err);
        }
        return [];
    }

    function getSpeakerById(id) {
        if (!id) return null;
        const api = getSpeakerAPI();
        if (api) {
            try {
                if (typeof api.getById === "function") return api.getById(id);
                if (typeof api.get === "function") return api.get(id);
            } catch { /* ignore */ }
        }
        return getSpeakerDatabase().find(s => s.id === id) || null;
    }

    /* ═══════════════ Speaker Recommendation ═══════════════ */

    function recommendSpeaker(requirements = {}) {
        const db = getSpeakerDatabase();
        if (!db.length) return null;

        let candidates = [...db];

        /* ─── فئة (بأسماء speaker.js الجديدة) ─── */
        if (requirements.category) {
            const cat = String(requirements.category);
            const filtered = candidates.filter(s => {
                const specs = readSpeakerSpecs(s);
                return specs.category.toLowerCase() === cat.toLowerCase();
            });
            if (filtered.length) candidates = filtered;
        }

        /* ─── قدرة RMS ─── */
        if (requirements.minPower) {
            const minP = num(requirements.minPower, 0);
            const filtered = candidates.filter(s => readSpeakerSpecs(s).rms >= minP);
            if (filtered.length) candidates = filtered;
        }

        /* ─── Max SPL ─── */
        if (requirements.minSPL) {
            const minS = num(requirements.minSPL, 0);
            const filtered = candidates.filter(s => readSpeakerSpecs(s).maxSPL >= minS);
            if (filtered.length) candidates = filtered;
        }

        /* ─── ترتيب حسب Max SPL ─── */
        candidates.sort((a, b) =>
            readSpeakerSpecs(b).maxSPL - readSpeakerSpecs(a).maxSPL
        );

        return candidates[0] || db[0] || null;
    }

    /* ═══════════════ Coverage Geometry ═══════════════ */

    function getCoverageDimensions(speaker, mountingHeight) {
        const mh = num(mountingHeight, state.design.mountingHeight);
        const lh = state.room.listenerHeight;
        const effectiveHeight = Math.max(0.5, mh - lh);

        if (!speaker) {
            return {
                width: 0, depth: 0, area: 0,
                effectiveHeight,
                horizontalAngle: 90, verticalAngle: 60
            };
        }

        const specs = readSpeakerSpecs(speaker);
        const hAngle = clamp(specs.horizontal, 1, 360);
        const vAngle = clamp(specs.vertical, 1, 360);

        const width = 2 * effectiveHeight * Math.tan(rad(hAngle / 2));
        const depth = 2 * effectiveHeight * Math.tan(rad(vAngle / 2));

        return {
            width: Math.abs(width),
            depth: Math.abs(depth),
            area: Math.abs(width * depth),
            effectiveHeight,
            horizontalAngle: hAngle,
            verticalAngle: vAngle
        };
    }

    function estimateCoverageArea(speaker, mountingHeight, listenerHeight) {
        const prevLH = state.room.listenerHeight;
        if (listenerHeight !== undefined) state.room.listenerHeight = listenerHeight;
        const dims = getCoverageDimensions(speaker, mountingHeight);
        state.room.listenerHeight = prevLH;
        return dims.area;
    }

    /* ═══════════════ SPL Calculations ═══════════════ */

    function calculateDistanceLoss(d) {
        const dist = Math.max(0.5, num(d, 1));
        return 20 * Math.log10(dist);
    }

    function calculateSPL(speaker, distanceMeters, inputPower) {
        if (!speaker) return 0;
        const specs = readSpeakerSpecs(speaker);

        let sourceSPL = specs.maxSPL;

        /* ─── تعديل حسب القدرة المُدخلة ─── */
        if (inputPower !== undefined && inputPower !== null && specs.rms > 0) {
            const power = Math.max(num(inputPower, specs.rms), 0.001);
            const ratio = power / specs.rms;
            sourceSPL += 10 * Math.log10(ratio);
        }

        return sourceSPL - calculateDistanceLoss(distanceMeters);
    }

    /* ═══════════════ Point Coverage Check ═══════════════ */

    function isPointCovered(speakerObject, speaker, point) {
        if (!speakerObject || !speaker || !point) return false;

        const dx = point.x - speakerObject.x;
        const dy = point.y - speakerObject.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.01) return true;

        const bearing = deg(Math.atan2(dy, dx));
        let rel = bearing - num(speakerObject.rotation, 0);
        while (rel > 180) rel -= 360;
        while (rel < -180) rel += 360;

        const specs = readSpeakerSpecs(speaker);
        const hLimit = specs.horizontal / 2;
        return Math.abs(rel) <= hLimit;
    }

    /* ═══════════════ Coverage Grid ═══════════════ */

    const MAX_GRID_POINTS = 5000;

    function createCoverageGrid(options = {}) {
        const spacing = Math.max(0.5, num(options.spacing, 1));
        const width  = num(options.width,  state.room.width);
        const depth  = num(options.depth,  state.room.depth);

        /* ─── حساب عدد النقاط مقدماً ─── */
        const estimatedCols = Math.ceil(width / spacing);
        const estimatedRows = Math.ceil(depth / spacing);
        const estimatedTotal = estimatedCols * estimatedRows;

        /* ─── اضبط الـ spacing إن تجاوز الحد ─── */
        let finalSpacing = spacing;
        if (estimatedTotal > MAX_GRID_POINTS) {
            finalSpacing = Math.sqrt((width * depth) / MAX_GRID_POINTS);
            finalSpacing = Math.max(finalSpacing, spacing);
        }

        const points = [];
        for (let y = finalSpacing / 2; y < depth; y += finalSpacing) {
            for (let x = finalSpacing / 2; x < width; x += finalSpacing) {
                points.push({
                    id: `p_${points.length + 1}`,
                    x: round(x, 3),
                    y: round(y, 3),
                    spl: 0,
                    covered: false,
                    speakerCount: 0,
                    contributors: []
                });
                if (points.length >= MAX_GRID_POINTS) break;
            }
            if (points.length >= MAX_GRID_POINTS) break;
        }

        state.coveragePoints = points;
        return points;
    }

    function calculatePointSPL(point, speakerObjects) {
        if (!point || !Array.isArray(speakerObjects) || speakerObjects.length === 0) {
            return { spl: 0, covered: false, speakerCount: 0, contributors: [] };
        }

        const contributors = [];
        const minSPL = state.design.minSPL ?? (state.target.spl - state.target.headroom);

        for (const obj of speakerObjects) {
            const speaker = getSpeakerById(obj.speakerId);
            if (!speaker || obj.mute || obj.enabled === false) continue;

            const d = Math.max(0.5, distance(obj.x, obj.y, point.x, point.y));
            if (!isPointCovered(obj, speaker, point)) continue;

            const specs = readSpeakerSpecs(speaker);
            const spl = calculateSPL(speaker, d, obj.power || specs.rms) + num(obj.gain, 0);

            contributors.push({
                objectId: obj.id,
                speakerId: speaker.id,
                model: specs.model,
                distance: round(d, 2),
                spl: round(spl, 2)
            });
        }

        if (!contributors.length) {
            return { spl: 0, covered: false, speakerCount: 0, contributors: [] };
        }

        /* ─── طاقة صوتية تراكمية ─── */
        const energy = contributors.reduce(
            (sum, c) => sum + Math.pow(10, c.spl / 10), 0
        );
        const totalSPL = 10 * Math.log10(energy);

        return {
            spl: round(totalSPL, 2),
            covered: totalSPL >= minSPL,
            speakerCount: contributors.length,
            contributors
        };
    }

    /* ═══════════════ Coverage Analysis ═══════════════ */

    function analyzeCoverage(speakerObjects, options = {}) {
        const objects = Array.isArray(speakerObjects) ? speakerObjects : state.speakers;

        const spacing = num(
            options.spacing,
            Math.max(0.5, Math.min(1.5, state.room.width / 10))
        );

        const points = createCoverageGrid({
            width: state.room.width,
            depth: state.room.depth,
            spacing
        });

        const results = points.map(p => ({
            ...p,
            ...calculatePointSPL(p, objects)
        }));

        const splValues = results.map(p => p.spl).filter(s => s > 0);
        const targetSPL = state.target.spl;
        const targetCoverage = state.target.coverage;

        /* ─── استخدام معيار واحد للـ covered ─── */
        const coveredCount = results.filter(p => p.spl >= targetSPL).length;
        const coveragePercent = results.length
            ? (coveredCount / results.length) * 100
            : 0;

        const avgSPL = average(splValues);
        const minSPLVal = min(splValues);
        const maxSPLVal = max(splValues);
        const uniformity = maxSPLVal - minSPLVal;

        const analysis = {
            points: results,
            totalPoints: results.length,
            coveredPoints: coveredCount,
            coveragePercent: round(coveragePercent, 2),

            averageSPL: round(avgSPL, 2),
            minimumSPL: round(minSPLVal, 2),
            maximumSPL: round(maxSPLVal, 2),
            uniformity: round(uniformity, 2),

            targetSPL,
            targetCoverage,
            gridSpacing: spacing,
            speakerCount: objects.length,
            timestamp: new Date().toISOString()
        };

        state.analysis = analysis;
        emit("engine:coverage-analysis", analysis);
        return analysis;
    }

    /* ═══════════════ Layouts ═══════════════ */

    function clampSpeakerPosition(x, y, margin) {
        const m = num(margin, state.design.edgeMargin, 0, 5);
        return {
            x: clamp(x, m, state.room.width - m),
            y: clamp(y, m, state.room.depth - m)
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
        let rows    = Math.max(1, Math.ceil(availableDepth / effectiveDepth));

        const maxSpeakers = num(options.maxSpeakers, 200);
        while (columns * rows > maxSpeakers) {
            if (columns >= rows) columns--; else rows--;
            columns = Math.max(1, columns);
            rows = Math.max(1, rows);
        }

        const spacingX = availableWidth / columns;
        const spacingY = availableDepth / rows;

        const specs = readSpeakerSpecs(speaker);
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
                    id: createObjectId(),
                    type: "speaker",
                    speakerId: speaker.id,
                    model: specs.model,
                    manufacturer: specs.manufacturer,
                    x: round(x, 3),
                    y: round(y, 3),
                    z: mountingHeight,
                    rotation: round(rotation, 2),
                    power: specs.rms,
                    maxSPL: specs.maxSPL,
                    horizontalCoverage: specs.horizontal,
                    verticalCoverage: specs.vertical,
                    mountingHeight,
                    mounting: options.mounting || state.design.preferredMounting,
                    enabled: true,
                    mute: false,
                    gain: 0,
                    delay: 0
                });
            }
        }

        return layout;
    }

    function calculateFrontMainLayout(speaker, options = {}) {
        if (!speaker) return [];

        const specs = readSpeakerSpecs(speaker);
        const count = Math.max(1, Math.round(num(options.count, 2)));
        const stage = state.stage;

        /* ─── موقع الأمام: خلف المسرح أو في المقدمة ─── */
        const y = stage.enabled
            ? Math.max(0.5, stage.y + stage.depth + 0.5)
            : 0.8;

        const center = state.room.width / 2;
        const spacing = Math.min(6, state.room.width / Math.max(2, count));

        const mountingHeight = num(options.mountingHeight, state.room.height * 0.7);

        const layout = [];

        for (let i = 0; i < count; i++) {
            const x = count === 1
                ? center
                : center + (i - (count - 1) / 2) * spacing;

            /* ─── اتجاه نحو منتصف الجمهور (لا نحوك المنصة) ─── */
            const targetX = center;
            const targetY = state.room.depth * 0.8;
            const rotation = deg(Math.atan2(targetY - y, targetX - x));

            layout.push({
                id: createObjectId(),
                type: "speaker",
                speakerId: speaker.id,
                model: specs.model,
                manufacturer: specs.manufacturer,
                x: round(x, 3),
                y: round(y, 3),
                z: mountingHeight,
                rotation: round(rotation, 2),
                power: specs.rms,
                maxSPL: specs.maxSPL,
                horizontalCoverage: specs.horizontal,
                verticalCoverage: specs.vertical,
                mountingHeight,
                mounting: options.mounting || "Stand",
                enabled: true,
                mute: false,
                gain: 0,
                delay: 0
            });
        }

        return layout;
    }

    /* ═══════════════ Auto Design ═══════════════ */

    const VALID_MODES = ["auto", "distributed", "front", "front-fill", "ceiling-grid", "delay-fill"];

    function autoDesign(options = {}) {
        try {
            /* ─── 1. اختر السماعة ─── */
            let speaker = null;

            const requestedId = options.speakerId || state.design.speakerId;
            if (requestedId) speaker = getSpeakerById(requestedId);

            if (!speaker) {
                speaker = recommendSpeaker({
                    category: options.category || "Point Source",
                    minPower: options.minPower || 100,
                    minSPL: options.minSPL || 115
                });
            }

            if (!speaker) {
                const error = "لم يتم العثور على سماعة مناسبة في المكتبة";
                emit("engine:error", { message: error });
                return { success: false, error };
            }

            state.design.speakerId = speaker.id;

            /* ─── 2. اختر النمط ─── */
            let mode = String(options.mode || state.design.mode || "auto").toLowerCase();
            if (!VALID_MODES.includes(mode)) mode = "auto";

            /* ─── 3. ولّد التخطيط ─── */
            let layout = [];
            if (mode === "front" || mode === "front-fill") {
                layout = calculateFrontMainLayout(speaker, options);
            } else if (mode === "ceiling-grid" || mode === "distributed" || mode === "auto") {
                layout = calculateDistributedLayout(speaker, options);
            } else if (mode === "delay-fill") {
                /* ─── front + delay ─── */
                const front = calculateFrontMainLayout(speaker, { ...options, count: 2 });
                const delay = calculateDistributedLayout(speaker, {
                    ...options,
                    edgeMargin: state.room.depth * 0.5
                }).filter(obj => obj.y > state.room.depth * 0.5);
                layout = [...front, ...delay];
            }

            /* ─── 4. اضبط المواقع ─── */
            layout = layout.map(obj => {
                const pos = clampSpeakerPosition(obj.x, obj.y);
                return { ...obj, x: round(pos.x, 3), y: round(pos.y, 3) };
            });

            /* ─── 5. حلّل ─── */
            const analysis = analyzeCoverage(layout, { spacing: options.gridSpacing || 1 });
            const warnings = generateWarnings(layout, analysis, speaker);
            const summary = buildEngineeringSummary(layout, analysis, speaker, warnings);

            const result = {
                success: true,
                mode,
                speaker: {
                    id: speaker.id,
                    manufacturer: readSpeakerSpecs(speaker).manufacturer,
                    model: readSpeakerSpecs(speaker).model,
                    category: readSpeakerSpecs(speaker).category
                },
                layout,
                analysis,
                warnings,
                summary,
                timestamp: new Date().toISOString()
            };

            /* ✅ استبدل الـ layout فقط، لا تمس السماعات المضافة يدوياً */
            state.speakers = layout;
            state.analysis = analysis;
            state.result = result;

            emit("engine:auto-design-complete", result);
            return result;

        } catch (err) {
            console.error("[Engine] autoDesign error:", err);
            emit("engine:error", { message: err.message });
            return { success: false, error: err.message };
        }
    }

    /* ═══════════════ Overlap Analysis ═══════════════ */

    function calculateOverlap(objects = state.speakers) {
        const overlaps = [];

        for (let i = 0; i < objects.length; i++) {
            for (let j = i + 1; j < objects.length; j++) {
                const a = objects[i];
                const b = objects[j];

                const d = distance(a.x, a.y, b.x, b.y);
                const spkA = getSpeakerById(a.speakerId);
                const spkB = getSpeakerById(b.speakerId);
                if (!spkA || !spkB) continue;

                const cA = getCoverageDimensions(spkA, a.mountingHeight);
                const cB = getCoverageDimensions(spkB, b.mountingHeight);

                const overlapDist =
                    Math.max(cA.width, cA.depth) / 2 +
                    Math.max(cB.width, cB.depth) / 2;

                if (d < overlapDist) {
                    overlaps.push({
                        a: a.id, b: b.id,
                        distance: round(d, 2),
                        overlapPercent: round((1 - d / overlapDist) * 100, 1)
                    });
                }
            }
        }

        return overlaps;
    }

    /* ═══════════════ Spacing Analysis ═══════════════ */

    function analyzeSpacing(objects = state.speakers) {
        if (objects.length < 2) {
            return { minimum: 0, maximum: 0, average: 0, distances: [] };
        }

        const distances = [];
        for (let i = 0; i < objects.length; i++) {
            for (let j = i + 1; j < objects.length; j++) {
                distances.push(distance(objects[i].x, objects[i].y, objects[j].x, objects[j].y));
            }
        }

        return {
            minimum: round(min(distances), 2),
            maximum: round(max(distances), 2),
            average: round(average(distances), 2),
            distances
        };
    }

    /* ═══════════════ Delay Calculation ═══════════════ */

    const SPEED_OF_SOUND = 343;   // m/s

    function calculateDelayForLayout(objects = state.speakers, referencePoint = null) {
        if (!objects.length) return [];

        const ref = referencePoint || {
            x: state.room.width / 2,
            y: state.room.depth * 0.25
        };

        const distances = objects.map(o => distance(o.x, o.y, ref.x, ref.y));
        const minD = min(distances);

        return objects.map((o, i) => ({
            id: o.id,
            distance: round(distances[i], 2),
            delayMs: round((distances[i] - minD) / SPEED_OF_SOUND * 1000, 2)
        }));
    }

    /* ═══════════════ Warnings ═══════════════ */

    function generateWarnings(objects, analysis, speaker) {
        const warnings = [];

        if (!Array.isArray(objects) || objects.length === 0) {
            warnings.push({
                level: "critical",
                code: "NO_SPEAKERS",
                message: "لم يتم وضع أي سماعات."
            });
            return warnings;
        }

        if (!speaker) {
            warnings.push({
                level: "warning",
                code: "NO_SPEAKER_SPECS",
                message: "لم يتم تحديد سماعة."
            });
            return warnings;
        }

        if (analysis.coveragePercent < state.target.coverage) {
            warnings.push({
                level: analysis.coveragePercent < state.target.coverage - 15 ? "critical" : "warning",
                code: "LOW_COVERAGE",
                message: `التغطية ${round(analysis.coveragePercent, 1)}% أقل من الهدف ${state.target.coverage}%.`
            });
        }

        if (analysis.minimumSPL > 0 && analysis.minimumSPL < state.target.spl) {
            warnings.push({
                level: "warning",
                code: "LOW_SPL",
                message: `أقل SPL ${round(analysis.minimumSPL, 1)} dB أقل من الهدف ${state.target.spl} dB.`
            });
        }

        if (analysis.maximumSPL > state.target.spl + state.target.headroom + 3) {
            warnings.push({
                level: "warning",
                code: "EXCESS_SPL",
                message: `أقصى SPL ${round(analysis.maximumSPL, 1)} dB يتجاوز الهدف بـ headroom.`
            });
        }

        if (analysis.uniformity > state.target.uniformity) {
            warnings.push({
                level: "warning",
                code: "LOW_UNIFORMITY",
                message: `فرق التغطية ${round(analysis.uniformity, 1)} dB يتجاوز الحد المسموح.`
            });
        }

        return warnings;
    }

    /* ═══════════════ Engineering Summary ═══════════════ */

    function buildEngineeringSummary(objects, analysis, speaker, warnings) {
        const spacing = analyzeSpacing(objects);
        const delay = calculateDelayForLayout(objects);
        const dimensions = getCoverageDimensions(speaker);

        const critical = warnings.filter(w => w.level === "critical").length;
        const warningCount = warnings.filter(w => w.level === "warning").length;

        let status = "acceptable";
        if (critical > 0) status = "critical";
        else if (warningCount > 0) status = "review";

        const specs = readSpeakerSpecs(speaker);

        return {
            room: {
                width: state.room.width,
                depth: state.room.depth,
                height: state.room.height,
                area: round(getRoomArea(), 2),
                volume: round(getRoomVolume(), 2)
            },
            speaker: {
                id: speaker?.id,
                manufacturer: specs.manufacturer,
                model: specs.model,
                category: specs.category,
                rms: specs.rms,
                maxSPL: specs.maxSPL
            },
            quantity: objects.length,
            coverage: {
                percentage: analysis.coveragePercent,
                averageSPL: analysis.averageSPL,
                minimumSPL: analysis.minimumSPL,
                maximumSPL: analysis.maximumSPL,
                uniformity: analysis.uniformity
            },
            footprint: {
                width: round(dimensions.width, 2),
                depth: round(dimensions.depth, 2),
                area: round(dimensions.area, 2)
            },
            spacing,
            delay,
            warnings: warnings.length,
            criticalWarnings: critical,
            reviewWarnings: warningCount,
            status
        };
    }

    /* ═══════════════ BOM ═══════════════ */

    function generateBOM(objects = state.speakers) {
        const groups = {};

        objects.forEach(obj => {
            const speaker = getSpeakerById(obj.speakerId);
            if (!speaker) return;

            const specs = readSpeakerSpecs(speaker);
            const key = speaker.id;

            if (!groups[key]) {
                groups[key] = {
                    speakerId: speaker.id,
                    manufacturer: specs.manufacturer,
                    model: specs.model,
                    category: specs.category,
                    type: specs.category,
                    quantity: 0,
                    rms: specs.rms,
                    maxSPL: specs.maxSPL,
                    coverage: `${specs.horizontal}° × ${specs.vertical}°`
                };
            }

            groups[key].quantity++;
        });

        return Object.values(groups);
    }

    /* ═══════════════ Full Analysis ═══════════════ */

    function analyzeDesign(objects, options = {}) {
        const list = Array.isArray(objects) ? objects : state.speakers;

        const coverage = analyzeCoverage(list, options);
        const overlaps = calculateOverlap(list);
        const spacing = analyzeSpacing(list);
        const delays = calculateDelayForLayout(list, options.referencePoint);
        const bom = generateBOM(list);

        const speaker = list.length ? getSpeakerById(list[0].speakerId) : null;
        const warnings = generateWarnings(list, coverage, speaker);

        const result = {
            coverage,
            overlaps,
            spacing,
            delays,
            bom,
            warnings,
            room: getRoom(),
            stage: { ...state.stage },
            target: { ...state.target },
            speakerCount: list.length,
            timestamp: new Date().toISOString()
        };

        state.analysis = result;
        emit("engine:design-analysis", result);
        return result;
    }

    /* ═══════════════ Save / Load ═══════════════ */

    function getDesignData() {
        return {
            engineVersion: state.version,
            room: { ...state.room },
            stage: { ...state.stage },
            audience: { ...state.audience },
            target: { ...state.target },
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

        /* ✅ استبدل المصفوفة بالكامل، لا دمج */
        if (Array.isArray(data.speakers)) {
            state.speakers = data.speakers.map(o => ({ ...o }));
        }

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

    /* ═══════════════ Init ═══════════════ */

    function init(options = {}) {
        /* ─── ضبط الافتراضيات ─── */
        state.design.minSPL = state.target.spl - state.target.headroom;

        /* ─── مزامنة الأبعاد من app.html إن وُجدت ─── */
        try {
            const roomW = document.getElementById("roomWidth");
            const roomD = document.getElementById("roomDepth");
            const roomH = document.getElementById("roomHeight");

            if (roomW?.value) setRoom({
                width: roomW.value,
                depth: roomD?.value,
                height: roomH?.value
            });
        } catch { /* ignore */ }

        /* ─── استمع لتغيّر السماعات ─── */
        window.addEventListener("speakers:changed", () => {
            if (state.speakers.length > 0) {
                /* لا نعيد الحساب تلقائياً — فقط نُبلّغ */
                emit("engine:speakers-changed", {
                    count: state.speakers.length
                });
            }
        });

        emit("engine:ready", { version: state.version });
        return true;
    }

    /* ═══════════════ Public API ═══════════════ */

    const EngineAPI = {
        state,

        /* Init */
        init,
        initialize: async () => init(),   // ← اسم بديل لـ app.html

        /* Room */
        setRoom, getRoom, getRoomArea, getRoomVolume,

        /* Stage / Audience */
        setStage, setAudience, setTargets,

        /* Speaker DB */
        getSpeakerDatabase, getSpeakerById, recommendSpeaker,

        /* Coverage */
        getCoverageDimensions,
        estimateCoverageArea,
        calculateDistanceLoss,
        calculateSPL,
        isPointCovered,
        createCoverageGrid,
        calculatePointSPL,
        analyzeCoverage,

        /* Layouts */
        calculateDistributedLayout,
        calculateFrontMainLayout,

        /* Auto Design */
        autoDesign,

        /* Analysis */
        calculateOverlap,
        analyzeSpacing,
        calculateDelayForLayout,
        generateWarnings,
        buildEngineeringSummary,
        generateBOM,
        analyzeDesign,

        /* Save / Load */
        getDesignData,
        loadDesign,
        reset,

        /* Utility */
        readSpeakerSpecs
    };

    /* ═══════════════ Exposure ═══════════════ */
    AE.engine = EngineAPI;
    window.AcousticEngine = EngineAPI;

    /* ═══════════════ Auto-init ═══════════════ */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => init(), { once: true });
    } else {
        init();
    }

    console.log("[engine.js] v2.0.0 جاهز — يدعم بنية speaker.js الجديدة");

})();
