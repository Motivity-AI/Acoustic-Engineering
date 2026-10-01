/* ============================================================
   Acoustic Engineering — js/speaker.js v2.0.0
   نموذج السماعة، التحقق، الحسابات، العرض — لا رفع ملف
   ============================================================ */
(function () {
    "use strict";

    /* ═══════════════ Namespace ═══════════════ */
    window.AE = window.AE || {};
    window.AcousticEngineering = window.AcousticEngineering || {};

    /* ═══════════════ ثوابت ═══════════════ */
    const CATEGORIES = [
        "Point Source", "Column", "Ceiling",
        "Line Array", "Subwoofer", "Monitor", "Horn"
    ];

    const MOUNTS = [
        "Stand", "Wall", "Ceiling", "Fly",
        "Ground", "Tripod", "Pole", "Truss"
    ];

    /* ═══════════════ القيم الافتراضية ═══════════════ */
    const DEFAULTS = Object.freeze({
        manufacturer: "Generic",
        model: "New Speaker",
        category: "Point Source",
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
        mounting_type: "Stand"
    });

    /* ═══════════════ Presets ═══════════════ */
    const PRESETS = Object.freeze({
        "generic-fullrange": {
            manufacturer: "Generic",
            model: "Full Range 12",
            category: "Point Source",
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
            mounting_type: "Stand"
        },
        "ceiling": {
            manufacturer: "Generic",
            model: "Ceiling 6W",
            category: "Ceiling",
            rms_power: 6,
            peak_power: 12,
            max_spl: 96,
            sensitivity: 88,
            frequency_min: 100,
            frequency_max: 16000,
            horizontal_coverage: 90,
            vertical_coverage: 90,
            impedance: 8,
            weight: 1,
            mounting_type: "Ceiling"
        },
        "column": {
            manufacturer: "Generic",
            model: "Column Speaker",
            category: "Column",
            rms_power: 150,
            peak_power: 300,
            max_spl: 112,
            sensitivity: 94,
            frequency_min: 80,
            frequency_max: 16000,
            horizontal_coverage: 120,
            vertical_coverage: 30,
            impedance: 8,
            weight: 8,
            mounting_type: "Wall"
        },
        "subwoofer": {
            manufacturer: "Generic",
            model: "Subwoofer 18",
            category: "Subwoofer",
            rms_power: 1200,
            peak_power: 2400,
            max_spl: 132,
            sensitivity: 99,
            frequency_min: 35,
            frequency_max: 150,
            horizontal_coverage: 100,
            vertical_coverage: 60,
            impedance: 8,
            weight: 45,
            mounting_type: "Ground"
        },
        "linearray": {
            manufacturer: "Generic",
            model: "Line Array Element",
            category: "Line Array",
            rms_power: 1000,
            peak_power: 2000,
            max_spl: 135,
            sensitivity: 100,
            frequency_min: 45,
            frequency_max: 20000,
            horizontal_coverage: 100,
            vertical_coverage: 10,
            impedance: 8,
            weight: 30,
            mounting_type: "Fly"
        }
    });

    /* ═══════════════ الحالة الداخلية ═══════════════ */
    let _speakers = [];       // السماعات المُضافة للمشروع
    let _nextId = 1;

    /* ═══════════════ تطبيع البيانات ═══════════════ */

    /**
     * تطبيع بيانات السماعة — يقبل أي مدخل، يُعيد كائناً نظيفاً
     */
    function normalize(input) {
        if (!input || typeof input !== "object") input = {};

        const str = (v, def = "") =>
            v === undefined || v === null ? def : String(v).trim();

        const num = (v, def = 0, min = -Infinity, max = Infinity) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return def;
            return Math.min(max, Math.max(min, n));
        };

        const pick = (v, allowed, def) =>
            allowed.includes(v) ? v : def;

        const out = {
            manufacturer:         str(input.manufacturer, DEFAULTS.manufacturer).slice(0, 100),
            model:                str(input.model, DEFAULTS.model).slice(0, 100),
            category:             pick(str(input.category), CATEGORIES, DEFAULTS.category),
            rms_power:            num(input.rms_power, DEFAULTS.rms_power, 0, 50000),
            peak_power:           num(input.peak_power, DEFAULTS.peak_power, 0, 100000),
            max_spl:              num(input.max_spl, DEFAULTS.max_spl, 0, 200),
            sensitivity:          num(input.sensitivity, DEFAULTS.sensitivity, 0, 150),
            frequency_min:        num(input.frequency_min, DEFAULTS.frequency_min, 0, 20000),
            frequency_max:        num(input.frequency_max, DEFAULTS.frequency_max, 0, 40000),
            horizontal_coverage:  num(input.horizontal_coverage, DEFAULTS.horizontal_coverage, 0.1, 360),
            vertical_coverage:    num(input.vertical_coverage, DEFAULTS.vertical_coverage, 0.1, 360),
            impedance:            num(input.impedance, DEFAULTS.impedance, 0.1, 100),
            weight:               num(input.weight, DEFAULTS.weight, 0, 500),
            mounting_type:        pick(str(input.mounting_type), MOUNTS, DEFAULTS.mounting_type)
        };

        // منطق: peak >= rms
        if (out.peak_power && out.rms_power && out.peak_power < out.rms_power) {
            out.peak_power = out.rms_power * 2;
        }

        // منطق: max_freq >= min_freq
        if (out.frequency_min > 0 && out.frequency_max > 0
            && out.frequency_max < out.frequency_min) {
            [out.frequency_min, out.frequency_max] =
                [out.frequency_max, out.frequency_min];
        }

        return out;
    }

    /* ═══════════════ التحقق ═══════════════ */

    /**
     * التحقق من مواصفات السماعة
     * @returns {Array<string>} مصفوفة أخطاء (فارغة إذا سليم)
     */
    function validate(spec) {
        const errors = [];
        const s = spec || {};

        /* ─── الهوية ─── */
        if (!s.manufacturer || String(s.manufacturer).trim().length < 2) {
            errors.push("الشركة المصنّعة مطلوبة (حرفان على الأقل)");
        }
        if (!s.model || String(s.model).trim().length < 1) {
            errors.push("موديل السماعة مطلوب");
        }

        /* ─── القدرة ─── */
        const rms = Number(s.rms_power);
        const peak = Number(s.peak_power);
        if (Number.isFinite(rms) && rms < 0) errors.push("RMS لا يمكن أن يكون سالباً");
        if (Number.isFinite(peak) && peak < 0) errors.push("Peak لا يمكن أن يكون سالباً");
        if (rms > 0 && peak > 0 && peak < rms) {
            errors.push("Peak يجب أن يكون ≥ RMS");
        }

        /* ─── الصوتيات ─── */
        const spl = Number(s.max_spl);
        const sens = Number(s.sensitivity);
        if (Number.isFinite(spl) && (spl < 0 || spl > 200)) {
            errors.push("Max SPL يجب أن يكون بين 0 و 200 dB");
        }
        if (Number.isFinite(sens) && (sens < 0 || sens > 150)) {
            errors.push("الحساسية يجب أن تكون بين 0 و 150 dB");
        }

        /* ─── الترددات ─── */
        const fmin = Number(s.frequency_min);
        const fmax = Number(s.frequency_max);
        if (fmin > 0 && fmax > 0 && fmax < fmin) {
            errors.push("التردد الأعلى يجب أن يكون > الأدنى");
        }
        if (fmax > 40000) errors.push("التردد الأعلى > 40 kHz غير منطقي");

        /* ─── التغطية ─── */
        const h = Number(s.horizontal_coverage);
        const v = Number(s.vertical_coverage);
        if (Number.isFinite(h) && (h <= 0 || h > 360)) {
            errors.push("التغطية الأفقية يجب أن تكون بين 0.1° و 360°");
        }
        if (Number.isFinite(v) && (v <= 0 || v > 360)) {
            errors.push("التغطية العمودية يجب أن تكون بين 0.1° و 360°");
        }

        /* ─── الكهربائي ─── */
        const imp = Number(s.impedance);
        if (Number.isFinite(imp) && (imp <= 0 || imp > 100)) {
            errors.push("المعاوقة يجب أن تكون بين 0.1 و 100 Ω");
        }

        /* ─── الفيزيائي ─── */
        const w = Number(s.weight);
        if (Number.isFinite(w) && (w < 0 || w > 500)) {
            errors.push("الوزن يجب أن يكون بين 0 و 500 kg");
        }

        return errors;
    }

    /* ═══════════════ الحسابات الهندسية ═══════════════ */

    /**
     * حساب SPL على مسافة معينة (قانون التربيع العكسي)
     * SPL₂ = SPL₁ - 20*log10(r₂/r₁)
     * نفترض SPL₁ عند 1 متر
     */
    function calculateSPLAtDistance(spec, distanceMeters) {
        if (!spec || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
            return null;
        }

        const refSPL = Number(spec.max_spl) || 0;
        if (refSPL <= 0) return null;

        // SPL = SPL_ref - 20*log10(d)
        const spl = refSPL - 20 * Math.log10(distanceMeters);
        return Math.round(spl * 10) / 10;
    }

    /**
     * حساب نصف قطر التغطية عند ارتفاع معين
     * r = h * tan(θ/2)
     */
    function calculateCoverageRadius(spec, heightMeters) {
        if (!spec || !Number.isFinite(heightMeters) || heightMeters <= 0) {
            return null;
        }

        const vAngle = Number(spec.vertical_coverage) || 60;
        const halfAngleRad = (vAngle / 2) * (Math.PI / 180);
        const radius = heightMeters * Math.tan(halfAngleRad);
        return Math.round(radius * 100) / 100;
    }

    /**
     * حساب مساحة التغطية (بافتراض مخروط دائري)
     */
    function calculateCoverageArea(spec, heightMeters) {
        const radius = calculateCoverageRadius(spec, heightMeters);
        if (radius === null) return null;
        const area = Math.PI * radius * radius;
        return Math.round(area * 100) / 100;
    }

    /**
     * حساب نسبة Peak/RMS
     */
    function calculateCrestFactor(spec) {
        const rms = Number(spec?.rms_power);
        const peak = Number(spec?.peak_power);
        if (!rms || !peak || rms <= 0) return null;
        const ratio = peak / rms;
        const db = 20 * Math.log10(ratio);
        return {
            ratio: Math.round(ratio * 100) / 100,
            db: Math.round(db * 10) / 10
        };
    }

    /**
     * حساب الإزاحة الطيفية (bandwidth in octaves)
     */
    function calculateBandwidth(spec) {
        const fmin = Number(spec?.frequency_min);
        const fmax = Number(spec?.frequency_max);
        if (!fmin || !fmax || fmin <= 0 || fmax <= fmin) return null;
        const octaves = Math.log2(fmax / fmin);
        return Math.round(octaves * 100) / 100;
    }

    /* ═══════════════ التنسيق للعرض ═══════════════ */

    /**
     * تحويل مواصفات مسطّحة → كائن منظّم للعرض
     */
    function formatSpecs(spec) {
        if (!spec) return null;
        const s = normalize(spec);

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

    /**
     * توليد HTML لعرض المواصفات (بطاقة)
     */
    function renderSpecsHTML(spec) {
        const f = formatSpecs(spec);
        if (!f) return "";

        const row = (label, value) => `
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);">
                <span style="color:#6b7280;font-size:10px;">${label}</span>
                <span style="color:#d1d5db;font-size:10px;font-weight:700;direction:ltr;">${value}</span>
            </div>
        `;

        return `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">القدرة</div>
                    ${row("RMS", f.power.rms_text)}
                    ${row("Peak", f.power.peak_text)}
                    ${f.power.crest_factor ? row("Crest", `${f.power.crest_factor.ratio}:1 (${f.power.crest_factor.db} dB)`) : ""}
                </div>
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">الصوتيات</div>
                    ${row("Max SPL", f.acoustics.max_spl_text)}
                    ${row("الحساسية", f.acoustics.sensitivity_text)}
                </div>
                <div>
                    <div style="color:#38bdf8;font-size:9px;font-weight:700;margin-bottom:5px;">التردد</div>
                    ${row("النطاق", f.frequency.range_text)}
                    ${f.frequency.bandwidth_octaves ? row("Bandwidth", `${f.frequency.bandwidth_octaves} oct`) : ""}
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

    /**
     * توليد HTML لبطاقة مكتبة
     */
    function renderCardHTML(spec) {
        const f = formatSpecs(spec);
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

    /**
     * صف جدول BOM
     */
    function renderTableRow(spec, index) {
        const f = formatSpecs(spec);
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

    /* ═══════════════ Escape ═══════════════ */
    function escapeHtml(str) {
        return String(str ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;",
            '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    /* ═══════════════ CRUD ═══════════════ */

    /**
     * إنشاء سماعة جديدة (محلي)
     */
    function create(input) {
        const normalized = normalize(input);

        // تحقق
        const errors = validate(normalized);
        if (errors.length) {
            throw new Error(errors.join(" • "));
        }

        return normalized;
    }

    /**
     * إضافة سماعة للقائمة الحالية
     */
    function add(input) {
        const spec = create(input);
        const record = {
            ...spec,
            id: _nextId++,
            createdAt: new Date().toISOString()
        };
        _speakers.push(record);
        notifyChange();
        return record;
    }

    /**
     * تحديث سماعة
     */
    function update(id, changes) {
        const idx = _speakers.findIndex(s => s.id === id);
        if (idx === -1) throw new Error("السماعة غير موجودة");

        const merged = { ..._speakers[idx], ...changes };
        const normalized = normalize(merged);

        const errors = validate(normalized);
        if (errors.length) throw new Error(errors.join(" • "));

        _speakers[idx] = { ...normalized, id, updatedAt: new Date().toISOString() };
        notifyChange();
        return _speakers[idx];
    }

    /**
     * حذف سماعة
     */
    function remove(id) {
        const idx = _speakers.findIndex(s => s.id === id);
        if (idx === -1) return false;
        _speakers.splice(idx, 1);
        notifyChange();
        return true;
    }

    /**
     * حذف الكل
     */
    function clear() {
        _speakers = [];
        notifyChange();
    }

    /**
     * قائمة السماعات
     */
    function list() {
        return _speakers.slice();
    }

    /**
     * الحصول على سماعة
     */
    function getById(id) {
        return _speakers.find(s => s.id === id) || null;
    }

    /**
     * إضافة من Preset
     */
    function addPreset(presetName) {
        const preset = PRESETS[presetName];
        if (!preset) throw new Error("Preset غير معروف: " + presetName);
        return add({ ...preset });
    }

    /**
     * الحصول على Preset
     */
    function getPreset(name) {
        return PRESETS[name] ? { ...PRESETS[name] } : null;
    }

    /**
     * قائمة الـ Presets
     */
    function listPresets() {
        return Object.keys(PRESETS).map(key => ({
            key =>,
            ...PRESETS[key]
        }));
    document }

    /* ═══════════════ Events ═══════════════ */
    function notifyChange() {
        try {
            window.dispatchEvent(new CustomEvent("speakers:changed", {
                detail: { speakers: _speakers.slice() }
            }));
        } catch { /* ignore */ }
    }

    /* ═══════════════ API العام ═══════════════ */
    const api = {
        // ثوابت
        DEFAULTS,
        PRESETS,
        CATEGORIES,
        MOUNTS,

        // البيانات
        create,
        normalize,
        validate,

        // CRUD
        add,
        addPreset,
        update,
        remove,
        clear,
        list,
        getById,
        getPreset,
        listPresets,

        // الحسابات
        calculateSPLAtDistance,
        calculateCoverageRadius,
        calculateCoverageArea,
        calculateCrestFactor,
        calculateBandwidth,

        // التنسيق
        formatSpecs,
        renderSpecsHTML,
        renderCardHTML,
        renderTableRow,
        escapeHtml
    };

    /* ═══════════════ تصدير ═══════════════ */
    window.AE.speaker = api;
    window.AcousticEngineering.speaker = api;
    window.AcousticSpeaker = api;   // للتوافق الخلفي

    console.log("[speaker.js] v2.0.0 جاهز — نموذج مواصفات، لا رفع ملف");

})();
