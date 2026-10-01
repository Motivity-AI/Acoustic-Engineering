/* ============================================================
   Acoustic Engineering — js/speaker.js v2.0.0
   Speaker Database — دعم كامل لبنية مسطّحة ومتداخلة
   + جميع الدوال المطلوبة من app.html
   + مزامنة مع Backend + Local Storage
   ============================================================ */
(function () {
    "use strict";

    /* ═══════════════ Namespace ═══════════════ */
    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════ Resolution helpers ═══════════════ */
    function getBackend() {
        return AE.backend || window.AcousticBackend || null;
    }

    /* ═══════════════ Constants ═══════════════ */

    const CATEGORIES = Object.freeze([
        "Point Source", "Column", "Ceiling",
        "Line Array", "Subwoofer", "Monitor", "Horn"
    ]);

    const MOUNTS = Object.freeze([
        "Stand", "Wall", "Ceiling", "Fly",
        "Ground", "Tripod", "Pole", "Truss"
    ]);

    const DEFAULT_CATEGORY = "Point Source";
    const DEFAULT_MOUNT = "Stand";

    /* ═══════════════ القيم الافتراضية ═══════════════ */
    const DEFAULTS = Object.freeze({
        manufacturer: "Generic",
        model: "New Speaker",
        category: DEFAULT_CATEGORY,
        rms_power: 500,
        peak_power: 1000,
        max_spl: 125,
        sensitivity: 96,
        frequency_min: 55,
        frequency_max: 18000,
        horizontal_coverage: 90,
        vertical_coverage: 60,
        impedance: 8,
        weight: 15,
        mounting_type: DEFAULT_MOUNT
    });

    /* ═══════════════ Presets ═══════════════ */
    const PRESETS = Object.freeze({
        "generic-fullrange": {
            manufacturer: "Generic",
            model: "Full Range 12",
            category: "Point Source",
            rms_power: 500,
            peak_power: 1000,
            max_spl: 128,
            sensitivity: 96,
            frequency_min: 50,
            frequency_max: 18000,
            horizontal_coverage: 90,
            vertical_coverage: 60,
            impedance: 8,
            weight: 20,
            mounting_type: "Stand"
        },
        "ceiling": {
            manufacturer: "Generic",
            model: "Ceiling 6",
            category: "Ceiling",
            rms_power: 6,
            peak_power: 24,
            max_spl: 105,
            sensitivity: 88,
            frequency_min: 90,
            frequency_max: 18000,
            horizontal_coverage: 100,
            vertical_coverage: 100,
            impedance: 8,
            weight: 1.5,
            mounting_type: "Ceiling"
        },
        "column": {
            manufacturer: "Generic",
            model: "Column Array",
            category: "Column",
            rms_power: 120,
            peak_power: 480,
            max_spl: 115,
            sensitivity: 94,
            frequency_min: 90,
            frequency_max: 18000,
            horizontal_coverage: 100,
            vertical_coverage: 30,
            impedance: 8,
            weight: 6,
            mounting_type: "Wall"
        },
        "subwoofer": {
            manufacturer: "Generic",
            model: "Subwoofer 18",
            category: "Subwoofer",
            rms_power: 1000,
            peak_power: 4000,
            max_spl: 135,
            sensitivity: 99,
            frequency_min: 30,
            frequency_max: 120,
            horizontal_coverage: 180,
            vertical_coverage: 180,
            impedance: 8,
            weight: 50,
            mounting_type: "Ground"
        },
        "linearray": {
            manufacturer: "Generic",
            model: "Line Array Element",
            category: "Line Array",
            rms_power: 700,
            peak_power: 2800,
            max_spl: 135,
            sensitivity: 100,
            frequency_min: 55,
            frequency_max: 20000,
            horizontal_coverage: 90,
            vertical_coverage: 10,
            impedance: 8,
            weight: 18,
            mounting_type: "Fly"
        }
    });

    /* ═══════════════ الحالة الداخلية ═══════════════ */
    const state = {
        speakers: [],       // بنية مسطّحة دائماً
        version: "2.0.0",
        loaded: false,
        source: "local"     // local | backend | firebase
    };

    let _nextId = 1;
    let _syncing = false;

    /* ═══════════════ Helpers أساسية ═══════════════ */

    function num(v, fb = 0, min = -Infinity, max = Infinity) {
        const n = Number(v);
        if (!Number.isFinite(n)) return fb;
        return Math.min(max, Math.max(min, n));
    }

    function str(v, fb = "", maxLength = 200) {
        if (v === undefined || v === null) return fb;
        return String(v).trim().slice(0, maxLength);
    }

    function clone(o) {
        try {
            if (typeof structuredClone === "function") return structuredClone(o);
        } catch { /* ignore */ }
        return JSON.parse(JSON.stringify(o));
    }

    function pickFromArray(value, allowed, fallback) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (allowed.includes(item)) return item;
            }
            return fallback;
        }
        return allowed.includes(value) ? value : fallback;
    }

    /* ═══════════════ توليد ID آمن ═══════════════ */

    function generateId(prefix = "spk") {
        try {
            if (typeof crypto !== "undefined") {
                if (typeof crypto.randomUUID === "function") {
                    return `${prefix}_${crypto.randomUUID()}`;
                }
                if (crypto.getRandomValues) {
                    const bytes = new Uint8Array(8);
                    crypto.getRandomValues(bytes);
                    const hex = Array.from(bytes)
                        .map(b => b.toString(16).padStart(2, "0"))
                        .join("");
                    return `${prefix}_${hex}`;
                }
            }
        } catch { /* ignore */ }

        return `${prefix}_${Date.now().toString(36)}_${_nextId++}`;
    }

    /* ═══════════════════════════════════════════════════════════
       Normalize — يقبل بنية مسطّحة أو متداخلة
       ═══════════════════════════════════════════════════════════ */
    function normalize(input = {}) {
        if (!input || typeof input !== "object" || Array.isArray(input)) {
            input = {};
        }

        /* ─── استخرج من مصدرين محتملين ─── */
        const power = (input.power && typeof input.power === "object" && !Array.isArray(input.power))
            ? input.power
            : {};

        const frequency = (input.frequency && typeof input.frequency === "object" && !Array.isArray(input.frequency))
            ? input.frequency
            : {};

        const coverage = (input.coverage && typeof input.coverage === "object" && !Array.isArray(input.coverage))
            ? input.coverage
            : {};

        /* ─── الحقول المسطّحة (الأولوية) أو المتداخلة ─── */
        const rmsPower = num(
            input.rms_power ?? power.rms,
            DEFAULTS.rms_power,
            0, 50000
        );

        const peakPower = num(
            input.peak_power ?? power.peak ?? power.program,
            DEFAULTS.peak_power,
            0, 100000
        );

        const maxSpl = num(
            input.max_spl ?? input.maxSPL,
            DEFAULTS.max_spl,
            0, 200
        );

        const freqMin = num(
            input.frequency_min ?? frequency.low,
            DEFAULTS.frequency_min,
            0, 20000
        );

        const freqMax = num(
            input.frequency_max ?? frequency.high,
            DEFAULTS.frequency_max,
            0, 40000
        );

        const horizontal = num(
            input.horizontal_coverage ?? coverage.horizontal,
            DEFAULTS.horizontal_coverage,
            0.1, 360
        );

        const vertical = num(
            input.vertical_coverage ?? coverage.vertical,
            DEFAULTS.vertical_coverage,
            0.1, 360
        );

        /* ─── mounting: نص أو مصفوفة ─── */
        const mounting = pickFromArray(
            input.mounting_type ?? input.mounting,
            MOUNTS,
            DEFAULT_MOUNT
        );

        /* ─── منع peak < rms ─── */
        const safePeak = peakPower > 0 && rmsPower > 0 && peakPower < rmsPower
            ? rmsPower * 2
            : peakPower;

        /* ─── منع freq_max < freq_min ─── */
        let safeMin = freqMin;
        let safeMax = freqMax;
        if (safeMin > 0 && safeMax > 0 && safeMax < safeMin) {
            [safeMin, safeMax] = [safeMax, safeMin];
        }

        /* ─── id ─── */
        const id = str(input.id, "") || generateId("spk");

        return {
            id,
            manufacturer:         str(input.manufacturer, DEFAULTS.manufacturer, 100),
            model:                str(input.model, DEFAULTS.model, 100),
            category:             pickFromArray(input.category, CATEGORIES, DEFAULT_CATEGORY),
            rms_power:            rmsPower,
            peak_power:           safePeak,
            max_spl:              maxSpl,
            sensitivity:          num(input.sensitivity, DEFAULTS.sensitivity, 0, 150),
            frequency_min:        safeMin,
            frequency_max:        safeMax,
            horizontal_coverage:  horizontal,
            vertical_coverage:    vertical,
            impedance:            num(input.impedance, DEFAULTS.impedance, 0.1, 100),
            weight:               num(input.weight, DEFAULTS.weight, 0, 500),
            mounting_type:        mounting,
            description:          str(input.description, "", 500),
            notes:                str(input.notes, "", 1000),
            datasheetUrl:         str(input.datasheetUrl, "", 500),
            source:               str(input.source, "local", 20),
            createdAt:            str(input.createdAt, new Date().toISOString(), 40),
            updatedAt:            str(input.updatedAt, new Date().toISOString(), 40)
        };
    }

    /* ═══════════════ تحويل إلى بنية متداخلة (للعرض) ═══════════════ */
    function toNested(spec) {
        if (!spec) return null;
        const s = normalize(spec);

        return {
            id: s.id,
            manufacturer: s.manufacturer,
            model: s.model,
            category: s.category,
            power: {
                rms: s.rms_power,
                peak: s.peak_power,
                program: s.rms_power * 2
            },
            sensitivity: s.sensitivity,
            maxSPL: s.max_spl,
            impedance: s.impedance,
            frequency: {
                low: s.frequency_min,
                high: s.frequency_max
            },
            coverage: {
                horizontal: s.horizontal_coverage,
                vertical: s.vertical_coverage
            },
            weight: s.weight,
            mounting: [s.mounting_type.toLowerCase()],
            mounting_type: s.mounting_type,
            description: s.description,
            notes: s.notes,
            source: s.source,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
        };
    }

    /* ═══════════════════════════════════════════════════════════
       Validation — يُعيد مصفوفة أخطاء (فارغة إذا سليم)
       ═══════════════════════════════════════════════════════════ */
    function validate(input) {
        const errors = [];

        if (!input || typeof input !== "object") {
            return ["بيانات غير صالحة"];
        }

        /* ─── الهوية ─── */
        const manufacturer = str(input.manufacturer ?? input.manufacturer, "");
        const model = str(input.model, "");

        if (manufacturer.length < 2) {
            errors.push("الشركة المصنّعة مطلوبة (حرفان على الأقل)");
        }
        if (manufacturer.length > 100) {
            errors.push("اسم الشركة طويل جداً (100 حرف كحد أقصى)");
        }
        if (model.length < 1) {
            errors.push("موديل السماعة مطلوب");
        }
        if (model.length > 100) {
            errors.push("اسم الموديل طويل جداً (100 حرف كحد أقصى)");
        }

        /* ─── الفئة ─── */
        if (input.category && !CATEGORIES.includes(input.category)) {
            errors.push("فئة السماعة غير معروفة");
        }

        /* ─── القدرة ─── */
        const rms = Number(input.rms_power ?? input.power?.rms);
        const peak = Number(input.peak_power ?? input.power?.peak);

        if (Number.isFinite(rms)) {
            if (rms < 0) errors.push("القدرة RMS لا يمكن أن تكون سالبة");
            if (rms > 50000) errors.push("القدرة RMS كبيرة جداً (50000 W كحد أقصى)");
        }

        if (Number.isFinite(peak)) {
            if (peak < 0) errors.push("القدرة القصوى لا يمكن أن تكون سالبة");
            if (peak > 100000) errors.push("القدرة القصوى كبيرة جداً");
            if (Number.isFinite(rms) && rms > 0 && peak > 0 && peak < rms) {
                errors.push("القدرة القصوى يجب أن تكون ≥ RMS");
            }
        }

        /* ─── الصوتيات ─── */
        const spl = Number(input.max_spl ?? input.maxSPL);
        const sens = Number(input.sensitivity);

        if (Number.isFinite(spl)) {
            if (spl < 0 || spl > 200) errors.push("Max SPL يجب أن يكون بين 0 و 200 dB");
        }
        if (Number.isFinite(sens)) {
            if (sens < 0 || sens > 150) errors.push("الحساسية يجب أن تكون بين 0 و 150 dB");
        }

        /* ─── الترددات ─── */
        const fmin = Number(input.frequency_min ?? input.frequency?.low);
        const fmax = Number(input.frequency_max ?? input.frequency?.high);

        if (Number.isFinite(fmin) && Number.isFinite(fmax)) {
            if (fmin > 0 && fmax > 0 && fmax < fmin) {
                errors.push("التردد الأعلى يجب أن يكون أكبر من الأدنى");
            }
            if (fmax > 40000) errors.push("التردد الأعلى > 40 kHz غير منطقي");
        }

        /* ─── التغطية ─── */
        const h = Number(input.horizontal_coverage ?? input.coverage?.horizontal);
        const v = Number(input.vertical_coverage ?? input.coverage?.vertical);

        if (Number.isFinite(h)) {
            if (h <= 0 || h > 360) errors.push("التغطية الأفقية يجب أن تكون بين 0.1° و 360°");
        }
        if (Number.isFinite(v)) {
            if (v <= 0 || v > 360) errors.push("التغطية العمودية يجب أن تكون بين 0.1° و 360°");
        }

        /* ─── الكهربائي ─── */
        const imp = Number(input.impedance);
        if (Number.isFinite(imp)) {
            if (imp <= 0 || imp > 100) errors.push("المعاوقة يجب أن تكون بين 0.1 و 100 Ω");
        }

        /* ─── الفيزيائي ─── */
        const w = Number(input.weight);
        if (Number.isFinite(w)) {
            if (w < 0 || w > 500) errors.push("الوزن يجب أن يكون بين 0 و 500 kg");
        }

        /* ─── التثبيت ─── */
        const mount = input.mounting_type ?? input.mounting;
        if (mount !== undefined) {
            const normalizedMount = pickFromArray(mount, MOUNTS, null);
            if (normalizedMount === null) errors.push("نوع التثبيت غير معروف");
        }

        return errors;
    }

    /* ═══════════════ الحسابات الهندسية ═══════════════ */

    function calculateSPLAtDistance(input, distanceMeters, inputPower = null) {
        const spec = normalize(input);
        const d = Math.max(num(distanceMeters, 1, 0.1, 10000), 0.1);

        let spl = spec.max_spl;

        /* ─── تعديل حسب القدرة المُدخلة ─── */
        if (inputPower !== null && spec.rms_power > 0) {
            const power = Math.max(num(inputPower, spec.rms_power), 0.0001);
            const ratio = power / spec.rms_power;
            spl += 10 * Math.log10(ratio);
        }

        /* ─── قانون التربيع العكسي ─── */
        spl -= 20 * Math.log10(d);

        return Math.round(spl * 10) / 10;
    }

    function calculateCoverageRadius(input, mountingHeight, listenerHeight = 1.2) {
        const spec = normalize(input);
        const h = Math.max(num(mountingHeight, 3) - num(listenerHeight, 1.2), 0.5);

        /* ─── نصف زاوية التغطية العمودية ─── */
        const halfAngleRad = (spec.vertical_coverage / 2) * (Math.PI / 180);
        const radius = h * Math.tan(halfAngleRad);

        return Math.round(radius * 100) / 100;
    }

    function calculateCoverageArea(input, mountingHeight, listenerHeight = 1.2) {
        const radius = calculateCoverageRadius(input, mountingHeight, listenerHeight);
        if (!Number.isFinite(radius) || radius <= 0) return 0;

        /* ─── مخروط دائري: π × r² ─── */
        return Math.round(Math.PI * radius * radius * 100) / 100;
    }

    function calculateCrestFactor(input) {
        const spec = normalize(input);
        if (!spec.rms_power || !spec.peak_power || spec.rms_power <= 0) {
            return null;
        }

        const ratio = spec.peak_power / spec.rms_power;
        const db = 20 * Math.log10(ratio);

        return {
            ratio: Math.round(ratio * 100) / 100,
            db: Math.round(db * 10) / 10
        };
    }

    function calculateBandwidth(input) {
        const spec = normalize(input);
        if (!spec.frequency_min || !spec.frequency_max) return null;
        if (spec.frequency_min <= 0 || spec.frequency_max <= spec.frequency_min) return null;

        const octaves = Math.log2(spec.frequency_max / spec.frequency_min);
        return Math.round(octaves * 100) / 100;
    }

    /* ═══════════════════════════════════════════════════════════
       Formatting — كائن منظّم للعرض (مستخدم من report.html)
       ═══════════════════════════════════════════════════════════ */
    function formatSpecs(input) {
        if (!input) return null;
        const s = normalize(input);

        const rangeText = s.frequency_min && s.frequency_max
            ? `${s.frequency_min} – ${s.frequency_max} Hz`
            : null;

        return {
            identity: {
                manufacturer: s.manufacturer,
                model: s.model,
                category: s.category,
                display_name: `${s.manufacturer} ${s.model}`
            },
            power: {
                rms_watts: s.rms_power,
                peak_watts: s.peak_power,
                rms_text: s.rms_power ? `${s.rms_power} W RMS` : "—",
                peak_text: s.peak_power ? `${s.peak_power} W peak` : "—",
                crest_factor: calculateCrestFactor(s)
            },
            acoustics: {
                max_spl_db: s.max_spl,
                sensitivity_db: s.sensitivity,
                max_spl_text: s.max_spl ? `${s.max_spl} dB SPL` : "—",
                sensitivity_text: s.sensitivity ? `${s.sensitivity} dB (1W/1m)` : "—"
            },
            frequency: {
                min_hz: s.frequency_min,
                max_hz: s.frequency_max,
                range_text: rangeText || "—",
                bandwidth_octaves: calculateBandwidth(s)
            },
            coverage: {
                horizontal_deg: s.horizontal_coverage,
                vertical_deg: s.vertical_coverage,
                pattern_text: `${s.horizontal_coverage}° × ${s.vertical_coverage}°`
            },
            electrical: {
                impedance_ohms: s.impedance,
                impedance_text: s.impedance ? `${s.impedance} Ω` : "—"
            },
            physical: {
                weight_kg: s.weight,
                weight_text: s.weight ? `${s.weight} kg` : "—",
                mounting: s.mounting_type
            }
        };
    }

    /* ═══════════════ Render — Escape helper ═══════════════ */
    function escapeHtml(str) {
        return String(str ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[c]));
    }

    /* ═══════════════ Render — HTML لبطاقة المواصفات ═══════════════ */
    function renderSpecsHTML(input) {
        const f = formatSpecs(input);
        if (!f) return "";

        const row = (label, value) => `
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);">
                <span style="color:#6b7280;font-size:10px;">${escapeHtml(label)}</span>
                <span style="color:#d1d5db;font-size:10px;font-weight:700;direction:ltr;">${escapeHtml(value)}</span>
            </div>
        `;

        return `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">القدرة</div>
                    ${row("RMS", f.power.rms_text)}
                    ${row("Peak", f.power.peak_text)}
                    ${f.power.crest_factor
                        ? row("Crest", `${f.power.crest_factor.ratio}:1 (${f.power.crest_factor.db} dB)`)
                        : ""}
                </div>
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">الصوتيات</div>
                    ${row("Max SPL", f.acoustics.max_spl_text)}
                    ${row("الحساسية", f.acoustics.sensitivity_text)}
                </div>
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">التردد</div>
                    ${row("النطاق", f.frequency.range_text)}
                    ${f.frequency.bandwidth_octaves
                        ? row("Bandwidth", `${f.frequency.bandwidth_octaves} oct`)
                        : ""}
                </div>
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">التغطية</div>
                    ${row("النمط", f.coverage.pattern_text)}
                </div>
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">الكهربائي</div>
                    ${row("المعاوقة", f.electrical.impedance_text)}
                </div>
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">الفيزيائي</div>
                    ${row("الوزن", f.physical.weight_text)}
                    ${row("التثبيت", f.physical.mounting)}
                </div>
            </div>
        `;
    }

    /* ═══════════════ Render — بطاقة مختصرة للمكتبة ═══════════════ */
    function renderCardHTML(input) {
        const f = formatSpecs(input);
        if (!f) return "";

        return `
            <div class="speaker-card" data-speaker-preset="custom" style="cursor:pointer;">
                <div class="speaker-card-icon">
                    <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
                </div>
                <div class="speaker-card-copy">
                    <strong>${escapeHtml(f.identity.display_name)}</strong>
                    <span>${f.power.rms_watts}W · ${f.acoustics.max_spl_db}dB · ${f.coverage.pattern_text}</span>
                </div>
            </div>
        `;
    }

    /* ═══════════════ Render — صف جدول BOM ═══════════════ */
    function renderTableRow(input, index) {
        const f = formatSpecs(input);
        if (!f) return "";

        return `
            <tr>
                <td>${index}</td>
                <td>${escapeHtml(f.identity.manufacturer)}</td>
                <td>${escapeHtml(f.identity.model)}</td>
                <td>${escapeHtml(f.identity.category)}</td>
                <td>${f.power.rms_watts}</td>
                <td>${f.acoustics.max_spl_db}</td>
            </tr>
        `;
    }

    /* ═══════════════ Events ═══════════════ */

    function dispatch(name, detail) {
        try {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        } catch (err) {
            console.warn("[Speaker] dispatch failed:", name, err);
        }
    }

    function notifyChange() {
        dispatch("speakers:changed", { speakers: state.speakers.slice() });
        dispatch("speaker:changed", { count: state.speakers.length });
        try { saveToLocal(); } catch { /* ignore */ }
    }

    /* ═══════════════ CRUD ═══════════════ */

    function create(input) {
        const normalized = normalize(input);
        const errors = validate(normalized);
        if (errors.length) {
            throw new Error(errors.join(" • "));
        }
        return normalized;
    }

    function add(input) {
        const spec = create(input);

        /* ─── امنع التكرار (نفس manufacturer+model) ─── */
        const duplicate = state.speakers.find(s =>
            s.manufacturer === spec.manufacturer && s.model === spec.model
        );

        if (duplicate) {
            throw new Error(`توجد سماعة بنفس الشركة والموديل: ${spec.manufacturer} ${spec.model}`);
        }

        state.speakers.push(spec);
        notifyChange();

        /* ─── حاول الإرسال للسيرفر (fire-and-forget) ─── */
        persistToBackend(spec).catch(err => {
            console.warn("[Speaker] persist failed:", err);
        });

        return clone(spec);
    }

    function update(id, changes) {
        const index = state.speakers.findIndex(s => s.id === id);
        if (index === -1) {
            throw new Error("السماعة غير موجودة");
        }

        const merged = { ...state.speakers[index], ...changes };
        const normalized = normalize(merged);

        const errors = validate(normalized);
        if (errors.length) {
            throw new Error(errors.join(" • "));
        }

        state.speakers[index] = normalized;
        notifyChange();

        /* ─── حاول الإرسال للسيرفر ─── */
        persistToBackend(normalized, "update").catch(err => {
            console.warn("[Speaker] update persist failed:", err);
        });

        return clone(normalized);
    }

    function remove(id) {
        const index = state.speakers.findIndex(s => s.id === id);
        if (index === -1) return false;

        const removed = state.speakers.splice(index, 1)[0];
        notifyChange();

        /* ─── حاول الحذف من السيرفر ─── */
        persistToBackend(removed, "delete").catch(err => {
            console.warn("[Speaker] delete persist failed:", err);
        });

        return true;
    }

    function clear() {
        state.speakers = [];
        notifyChange();
    }

    function getAll() {
        return clone(state.speakers);
    }

    function list() {
        return getAll();
    }

    function getById(id) {
        const s = state.speakers.find(x => x.id === id);
        return s ? clone(s) : null;
    }

    function get(id) {
        return getById(id);
    }

    /* ═══════════════ Presets ═══════════════ */

    function getPreset(name) {
        if (!name || !PRESETS[name]) return null;
        return clone(PRESETS[name]);
    }

    function listPresets() {
        return Object.entries(PRESETS).map(([key, value]) => ({
            key,
            ...clone(value)
        }));
    }

    function addPreset(name) {
        const preset = getPreset(name);
        if (!preset) throw new Error(`Preset غير معروف: ${name}`);
        return add(preset);
    }

    /* ═══════════════════════════════════════════════════════════
       Persistence — LocalStorage
       ═══════════════════════════════════════════════════════════ */

    const LOCAL_KEY = "acoustic_engineering_speakers";

    function saveToLocal() {
        try {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(state.speakers));
            return true;
        } catch (err) {
            console.warn("[Speaker] saveToLocal failed:", err);
            return false;
        }
    }

    function loadFromLocal() {
        try {
            const raw = localStorage.getItem(LOCAL_KEY);
            if (!raw) return false;

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return false;

            state.speakers = parsed.map(normalize);
            return true;
        } catch (err) {
            console.warn("[Speaker] loadFromLocal failed:", err);
            return false;
        }
    }

    /* ═══════════════════════════════════════════════════════════
       Persistence — Backend
       ═══════════════════════════════════════════════════════════ */

    async function syncFromBackend() {
        if (_syncing) return false;
        _syncing = true;

        try {
            const backend = getBackend();
            if (!backend?.speakers?.list) return false;

            await backend.waitForReady?.();

            const list = await backend.speakers.list();
            if (!Array.isArray(list) || list.length === 0) return false;

            /* ─── ادمج بدل الاستبدال ─── */
            const existingIds = new Set(state.speakers.map(s => s.id));

            for (const item of list) {
                const normalized = normalize(item);
                if (!existingIds.has(normalized.id)) {
                    state.speakers.push(normalized);
                }
            }

            state.source = backend.getMode?.() || "backend";
            state.loaded = true;
            notifyChange();

            return true;

        } catch (err) {
            console.warn("[Speaker] syncFromBackend failed:", err);
            return false;
        } finally {
            _syncing = false;
        }
    }

    async function persistToBackend(spec, action = "create") {
        const backend = getBackend();
        if (!backend?.speakers) return false;

        /* ─── فقط في وضع server ─── */
        const mode = backend.getMode?.();
        if (mode !== "server" && mode !== "firebase") return false;

        try {
            if (action === "create" && typeof backend.speakers.create === "function") {
                await backend.speakers.create(spec);
            } else if (action === "update" && typeof backend.speakers.update === "function") {
                await backend.speakers.update(spec.id, spec);
            } else if (action === "delete" && typeof backend.speakers.delete === "function") {
                await backend.speakers.delete(spec.id);
            }
            return true;
        } catch (err) {
            console.warn(`[Speaker] persistToBackend(${action}) failed:`, err);
            return false;
        }
    }

    /* ═══════════════════════════════════════════════════════════
       Init
       ═══════════════════════════════════════════════════════════ */

    function init(options = {}) {
        const { loadDefaults = true, loadFromStorage = true, syncBackend = true } = options;

        /* ─── 1. حاول التحميل من LocalStorage أولاً ─── */
        let hasData = false;
        if (loadFromStorage) {
            hasData = loadFromLocal();
        }

        /* ─── 2. إن لم توجد بيانات، استخدم افتراضية ─── */
        if (!hasData && loadDefaults && state.speakers.length === 0) {
            for (const presetKey of Object.keys(PRESETS)) {
                const preset = PRESETS[presetKey];
                try {
                    state.speakers.push(normalize(preset));
                } catch (err) {
                    console.warn("[Speaker] init preset failed:", presetKey, err);
                }
            }
        }

        /* ─── 3. إن مُرِّرت بيانات صريحة، أضِفها بدل الاستبدال ─── */
        if (Array.isArray(options.speakers) && options.speakers.length) {
            for (const raw of options.speakers) {
                try {
                    const normalized = normalize(raw);
                    const dup = state.speakers.find(s =>
                        s.manufacturer === normalized.manufacturer
                        && s.model === normalized.model
                    );
                    if (!dup) state.speakers.push(normalized);
                } catch (err) {
                    console.warn("[Speaker] init item failed:", err);
                }
            }
        }

        state.loaded = true;

        /* ─── 4. مزامنة مع Backend بالخلفية ─── */
        if (syncBackend) {
            syncFromBackend().catch(() => { /* ignore */ });
        }

        return getAll();
    }

    /* ═══════════════ Load (لاستبدال مصفوفة كاملة — admin) ═══════════════ */
    function load(data) {
        if (!data) return false;

        let list = null;
        if (Array.isArray(data)) {
            list = data;
        } else if (Array.isArray(data.speakers)) {
            list = data.speakers;
        } else {
            return false;
        }

        state.speakers = list.map(normalize);
        state.loaded = true;
        notifyChange();
        return true;
    }

    /* ═══════════════ Cross-tab sync ═══════════════ */
    window.addEventListener("storage", (event) => {
        if (event.key !== LOCAL_KEY) return;
        try {
            const parsed = JSON.parse(event.newValue || "[]");
            if (Array.isArray(parsed)) {
                state.speakers = parsed.map(normalize);
                dispatch("speakers:changed", { speakers: state.speakers.slice() });
            }
        } catch { /* ignore */ }
    });

    /* ═══════════════════════════════════════════════════════════
       Public API
       ═══════════════════════════════════════════════════════════ */

    const SpeakerAPI = {
        /* Constants */
        DEFAULTS,
        PRESETS,
        CATEGORIES,
        MOUNTS,

        /* State */
        state,
        isLoaded: () => state.loaded,
        getSource: () => state.source,

        /* Data management */
        init,
        load,
        clear,

        /* CRUD */
        add,
        create,
        update,
        remove,
        delete: remove,
        list,
        getAll,
        getById,
        get,

        /* Presets */
        getPreset,
        listPresets,
        addPreset,

        /* Validation */
        normalize,
        validate,

        /* Conversion */
        toNested,
        toFlat: normalize,

        /* Calculations */
        calculateSPLAtDistance,
        calculateSPL: calculateSPLAtDistance,
        calculateCoverageRadius,
        calculateCoverageArea,
        estimateCoverageArea: calculateCoverageArea,
        calculateCrestFactor,
        calculateBandwidth,

        /* Formatting */
        formatSpecs,
        renderSpecsHTML,
        renderCardHTML,
        renderTableRow,
        escapeHtml,

        /* Backend sync */
        syncFromBackend,
        persistToBackend,

        /* Local persistence */
        saveToLocal,
        loadFromLocal
    };

    /* ═══════════════ Exposure (متعدد) ═══════════════ */
    AE.speaker = SpeakerAPI;
    window.SpeakerDatabase = SpeakerAPI;
    window.AcousticSpeaker = SpeakerAPI;

    /* ═══════════════ Auto-init ═══════════════ */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            init();
        }, { once: true });
    } else {
        init();
    }

    console.log("[speaker.js] v2.0.0 جاهز — بنية مسطّحة + متداخلة، مع مزامنة Backend");

})();
