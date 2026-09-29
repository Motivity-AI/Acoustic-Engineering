/* ============================================================
   Acoustic Engineering — js/geometry.js
   Geometry & Acoustic Math
   ============================================================ */
(function (window) {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;
    const geometry = {};
    const EPSILON = 1e-9;
    const DEG = Math.PI / 180;
    const RAD = 180 / Math.PI;

    geometry.EPSILON = EPSILON;
    geometry.DEG = DEG;
    geometry.RAD = RAD;

    geometry.clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    geometry.lerp = (a, b, t) => a + (b - a) * t;
    geometry.round = (v, d = 2) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };
    geometry.degToRad = (d) => d * DEG;
    geometry.radToDeg = (r) => r * RAD;

    geometry.normalizeAngle = (a) => {
        let x = Number(a) || 0;
        x %= 360;
        if (x < 0) x += 360;
        return x;
    };

    geometry.angleDifference = (a, b) => {
        let d = geometry.normalizeAngle(a) - geometry.normalizeAngle(b);
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        return d;
    };

    geometry.point = (x, y, z) => ({ x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 });
    geometry.clonePoint = (p) => geometry.point(p?.x, p?.y, p?.z);
    geometry.distance2D = (a, b) => Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    geometry.distance3D = (a, b) => Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2) + Math.pow((b.z || 0) - (a.z || 0), 2));
    geometry.distance = geometry.distance2D;
    geometry.bearing = (from, to) => geometry.normalizeAngle(Math.atan2(to.y - from.y, to.x - from.x) * RAD);

    geometry.directionVector = (angle, length = 1) => {
        const r = geometry.degToRad(angle);
        return { x: Math.cos(r) * length, y: Math.sin(r) * length, z: 0 };
    };

    geometry.projectPoint = (origin, angle, distance) => {
        const v = geometry.directionVector(angle, distance);
        return { x: origin.x + v.x, y: origin.y + v.y, z: origin.z || 0 };
    };

    geometry.roomArea = (w, d) => Math.max(0, Number(w) || 0) * Math.max(0, Number(d) || 0);
    geometry.roomVolume = (w, d, h) => geometry.roomArea(w, d) * Math.max(0, Number(h) || 0);
    geometry.roomPerimeter = (w, d) => 2 * (Math.max(0, Number(w) || 0) + Math.max(0, Number(d) || 0));
    geometry.roomDiagonal = (w, d) => Math.sqrt(w * w + d * d);

    geometry.createRoom = (w, d, h) => {
        w = Math.max(0, Number(w) || 0);
        d = Math.max(0, Number(d) || 0);
        h = Math.max(0, Number(h) || 0);
        return {
            width: w, depth: d, height: h,
            area: geometry.roomArea(w, d),
            volume: geometry.roomVolume(w, d, h),
            perimeter: geometry.roomPerimeter(w, d),
            diagonal: geometry.roomDiagonal(w, d)
        };
    };

    geometry.inverseSquareLoss = (distance, ref = 1) => {
        distance = Math.max(EPSILON, Number(distance) || 0);
        ref = Math.max(EPSILON, Number(ref) || 1);
        return 20 * Math.log10(distance / ref);
    };

    geometry.splAtDistance = (refSPL, distance, refDistance, options = {}) => {
        const loss = geometry.inverseSquareLoss(distance, refDistance);
        let spl = Number(refSPL) - loss;
        if (Number.isFinite(options.airAbsorption)) spl -= Number(options.airAbsorption) * Math.max(0, distance);
        if (Number.isFinite(options.boundaryGain)) spl += Number(options.boundaryGain);
        return spl;
    };

    geometry.addDecibels = function () {
        let values = arguments.length === 1 && Array.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
        values = values.map(Number).filter(Number.isFinite);
        if (!values.length) return 0;
        const max = Math.max.apply(null, values);
        let sum = 0;
        values.forEach(v => sum += Math.pow(10, (v - max) / 10));
        return max + 10 * Math.log10(sum);
    };

    geometry.elevationAngle = (from, to) => {
        const h = geometry.distance2D(from, to);
        const v = (to.z || 0) - (from.z || 0);
        return Math.atan2(v, h) * RAD;
    };

    geometry.snapValue = (v, grid) => {
        grid = Math.max(EPSILON, Number(grid) || 1);
        return Math.round(v / grid) * grid;
    };

    geometry.clampPointToRoom = (p, room, margin = 0) => ({
        x: geometry.clamp(p.x, margin, Math.max(margin, room.width - margin)),
        y: geometry.clamp(p.y, margin, Math.max(margin, room.depth - margin)),
        z: geometry.clamp(p.z || 0, 0, Number(room.height) || Infinity)
    });

    geometry.generateGrid = (room, options = {}) => {
        const w = Math.max(0, Number(room.width) || 0);
        const d = Math.max(0, Number(room.depth) || 0);
        const spacing = Math.max(0.1, Number(options.spacing || options.gridSpacing || 2));
        const points = [];
        for (let y = 0; y <= d + EPSILON; y += spacing) {
            for (let x = 0; x <= w + EPSILON; x += spacing) {
                points.push({ x: Math.min(x, w), y: Math.min(y, d), z: Number(options.z ?? 1.2) });
            }
        }
        return points;
    };

    geometry.analyzeCoverage = (room, speakers, options = {}) => {
        speakers = Array.isArray(speakers) ? speakers : [];
        const points = Array.isArray(options.points) ? options.points : geometry.generateGrid(room, options);
        const targetSPL = Number(options.targetSPL ?? 85);
        const minimumSPL = Number(options.minimumSPL ?? targetSPL - 6);
        const results = [];
        let covered = 0, totalSPL = 0, minM = Infinity, maxM = -Infinity;

        points.forEach(point => {
            const active = [];
            speakers.forEach(spk => {
                const distance = geometry.distance3D(spk, point);
                if (distance <= EPSILON) return;
                const refSPL = Number(spk.maxSPL || spk.spl || 0);
                const refD = Number(spk.referenceDistance ?? 1);
                const level = geometry.splAtDistance(refSPL, distance, refD);
                active.push({ spl: level });
            });
            const combined = active.length ? geometry.addDecibels(active.map(a => a.spl)) : 0;
            const cov = active.length > 0 && combined >= minimumSPL;
            if (cov) covered++;
            if (active.length) {
                totalSPL += combined;
                minM = Math.min(minM, combined);
                maxM = Math.max(maxM, combined);
            }
            results.push({ x: point.x, y: point.y, z: point.z || 0, covered: cov, spl: combined });
        });

        const tp = points.length;
        return {
            points: results,
            totalPoints: tp,
            coveredPoints: covered,
            coveragePercent: tp ? (covered / tp) * 100 : 0,
            averageSPL: tp ? totalSPL / tp : 0,
            minimumSPL: minM === Infinity ? 0 : minM,
            maximumSPL: maxM === -Infinity ? 0 : maxM,
            uniformity: (maxM === -Infinity ? 0 : maxM) - (minM === Infinity ? 0 : minM),
            targetSPL,
            minimumRequiredSPL: minimumSPL
        };
    };

    geometry.validateRoom = (room) => {
        const errors = [];
        if (!room) return { valid: false, errors: ["بيانات الغرفة غير موجودة"] };
        if (!Number.isFinite(Number(room.width)) || room.width <= 0) errors.push("عرض غير صالح");
        if (!Number.isFinite(Number(room.depth)) || room.depth <= 0) errors.push("عمق غير صالح");
        if (!Number.isFinite(Number(room.height)) || room.height <= 0) errors.push("ارتفاع غير صالح");
        return { valid: errors.length === 0, errors };
    };

    AE.geometry = geometry;
    window.AcousticGeometry = geometry;
    window.Geometry = geometry;

    geometry.distance2D = geometry.distance2D;
    geometry.distance3D = geometry.distance3D;
    geometry.getDistance = geometry.distance2D;
    geometry.getBearing = geometry.bearing;
    geometry.calculateSPL = geometry.splAtDistance;
    geometry.calculateCoverage = geometry.analyzeCoverage;

    try {
        window.dispatchEvent(new CustomEvent("acoustic:geometry-ready", { detail: geometry }));
    } catch {}
})(window);
