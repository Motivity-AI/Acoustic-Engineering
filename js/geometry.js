/* ============================================================
   Acoustic Engineering — js/geometry.js v2.0.0
   Geometry & Acoustic Math
   ✅ يقرأ بنية speaker.js (مسطّحة + متداخلة)
   ✅ يفحص زاوية التغطية (لا يلوّث نتائج السماعات البعيدة)
   ✅ يستخدم targetSPL متسقاً مع engine.js
   ✅ حد أقصى للنقاط (DoS safe)
   ✅ دوال مساعدة إضافية (intersection, polygon, vectors)
   ✅ توافق كامل مع الكود القديم
   ============================================================ */
(function (window) {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;
    const geometry = {};

    /* ═══════════════ Constants ═══════════════ */

    const EPSILON = 1e-9;
    const DEG = Math.PI / 180;
    const RAD = 180 / Math.PI;
    const MAX_GRID_POINTS = 10000;
    const SPEED_OF_SOUND = 343;

    geometry.EPSILON = EPSILON;
    geometry.DEG = DEG;
    geometry.RAD = RAD;
    geometry.MAX_GRID_POINTS = MAX_GRID_POINTS;

    /* ═══════════════ Basic Math ═══════════════ */

    geometry.clamp = (v, min, max) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return min;
        return Math.min(Math.max(n, min), max);
    };

    geometry.lerp = (a, b, t) => {
        const ta = Number(a) || 0;
        const tb = Number(b) || 0;
        const tt = geometry.clamp(t, 0, 1);
        return ta + (tb - ta) * tt;
    };

    geometry.round = (v, d = 2) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        const f = Math.pow(10, Math.max(0, Math.min(15, d)));
        return Math.round(n * f) / f;
    };

    geometry.degToRad = (d) => {
        const n = Number(d);
        return Number.isFinite(n) ? n * DEG : 0;
    };

    geometry.radToDeg = (r) => {
        const n = Number(r);
        return Number.isFinite(n) ? n * RAD : 0;
    };

    geometry.normalizeAngle = (a) => {
        let x = Number(a);
        if (!Number.isFinite(x)) return 0;
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

    /* ═══════════════ Point Operations ═══════════════ */

    geometry.point = (x, y, z) => ({
        x: Number.isFinite(Number(x)) ? Number(x) : 0,
        y: Number.isFinite(Number(y)) ? Number(y) : 0,
        z: Number.isFinite(Number(z)) ? Number(z) : 0
    });

    geometry.clonePoint = (p) => geometry.point(p?.x, p?.y, p?.z);

    geometry.distance2D = (a, b) => {
        if (!a || !b) return 0;
        const dx = (b.x || 0) - (a.x || 0);
        const dy = (b.y || 0) - (a.y || 0);
        return Math.sqrt(dx * dx + dy * dy);
    };

    geometry.distance3D = (a, b) => {
        if (!a || !b) return 0;
        const dx = (b.x || 0) - (a.x || 0);
        const dy = (b.y || 0) - (a.y || 0);
        const dz = (b.z || 0) - (a.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    geometry.distance = geometry.distance2D;

    /**
     * الاتجاه (بالدرجات) من نقطة إلى أخرى
     * ملاحظة: في SVG, y يزيد للأسفل — استخدم `bearingSVG` للرسم
     */
    geometry.bearing = (from, to) => {
        if (!from || !to) return 0;
        const dx = (to.x || 0) - (from.x || 0);
        const dy = (to.y || 0) - (from.y || 0);
        return geometry.normalizeAngle(Math.atan2(dy, dx) * RAD);
    };

    /**
     * الاتجاه في إحداثيات SVG (y مقلوب)
     */
    geometry.bearingSVG = (from, to) => {
        if (!from || !to) return 0;
        const dx = (to.x || 0) - (from.x || 0);
        const dy = -((to.y || 0) - (from.y || 0));
        return geometry.normalizeAngle(Math.atan2(dy, dx) * RAD);
    };

    geometry.directionVector = (angle, length = 1) => {
        const r = geometry.degToRad(angle);
        return {
            x: Math.cos(r) * length,
            y: Math.sin(r) * length,
            z: 0
        };
    };

    geometry.projectPoint = (origin, angle, dist) => {
        if (!origin) return { x: 0, y: 0, z: 0 };
        const v = geometry.directionVector(angle, dist);
        return {
            x: (origin.x || 0) + v.x,
            y: (origin.y || 0) + v.y,
            z: origin.z || 0
        };
    };

    /**
     * هل النقطة داخل مخروط التغطية لسماعة؟
     * @param {Object} speakerObj — { x, y, rotation }
     * @param {Object} specs — { horizontal, vertical } (بالدرجات)
     * @param {Object} point — { x, y, z? }
     * @param {number} tolerance — درجة تسامح (افتراضي 0)
     */
    geometry.isPointInCoverage = (speakerObj, specs, point, tolerance = 0) => {
        if (!speakerObj || !specs || !point) return false;

        const dx = (point.x || 0) - (speakerObj.x || 0);
        const dy = (point.y || 0) - (speakerObj.y || 0);
        const horizontalDist = Math.sqrt(dx * dx + dy * dy);

        // نقطة قريبة جداً → تُعتبر داخل
        if (horizontalDist < 0.05) return true;

        // ─── زاوية التغطية الأفقية ───
        const bearing = Math.atan2(dy, dx) * RAD;
        let rel = bearing - (speakerObj.rotation || 0);

        while (rel > 180) rel -= 360;
        while (rel < -180) rel += 360;

        const hLimit = (Number(specs.horizontal) || 90) / 2 + tolerance;
        if (Math.abs(rel) > hLimit) return false;

        // ─── زاوية التغطية العمودية (إن كانت بيانات z متوفرة) ───
        const sz = Number(speakerObj.z ?? speakerObj.mountingHeight ?? 3);
        const pz = Number(point.z ?? 1.2);
        const verticalDiff = pz - sz;

        if (Math.abs(verticalDiff) > 0.05 && horizontalDist > 0.05) {
            const elevation = Math.atan2(verticalDiff, horizontalDist) * RAD;
            const vLimit = (Number(specs.vertical) || 60) / 2 + tolerance;
            if (Math.abs(elevation) > vLimit) return false;
        }

        return true;
    };

    /* ═══════════════ Room ═══════════════ */

    geometry.roomArea = (w, d) =>
        Math.max(0, Number(w) || 0) * Math.max(0, Number(d) || 0);

    geometry.roomVolume = (w, d, h) =>
        geometry.roomArea(w, d) * Math.max(0, Number(h) || 0);

    geometry.roomPerimeter = (w, d) =>
        2 * (Math.max(0, Number(w) || 0) + Math.max(0, Number(d) || 0));

    geometry.roomDiagonal = (w, d, h) => {
        const W = Math.max(0, Number(w) || 0);
        const D = Math.max(0, Number(d) || 0);
        const H = Math.max(0, Number(h) || 0);
        return Math.sqrt(W * W + D * D + H * H);
    };

    geometry.createRoom = (w, d, h) => {
        const W = geometry.clamp(w, 0, 10000);
        const D = geometry.clamp(d, 0, 10000);
        const H = geometry.clamp(h, 0, 1000);

        return {
            width: W,
            depth: D,
            height: H,
            area: geometry.roomArea(W, D),
            volume: geometry.roomVolume(W, D, H),
            perimeter: geometry.roomPerimeter(W, D),
            diagonal: geometry.roomDiagonal(W, D, H)
        };
    };

    geometry.validateRoom = (room) => {
        const errors = [];
        if (!room) return { valid: false, errors: ["بيانات الغرفة غير موجودة"] };

        const check = (key, label, min = 0.1, max = 10000) => {
            const v = Number(room[key]);
            if (!Number.isFinite(v)) {
                errors.push(`${label} غير رقمي`);
            } else if (v <= 0) {
                errors.push(`${label} يجب أن يكون موجباً`);
            } else if (v > max) {
                errors.push(`${label} كبير جداً (الحد ${max})`);
            } else if (v < min) {
                errors.push(`${label} صغير جداً`);
            }
        };

        check("width", "العرض");
        check("depth", "العمق");
        check("height", "الارتفاع", 1, 100);

        return { valid: errors.length === 0, errors };
    };

    geometry.clampPointToRoom = (p, room, margin = 0) => {
        if (!p || !room) return { x: 0, y: 0, z: 0 };

        const w = Math.max(0, Number(room.width) || 0);
        const d = Math.max(0, Number(room.depth) || 0);
        const h = Math.max(0, Number(room.height) || Infinity);
        const m = Math.max(0, Number(margin) || 0);

        return {
            x: geometry.clamp(p.x, m, Math.max(m, w - m)),
            y: geometry.clamp(p.y, m, Math.max(m, d - m)),
            z: geometry.clamp(p.z, 0, h)
        };
    };

    /* ═══════════════ Snapping & Grid ═══════════════ */

    geometry.snapValue = (v, grid) => {
        const g = Math.max(EPSILON, Number(grid) || 1);
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        return Math.round(n / g) * g;
    };

    geometry.snapPoint = (p, grid) => {
        if (!p) return { x: 0, y: 0, z: 0 };
        return {
            x: geometry.snapValue(p.x, grid),
            y: geometry.snapValue(p.y, grid),
            z: Number(p.z) || 0
        };
    };

    /**
     * يولّد شبكة نقاط مع حد أقصى آمن
     */
    geometry.generateGrid = (room, options = {}) => {
        const w = Math.max(0, Number(room?.width) || 0);
        const d = Math.max(0, Number(room?.depth) || 0);
        const z = Number(options.z ?? options.listenerHeight ?? 1.2);

        let spacing = Math.max(0.1, Number(options.spacing || options.gridSpacing || 2));
        const margin = Math.max(0, Number(options.margin ?? 0));

        const usableW = Math.max(0, w - 2 * margin);
        const usableD = Math.max(0, d - 2 * margin);

        // ✅ اضبط الـ spacing لمنع الانفجار
        const estimated = ((usableW / spacing) + 1) * ((usableD / spacing) + 1);
        if (estimated > MAX_GRID_POINTS) {
            spacing = Math.sqrt((usableW * usableD) / MAX_GRID_POINTS);
            spacing = Math.max(spacing, 0.1);
        }

        const points = [];

        for (let y = margin; y <= d - margin + EPSILON; y += spacing) {
            for (let x = margin; x <= w - margin + EPSILON; x += spacing) {
                points.push({
                    x: geometry.round(Math.min(x, w - margin), 3),
                    y: geometry.round(Math.min(y, d - margin), 3),
                    z
                });
                if (points.length >= MAX_GRID_POINTS) return points;
            }
        }

        return points;
    };

    /* ═══════════════ Acoustic Math ═══════════════ */

    /**
     * SPL loss بفعل المسافة (قانون التربيع العكسي)
     * @param {number} distance
     * @param {number} ref — المسافة المرجعية (افتراضي 1m)
     */
    geometry.inverseSquareLoss = (distance, ref = 1) => {
        const d = Math.max(EPSILON, Number(distance) || 1);
        const r = Math.max(EPSILON, Number(ref) || 1);
        return 20 * Math.log10(d / r);
    };

    /**
     * SPL على مسافة معينة
     * @param {number} refSPL — SPL عند refDistance
     * @param {number} distance
     * @param {number} refDistance
     * @param {Object} options — { airAbsorption, boundaryGain }
     */
    geometry.splAtDistance = (refSPL, distance, refDistance = 1, options = {}) => {
        const ref = Number(refSPL);
        if (!Number.isFinite(ref)) return 0;

        const loss = geometry.inverseSquareLoss(distance, refDistance);
        let spl = ref - loss;

        const air = Number(options.airAbsorption);
        if (Number.isFinite(air)) {
            spl -= air * Math.max(0, Number(distance) || 0);
        }

        const gain = Number(options.boundaryGain);
        if (Number.isFinite(gain)) {
            spl += gain;
        }

        return spl;
    };

    /**
     * حساب SPL كامل باستخدام sensitivity + inputPower
     * SPL = sensitivity + 10*log10(power) - 20*log10(distance)
     * @param {number} sensitivity — dB/W/m
     * @param {number} inputPower — Watts
     * @param {number} distance — meters
     */
    geometry.splFromSensitivity = (sensitivity, inputPower, distance) => {
        const s = Number(sensitivity);
        const p = Number(inputPower);
        const d = Math.max(EPSILON, Number(distance) || 1);

        if (!Number.isFinite(s) || !Number.isFinite(p) || p <= 0) return 0;

        return s + 10 * Math.log10(p) - 20 * Math.log10(d);
    };

    /**
     * جمع عدة SPLs (energy summation)
     * @param {...number|Array<number>} values
     */
    geometry.addDecibels = function () {
        let values;

        if (arguments.length === 1 && Array.isArray(arguments[0])) {
            values = arguments[0];
        } else {
            values = Array.prototype.slice.call(arguments);
        }

        values = values
            .map(Number)
            .filter(v => Number.isFinite(v) && v > -Infinity);

        if (!values.length) return 0;

        const maxVal = Math.max.apply(null, values);

        // جميع القيم = -Infinity أو 0
        if (!Number.isFinite(maxVal)) return 0;

        let sum = 0;
        for (let i = 0; i < values.length; i++) {
            sum += Math.pow(10, (values[i] - maxVal) / 10);
        }

        return maxVal + 10 * Math.log10(sum);
    };

    /**
     * زاوية الارتفاع (vertical elevation) بين نقطتين
     */
    geometry.elevationAngle = (from, to) => {
        if (!from || !to) return 0;
        const h = geometry.distance2D(from, to);
        if (h < EPSILON) return 0;
        const v = (Number(to.z) || 0) - (Number(from.z) || 0);
        return Math.atan2(v, h) * RAD;
    };

    /* ═══════════════════════════════════════════════════════════
       🎯 Speaker Specifications Reader
       يقرأ بنية speaker.js (مسطّحة) أو القديمة (متداخلة)
       ═══════════════════════════════════════════════════════════ */

    geometry.readSpeakerSpecs = function (speaker) {
        if (!speaker || typeof speaker !== "object") {
            return {
                maxSPL: 0,
                rms: 0,
                sensitivity: 0,
                horizontal: 90,
                vertical: 60,
                manufacturer: "",
                model: ""
            };
        }

        const power = (speaker.power && typeof speaker.power === "object" && !Array.isArray(speaker.power))
            ? speaker.power : {};

        const cov = (speaker.coverage && typeof speaker.coverage === "object" && !Array.isArray(speaker.coverage))
            ? speaker.coverage : {};

        const num = (v, fb = 0) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
        };

        return {
            maxSPL: num(speaker.max_spl ?? speaker.maxSPL ?? speaker.spl, 0),
            rms: num(
                speaker.rms_power ?? speaker.rms
                ?? power.rms, 0
            ),
            sensitivity: num(speaker.sensitivity, 0),
            horizontal: num(
                speaker.horizontal_coverage ?? speaker.horizontal
                ?? speaker.horizontalCoverage
                ?? cov.horizontal,
                90
            ),
            vertical: num(
                speaker.vertical_coverage ?? speaker.vertical
                ?? speaker.verticalCoverage
                ?? cov.vertical,
                60
            ),
            manufacturer: speaker.manufacturer || "Generic",
            model: speaker.model || "Speaker"
        };
    };

    /* ═══════════════════════════════════════════════════════════
       Coverage Analysis — DEPRECATED (يُفضّل engine.analyzeCoverage)
       ═══════════════════════════════════════════════════════════ */

    geometry.analyzeCoverage = function (room, speakers, options = {}) {
        console.warn("[geometry] analyzeCoverage deprecated — استخدم engine.analyzeCoverage");

        speakers = Array.isArray(speakers) ? speakers : [];

        const points = Array.isArray(options.points)
            ? options.points
            : geometry.generateGrid(room, options);

        // ✅ استخدم targetSPL متسقاً مع engine.js
        const targetSPL = Number(options.targetSPL ?? 95);

        // ✅ يمكن تخصيص المرجع
        const referenceDistance = Number(options.referenceDistance ?? 1);

        const includeAngles = options.includeAngles !== false;   // افتراضياً: نعم

        const results = [];
        let covered = 0;
        let totalSPL = 0;
        let minM = Infinity;
        let maxM = -Infinity;

        for (const point of points) {
            const active = [];

            for (const spk of speakers) {
                if (!spk) continue;

                const specs = geometry.readSpeakerSpecs(spk);

                // ✅ فحص زاوية التغطية
                if (includeAngles && !geometry.isPointInCoverage(spk, specs, point)) {
                    continue;
                }

                const distance = geometry.distance3D(spk, point);
                if (distance <= EPSILON) continue;

                // ✅ استخدم sensitivity إن وُجد، وإلا maxSPL
                let level;
                if (specs.sensitivity > 0 && specs.rms > 0) {
                    const inputPower = Number(spk.power_input ?? specs.rms);
                    level = geometry.splFromSensitivity(
                        specs.sensitivity,
                        inputPower,
                        distance
                    );
                } else {
                    level = geometry.splAtDistance(
                        specs.maxSPL,
                        distance,
                        referenceDistance
                    );
                }

                active.push({ spl: level });
            }

            const combined = active.length
                ? geometry.addDecibels(active.map(a => a.spl))
                : 0;

            // ✅ استخدم targetSPL (متسق مع engine)
            const cov = active.length > 0 && combined >= targetSPL;

            if (cov) covered++;

            if (active.length) {
                totalSPL += combined;
                minM = Math.min(minM, combined);
                maxM = Math.max(maxM, combined);
            }

            results.push({
                x: point.x,
                y: point.y,
                z: point.z || 0,
                covered: cov,
                spl: combined,
                speakerCount: active.length
            });
        }

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
            targetSPL
        };
    };

    /* ═══════════════ Additional Geometry Utilities ═══════════════ */

    /**
     * تقاطع خطين (2D)
     * @returns {Object|null} نقطة التقاطع أو null
     */
    geometry.lineIntersection = (a1, a2, b1, b2) => {
        if (!a1 || !a2 || !b1 || !b2) return null;

        const d1x = a2.x - a1.x;
        const d1y = a2.y - a1.y;
        const d2x = b2.x - b1.x;
        const d2y = b2.y - b1.y;

        const denom = d1x * d2y - d1y * d2x;

        if (Math.abs(denom) < EPSILON) return null;   // متوازيان

        const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
        const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;

        if (t < 0 || t > 1 || u < 0 || u > 1) return null;

        return {
            x: a1.x + t * d1x,
            y: a1.y + t * d1y,
            t,
            u
        };
    };

    /**
     * مساحة مضلع (shoelace)
     */
    geometry.polygonArea = (points) => {
        if (!Array.isArray(points) || points.length < 3) return 0;

        let area = 0;
        const n = points.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += (points[i].x || 0) * (points[j].y || 0);
            area -= (points[j].x || 0) * (points[i].y || 0);
        }

        return Math.abs(area) / 2;
    };

    /**
     * هل النقطة داخل مضلع؟ (ray casting)
     */
    geometry.isPointInPolygon = (point, polygon) => {
        if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;

        let inside = false;
        const n = polygon.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi + EPSILON) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
    };

    /**
     * إزاحة نقطة بمقدار (dx, dy)
     */
    geometry.translatePoint = (p, dx, dy, dz) => ({
        x: (p?.x || 0) + (Number(dx) || 0),
        y: (p?.y || 0) + (Number(dy) || 0),
        z: (p?.z || 0) + (Number(dz) || 0)
    });

    /**
     * تدوير نقطة حول مركز
     */
    geometry.rotatePoint = (p, center, angleDeg) => {
        const r = geometry.degToRad(angleDeg);
        const cos = Math.cos(r);
        const sin = Math.sin(r);

        const dx = (p?.x || 0) - (center?.x || 0);
        const dy = (p?.y || 0) - (center?.y || 0);

        return {
            x: (center?.x || 0) + dx * cos - dy * sin,
            y: (center?.y || 0) + dx * sin + dy * cos,
            z: p?.z || 0
        };
    };

    /**
     * تأخير الصوت (delay) لتعويض المسافة
     * @param {number} distance — بالأمتار
     * @returns {number} delay بالمللي ثانية
     */
    geometry.distanceToDelay = (distance) => {
        const d = Math.max(0, Number(distance) || 0);
        return (d / SPEED_OF_SOUND) * 1000;
    };

    /* ═══════════════ Exposure ═══════════════ */

    AE.geometry = geometry;
    window.AcousticGeometry = geometry;
    window.Geometry = geometry;

    /* ─── Aliases للتوافق الخلفي ─── */
    geometry.getDistance = geometry.distance2D;
    geometry.getDistance3D = geometry.distance3D;
    geometry.getBearing = geometry.bearing;
    geometry.calculateSPL = geometry.splAtDistance;
    geometry.calculateCoverage = geometry.analyzeCoverage;
    geometry.calculateDelay = geometry.distanceToDelay;

    /* ─── Event ─── */
    try {
        window.dispatchEvent(new CustomEvent("acoustic:geometry-ready", {
            detail: { version: "2.0.0" }
        }));
    } catch { /* ignore */ }

    console.log("[geometry.js] v2.0.0 جاهز");

})(window);
