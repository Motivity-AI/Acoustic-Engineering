/* ============================================================
   Acoustic Engineering — js/report.js v2.0.0
   Engineering Report Generator
   ✅ يعرض مواصفات السماعة كاملة (هدفك الأصلي!)
   ✅ يتكامل مع report.html (يملأ الصفحة)
   ✅ يفتح نافذة فقط عند التنزيل
   ✅ يستخدم speaker.formatSpecs() و engine
   ✅ يعرض BOM، التحذيرات، المنهجية
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════ Resolution helpers ═══════════════ */

    function getEngine() {
        return AE.engine || window.AcousticEngine || null;
    }

    function getSpeakerAPI() {
        return AE.speaker || window.AcousticSpeaker || window.SpeakerDatabase || null;
    }

    function getCanvasAPI() {
        return AE.canvas || window.AcousticCanvas || null;
    }

    function getBackend() {
        return AE.backend || window.AcousticBackend || null;
    }

    /* ═══════════════════════════════════════════════════════════
       REPORT
       ═══════════════════════════════════════════════════════════ */

    const Report = {
        version: "2.0.0",

        /* ═══════════ Helpers ═══════════ */

        number(v, fb = 0) {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
        },

        round(v, d = 2) {
            const f = Math.pow(10, d);
            return Math.round(v * f) / f;
        },

        escape(v) {
            return String(v ?? "").replace(/[&<>"']/g, c => ({
                "&": "&amp;", "<": "&lt;", ">": "&gt;",
                '"': "&quot;", "'": "&#039;"
            }[c]));
        },

        format(v, d = 2) {
            const n = Number(v);
            if (!Number.isFinite(n)) return "—";
            return n.toFixed(d).replace(/\.?0+$/, "") || "0";
        },

        formatNumber(v, d = 0) {
            const n = Number(v);
            if (!Number.isFinite(n)) return "—";
            return n.toFixed(d);
        },

        date() {
            const d = new Date();
            try {
                return d.toLocaleDateString("ar-SA-u-nu-latn", {
                    year: "numeric", month: "long", day: "numeric"
                });
            } catch {
                return d.toISOString().slice(0, 10);
            }
        },

        time() {
            const d = new Date();
            try {
                return d.toLocaleTimeString("ar-SA-u-nu-latn", {
                    hour: "2-digit", minute: "2-digit"
                });
            } catch {
                return d.toTimeString().slice(0, 5);
            }
        },

        /* ═══════════ Report Number ═══════════ */

        generateReportNumber() {
            const stamp = Date.now().toString(36).toUpperCase();
            const random = Math.random().toString(36).slice(2, 6).toUpperCase();
            return `AE-${stamp}-${random}`;
        },

        /* ═══════════════════════════════════════════════════════
           🎯 استخراج مواصفات السماعة (من speaker.js أو من الكائن)
           ═══════════════════════════════════════════════════════ */

        extractSpeakerSpecs(layoutObject) {
            /* ─── 1. إن كان هناك speakerId، اجلب من مكتبة speaker.js ─── */
            const speakerApi = getSpeakerAPI();
            let source = null;

            if (layoutObject.speakerId && speakerApi) {
                try {
                    if (typeof speakerApi.getById === "function") {
                        source = speakerApi.getById(layoutObject.speakerId);
                    } else if (typeof speakerApi.get === "function") {
                        source = speakerApi.get(layoutObject.speakerId);
                    }
                } catch { /* ignore */ }
            }

            /* ─── 2. ادمج مع بيانات layoutObject ─── */
            const merged = {
                ...(source || {}),
                ...(layoutObject || {})
            };

            /* ─── 3. استخدم speaker.formatSpecs إن وُجدت ─── */
            if (speakerApi && typeof speakerApi.formatSpecs === "function") {
                try {
                    const formatted = speakerApi.formatSpecs(merged);
                    if (formatted) return formatted;
                } catch { /* ignore */ }
            }

            /* ─── 4. Fallback: اقرأ مباشرة ─── */
            const num = (v, fb = 0) => {
                const n = Number(v);
                return Number.isFinite(n) ? n : fb;
            };

            const rms = num(
                layoutObject.rms_power ?? layoutObject.rms
                ?? layoutObject.power?.rms
                ?? source?.rms_power ?? source?.rms,
                0
            );

            const peak = num(
                layoutObject.peak_power ?? layoutObject.peak
                ?? layoutObject.power?.peak
                ?? source?.peak_power,
                0
            );

            const maxSPL = num(
                layoutObject.max_spl ?? layoutObject.maxSPL
                ?? source?.max_spl ?? source?.maxSPL,
                0
            );

            const sensitivity = num(
                layoutObject.sensitivity ?? source?.sensitivity,
                0
            );

            const fMin = num(
                layoutObject.frequency_min ?? layoutObject.frequency?.low
                ?? source?.frequency_min ?? source?.frequency?.low,
                0
            );

            const fMax = num(
                layoutObject.frequency_max ?? layoutObject.frequency?.high
                ?? source?.frequency_max ?? source?.frequency?.high,
                0
            );

            const hCoverage = num(
                layoutObject.horizontal_coverage ?? layoutObject.horizontal
                ?? layoutObject.horizontalCoverage
                ?? source?.horizontal_coverage ?? source?.coverage?.horizontal,
                90
            );

            const vCoverage = num(
                layoutObject.vertical_coverage ?? layoutObject.vertical
                ?? layoutObject.verticalCoverage
                ?? source?.vertical_coverage ?? source?.coverage?.vertical,
                60
            );

            const impedance = num(
                layoutObject.impedance ?? source?.impedance,
                8
            );

            const weight = num(
                layoutObject.weight ?? source?.weight,
                0
            );

            return {
                identity: {
                    manufacturer: source?.manufacturer || layoutObject.manufacturer || "Generic",
                    model: source?.model || layoutObject.model || "Speaker",
                    category: source?.category || layoutObject.category || "Point Source",
                    display_name: `${source?.manufacturer || layoutObject.manufacturer || "Generic"} ${source?.model || layoutObject.model || "Speaker"}`
                },
                power: {
                    rms_watts: rms,
                    peak_watts: peak,
                    rms_text: rms ? `${rms} W RMS` : "—",
                    peak_text: peak ? `${peak} W peak` : "—"
                },
                acoustics: {
                    max_spl_db: maxSPL,
                    sensitivity_db: sensitivity,
                    max_spl_text: maxSPL ? `${maxSPL} dB SPL` : "—",
                    sensitivity_text: sensitivity ? `${sensitivity} dB (1W/1m)` : "—"
                },
                frequency: {
                    min_hz: fMin,
                    max_hz: fMax,
                    range_text: (fMin && fMax) ? `${fMin} – ${fMax} Hz` : "—"
                },
                coverage: {
                    horizontal_deg: hCoverage,
                    vertical_deg: vCoverage,
                    pattern_text: `${hCoverage}° × ${vCoverage}°`
                },
                electrical: {
                    impedance_ohms: impedance,
                    impedance_text: impedance ? `${impedance} Ω` : "—"
                },
                physical: {
                    weight_kg: weight,
                    weight_text: weight ? `${weight} kg` : "—",
                    mounting: source?.mounting_type || layoutObject.mounting || layoutObject.mounting_type || "Stand"
                }
            };
        },

        /* ═══════════════════════════════════════════════════════
           Data Sources
           ═══════════════════════════════════════════════════════ */

        getData() {
            const engine = getEngine();
            if (engine && typeof engine.getDesignData === "function") {
                try {
                    return engine.getDesignData();
                } catch (err) {
                    console.warn("[Report] engine.getDesignData failed:", err);
                }
            }
            return {
                room: {}, stage: {}, audience: {},
                target: {}, design: {}, speakers: [], analysis: null
            };
        },

        getProjectInfo() {
            const ids = ["projectName", "clientName", "projectLocation", "venueType"];
            const result = {};

            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    result[id] = (el.value ?? el.textContent ?? "").trim();
                }
            });

            /* ─── Fallback: currentProject من storage ─── */
            if (!result.projectName) {
                try {
                    const storage = AE.storage || window.AcousticStorage;
                    if (storage?.getCurrentProject) {
                        const p = storage.getCurrentProject();
                        if (p) {
                            result.projectName = p.projectName || p.name || result.projectName;
                            result.clientName = p.clientName || p.client || result.clientName;
                            result.projectLocation = p.projectLocation || p.location || result.projectLocation;
                            result.venueType = p.venueType || p.venue || result.venueType;
                        }
                    }
                } catch { /* ignore */ }
            }

            /* ─── Fallback: localStorage ─── */
            if (!result.projectName) {
                try {
                    const raw = localStorage.getItem("acousticEngineering_currentProject")
                             || localStorage.getItem("acoustic_engineering_currentProject");
                    if (raw) {
                        const p = JSON.parse(raw);
                        result.projectName = p.projectName || p.name || "";
                        result.clientName = p.clientName || p.client || "";
                        result.projectLocation = p.projectLocation || p.location || "";
                        result.venueType = p.venueType || p.venue || "";
                    }
                } catch { /* ignore */ }
            }

            return {
                name: result.projectName || "مشروع هندسة صوتية",
                client: result.clientName || "—",
                location: result.projectLocation || "—",
                venue: result.venueType || "—"
            };
        },

        /* ═══════════════════════════════════════════════════════
           Status
           ═══════════════════════════════════════════════════════ */

        getStatus(analysis) {
            if (!analysis) return { key: "unknown", label: "لم يتم التحليل" };

            const coverage = this.number(
                analysis.coveragePercent ?? analysis.coverage?.coveragePercent
            );
            const minSPL = this.number(
                analysis.minimumSPL ?? analysis.coverage?.minimumSPL
            );
            const target = this.number(
                analysis.targetSPL ?? analysis.coverage?.targetSPL,
                95
            );
            const uniformity = this.number(
                analysis.uniformity ?? analysis.coverage?.uniformity
            );

            /* ─── لا نتيجة ─── */
            if (!coverage && !minSPL) return { key: "unknown", label: "لا توجد نتائج" };

            /* ─── حرج ─── */
            if (coverage < 70 || minSPL < target - 10 || uniformity > 12) {
                return { key: "critical", label: "يحتاج مراجعة هندسية" };
            }

            /* ─── يحتاج مراجعة ─── */
            if (coverage < 90 || minSPL < target || uniformity > 8) {
                return { key: "review", label: "مقبول مع ملاحظات" };
            }

            /* ─── جيد ─── */
            return { key: "good", label: "ضمن الأهداف الهندسية" };
        },

        /* ═══════════════════════════════════════════════════════
           Model Builder
           ═══════════════════════════════════════════════════════ */

        buildModel() {
            const data = this.getData();
            const project = this.getProjectInfo();
            const analysis = data.analysis || {};
            const speakersLayout = Array.isArray(data.speakers) ? data.speakers : [];

            /* ─── 🎯 استخرج مواصفات كل سماعة ─── */
            const speakersWithSpecs = speakersLayout.map(layoutObject => ({
                layout: layoutObject,
                specs: this.extractSpeakerSpecs(layoutObject)
            }));

            /* ─── BOM ─── */
            let bom = [];
            const engine = getEngine();
            if (engine && typeof engine.generateBOM === "function") {
                try {
                    bom = engine.generateBOM(speakersLayout) || [];
                } catch (err) {
                    console.warn("[Report] generateBOM failed:", err);
                }
            }

            /* ─── Warnings ─── */
            let warnings = [];
            if (Array.isArray(analysis.warnings)) {
                warnings = analysis.warnings;
            } else if (engine && typeof engine.generateWarnings === "function") {
                try {
                    const firstSpeaker = speakersWithSpecs[0]?.layout;
                    warnings = engine.generateWarnings(
                        speakersLayout,
                        analysis,
                        firstSpeaker
                    ) || [];
                } catch { /* ignore */ }
            }

            /* ─── Totals ─── */
            const totalPower = speakersWithSpecs.reduce(
                (s, w) => s + (w.specs.power.rms_watts || 0), 0
            );
            const totalWeight = speakersWithSpecs.reduce(
                (s, w) => s + (w.specs.physical.weight_kg || 0), 0
            );

            return {
                meta: {
                    title: "تقرير هندسي للنظام الصوتي",
                    generatedAt: new Date().toISOString(),
                    date: this.date(),
                    time: this.time(),
                    version: this.version,
                    reportNumber: this.generateReportNumber()
                },
                project,
                room: data.room || {},
                stage: data.stage || {},
                audience: data.audience || {},
                target: data.target || {},
                design: data.design || {},
                speakers: speakersWithSpecs,
                speakerCount: speakersWithSpecs.length,
                bom,
                analysis,
                warnings,
                totals: {
                    power: totalPower,
                    weight: totalWeight
                },
                status: this.getStatus(analysis)
            };
        },

        /* ═══════════════════════════════════════════════════════
           🎯 Renderer: يملأ report.html بالبيانات
           ═══════════════════════════════════════════════════════ */

        renderIntoPage() {
            const model = this.buildModel();

            /* ═══════════ Header / Meta ═══════════ */
            this.setText("projectName", model.project.name);
            this.setText("clientName", model.project.client);
            this.setText("projectLocation", model.project.location);
            this.setText("venueType", model.project.venue);

            /* ═══════════ Status ═══════════ */
            this.setText("statusText", model.status.label);
            const dot = document.getElementById("statusDot");
            if (dot) {
                dot.className = "status-dot";
                if (model.status.key === "critical") dot.classList.add("danger");
                else if (model.status.key === "review") dot.classList.add("warning");
            }

            const score = document.getElementById("statusScore");
            if (score) {
                const cov = this.number(model.analysis.coveragePercent ?? model.analysis.coverage?.coveragePercent);
                score.textContent = cov ? `التغطية: ${this.format(cov, 1)}%` : "—";
            }

            /* ═══════════ Executive Summary ═══════════ */
            const summary = document.getElementById("executiveSummary");
            if (summary) {
                summary.innerHTML = this.buildExecutiveSummaryHTML(model);
            }

            /* ═══════════ Key Metrics ═══════════ */
            const coverage = this.number(model.analysis.coveragePercent ?? model.analysis.coverage?.coveragePercent);
            const avgSPL = this.number(model.analysis.averageSPL ?? model.analysis.coverage?.averageSPL);
            const uniformity = this.number(model.analysis.uniformity ?? model.analysis.coverage?.uniformity);

            this.setText("metricCoverage", this.format(coverage, 1));
            this.setText("metricAverageSPL", this.format(avgSPL, 1));
            this.setText("metricUniformity", this.format(uniformity, 1));
            this.setText("metricSpeakerCount", String(model.speakerCount));

            /* ═══════════ Room Table ═══════════ */
            this.renderRoomTable(model.room);

            /* ═══════════ Target Table ═══════════ */
            this.renderTargetTable(model.target, model.design);

            /* ═══════════ Plan Diagram ═══════════ */
            this.renderPlanDiagram(model);

            /* ═══════════ Heatmap Diagram ═══════════ */
            this.renderHeatmapDiagram(model);

            /* ═══════════ 🎯 Speaker BOM (المواصفات الكاملة) ═══════════ */
            this.renderSpeakerBOM(model);

            /* ═══════════ Speaker Positions ═══════════ */
            this.renderSpeakerPositions(model);

            /* ═══════════ Analysis Table ═══════════ */
            this.renderAnalysisTable(model);

            /* ═══════════ Engineering Narrative ═══════════ */
            const narrative = document.getElementById("engineeringNarrative");
            if (narrative) {
                narrative.innerHTML = this.buildNarrativeHTML(model);
            }

            /* ═══════════ Warnings ═══════════ */
            this.renderWarnings(model.warnings);

            /* ═══════════ Document Info ═══════════ */
            this.setText("reportNumber", model.meta.reportNumber);
            this.setText("reportDate", model.meta.date);
            this.setText("reportTime", model.meta.time);
            this.setText("softwareVersion", `Acoustic Engineering v${model.meta.version}`);
            this.setText("designModeInfo", model.design.mode || "—");
            this.setText("designFileInfo", model.project.name || "—");

            /* ─── Title ─── */
            try {
                document.title = `${model.project.name} | التقرير الهندسي`;
            } catch { /* ignore */ }

            /* ─── Event ─── */
            try {
                window.dispatchEvent(new CustomEvent("report:rendered", {
                    detail: { model }
                }));
            } catch { /* ignore */ }

            return model;
        },

        /* ═══════════ Executive Summary ═══════════ */

        buildExecutiveSummaryHTML(model) {
            const room = model.room;
            const area = this.number(room.width) * this.number(room.depth);
            const volume = area * this.number(room.height);

            const coverage = this.number(model.analysis.coveragePercent ?? model.analysis.coverage?.coveragePercent);
            const avgSPL = this.number(model.analysis.averageSPL ?? model.analysis.coverage?.averageSPL);

            return `
                <p>
                    تم إعداد هذا التقرير لمشروع <strong>${this.escape(model.project.name)}</strong>
                    ${model.project.client !== "—" ? `لصالح <strong>${this.escape(model.project.client)}</strong>` : ""}.
                </p>
                <p>
                    الفراغ بأبعاد
                    <strong>${this.format(room.width, 2)} × ${this.format(room.depth, 2)} × ${this.format(room.height, 2)} m</strong>
                    — المساحة <strong>${this.format(area, 1)} m²</strong>
                    والحجم <strong>${this.format(volume, 1)} m³</strong>.
                </p>
                <p>
                    يتضمّن التصميم <strong>${model.speakerCount}</strong>
                    ${model.speakerCount === 1 ? "سماعة" : "سماعات"}
                    ${model.totals.power ? `بإجمالي قدرة <strong>${this.format(model.totals.power, 0)} W</strong>` : ""}
                    ${model.totals.weight ? `ووزن إجمالي <strong>${this.format(model.totals.weight, 1)} kg</strong>` : ""}.
                </p>
                ${coverage ? `
                <p>
                    نسبة التغطية المحسوبة <strong>${this.format(coverage, 1)}%</strong>
                    ${avgSPL ? `، بمتوسط ضغط صوتي <strong>${this.format(avgSPL, 1)} dB</strong>` : ""}.
                </p>` : ""}
                <p style="color:#8d99a8;font-size:12px;">
                    النتائج تقديرية وتعتمد على البيانات المُدخلة، ويُوصى بالتحقق الميداني قبل التنفيذ.
                </p>
            `;
        },

        /* ═══════════ Room Table ═══════════ */

        renderRoomTable(room) {
            const tbody = document.getElementById("roomTableBody");
            if (!tbody) return;

            const w = this.number(room.width);
            const d = this.number(room.depth);
            const h = this.number(room.height);
            const area = w * d;
            const volume = area * h;

            tbody.innerHTML = `
                <tr><th>العنصر</th><th>القيمة</th></tr>
                <tr><td>العرض (W)</td><td>${this.format(w, 2)} m</td></tr>
                <tr><td>العمق (D)</td><td>${this.format(d, 2)} m</td></tr>
                <tr><td>الارتفاع (H)</td><td>${this.format(h, 2)} m</td></tr>
                <tr><td>المساحة</td><td>${this.format(area, 1)} m²</td></tr>
                <tr><td>الحجم</td><td>${this.format(volume, 1)} m³</td></tr>
                ${room.wallMaterial ? `<tr><td>مادة الجدران</td><td>${this.escape(room.wallMaterial)}</td></tr>` : ""}
                ${room.reflectionLevel ? `<tr><td>مستوى الانعكاس</td><td>${this.escape(room.reflectionLevel)}</td></tr>` : ""}
            `;
        },

        /* ═══════════ Target Table ═══════════ */

        renderTargetTable(target, design) {
            const tbody = document.getElementById("targetTableBody");
            if (!tbody) return;

            tbody.innerHTML = `
                <tr><th>المعيار</th><th>القيمة</th></tr>
                <tr><td>Target SPL</td><td>${this.format(target.spl, 1)} dB</td></tr>
                <tr><td>Headroom</td><td>${this.format(target.headroom, 1)} dB</td></tr>
                <tr><td>Coverage Target</td><td>${this.format(target.coverage, 1)} %</td></tr>
                <tr><td>ارتفاع المستمع</td><td>${this.format(design.listenerHeight || 1.2, 2)} m</td></tr>
                ${design.mountingHeight ? `<tr><td>ارتفاع التركيب</td><td>${this.format(design.mountingHeight, 2)} m</td></tr>` : ""}
            `;
        },

        /* ═══════════════════════════════════════════════════════
           🎯 Speaker BOM — المواصفات الكاملة لكل سماعة
           ═══════════════════════════════════════════════════════ */

        renderSpeakerBOM(model) {
            const tbody = document.getElementById("speakerTableBody");
            if (!tbody) return;

            if (!model.speakers.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align:center;color:#8d99a8;padding:20px;">
                            لا توجد سماعات في التصميم
                        </td>
                    </tr>
                `;
                return;
            }

            /* ─── تجميع السماعات المتطابقة ─── */
            const groups = new Map();

            model.speakers.forEach(item => {
                const specs = item.specs;
                const key = `${specs.identity.manufacturer}||${specs.identity.model}`;

                if (!groups.has(key)) {
                    groups.set(key, {
                        specs,
                        quantity: 0,
                        instances: []
                    });
                }

                const group = groups.get(key);
                group.quantity++;
                group.instances.push(item);
            });

            /* ─── رسم الصفوف ─── */
            let index = 0;
            const rows = [];

            groups.forEach(group => {
                index++;
                const s = group.specs;

                rows.push(`
                    <tr>
                        <td>${index}</td>
                        <td>${this.escape(s.identity.manufacturer)}</td>
                        <td><strong>${this.escape(s.identity.model)}</strong></td>
                        <td>${this.escape(s.identity.category)}</td>
                        <td><strong>${group.quantity}</strong></td>
                        <td>${this.format(s.power.rms_watts, 0)}</td>
                        <td>${this.format(s.acoustics.sensitivity_db, 1)}</td>
                        <td>${this.format(s.acoustics.max_spl_db, 1)}</td>
                        <td>${this.format(s.electrical.impedance_ohms, 1)}</td>
                        <td>${this.escape(s.coverage.pattern_text)}</td>
                    </tr>
                `);

                /* ─── صف تفاصيل المواصفات الكاملة ─── */
                rows.push(`
                    <tr class="specs-detail-row" style="background:rgba(56,189,248,.02);">
                        <td colspan="10" style="padding:12px;text-align:right;">
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:11px;color:#bdc8d6;">
                                <div><span style="color:#8d99a8;">Peak Power:</span> <strong>${this.format(s.power.peak_watts, 0)} W</strong></div>
                                <div><span style="color:#8d99a8;">Frequency:</span> <strong>${this.escape(s.frequency.range_text)}</strong></div>
                                <div><span style="color:#8d99a8;">Coverage:</span> <strong>${this.escape(s.coverage.pattern_text)}</strong></div>
                                <div><span style="color:#8d99a8;">Impedance:</span> <strong>${this.format(s.electrical.impedance_ohms, 1)} Ω</strong></div>
                                <div><span style="color:#8d99a8;">Weight:</span> <strong>${this.format(s.physical.weight_kg, 1)} kg</strong></div>
                                <div><span style="color:#8d99a8;">Mounting:</span> <strong>${this.escape(s.physical.mounting)}</strong></div>
                            </div>
                        </td>
                    </tr>
                `);
            });

            /* ─── صف الإجمالي ─── */
            rows.push(`
                <tr style="background:rgba(230,0,18,.06);font-weight:800;">
                    <td colspan="4" style="text-align:right;">الإجمالي</td>
                    <td>${model.speakerCount}</td>
                    <td colspan="2"></td>
                    <td colspan="4"></td>
                </tr>
            `);

            tbody.innerHTML = rows.join("");
        },

        /* ═══════════ Speaker Positions ═══════════ */

        renderSpeakerPositions(model) {
            const tbody = document.getElementById("speakerPositionTableBody");
            if (!tbody) return;

            if (!model.speakers.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align:center;color:#8d99a8;padding:20px;">
                            لا توجد مواقع مسجّلة
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = model.speakers.map((item, i) => {
                const obj = item.layout;
                const specs = item.specs;

                return `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${this.escape(specs.identity.model)}</td>
                        <td>${this.format(obj.x, 2)}</td>
                        <td>${this.format(obj.y, 2)}</td>
                        <td>${this.format(obj.z ?? obj.mountingHeight, 2)}</td>
                        <td>${this.format(obj.rotation, 1)}°</td>
                        <td>${this.escape(specs.physical.mounting)}</td>
                        <td>${this.format(obj.delay, 2)}</td>
                    </tr>
                `;
            }).join("");
        },

        /* ═══════════ Analysis Table ═══════════ */

        renderAnalysisTable(model) {
            const tbody = document.getElementById("analysisTableBody");
            if (!tbody) return;

            const a = model.analysis || {};
            const coverage = this.number(a.coveragePercent ?? a.coverage?.coveragePercent);
            const avgSPL = this.number(a.averageSPL ?? a.coverage?.averageSPL);
            const minSPL = this.number(a.minimumSPL ?? a.coverage?.minimumSPL);
            const maxSPL = this.number(a.maximumSPL ?? a.coverage?.maximumSPL);
            const uniformity = this.number(a.uniformity ?? a.coverage?.uniformity);
            const target = this.number(model.target.spl, 95);

            const row = (label, value, status) => `
                <tr>
                    <td>${this.escape(label)}</td>
                    <td><strong>${value}</strong></td>
                    <td>${status}</td>
                </tr>
            `;

            const coverageStatus = coverage >= 90
                ? '<span style="color:#4ade80;">✓ ممتاز</span>'
                : coverage >= 75
                    ? '<span style="color:#fbbf24;">⚠ مقبول</span>'
                    : '<span style="color:#f87171;">✗ ضعيف</span>';

            const splStatus = minSPL >= target
                ? '<span style="color:#4ade80;">✓ مطابق</span>'
                : '<span style="color:#fbbf24;">⚠ أقل من الهدف</span>';

            const uniformityStatus = uniformity <= 6
                ? '<span style="color:#4ade80;">✓ متجانس</span>'
                : uniformity <= 10
                    ? '<span style="color:#fbbf24;">⚠ مقبول</span>'
                    : '<span style="color:#f87171;">✗ غير متجانس</span>';

            tbody.innerHTML = [
                row("نسبة التغطية", `${this.format(coverage, 1)} %`, coverageStatus),
                row("متوسط SPL", `${this.format(avgSPL, 1)} dB`, "—"),
                row("أدنى SPL", `${this.format(minSPL, 1)} dB`, splStatus),
                row("أقصى SPL", `${this.format(maxSPL, 1)} dB`, "—"),
                row("تفاوت التغطية", `${this.format(uniformity, 1)} dB`, uniformityStatus)
            ].join("");
        },

        /* ═══════════ Warnings ═══════════ */

        renderWarnings(warnings) {
            const container = document.getElementById("warningsContainer");
            if (!container) return;

            if (!Array.isArray(warnings) || warnings.length === 0) {
                container.innerHTML = `
                    <div class="warning-item">
                        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                        <span>لا توجد تحذيرات — التصميم يطابق جميع المعايير الهندسية.</span>
                    </div>
                `;
                return;
            }

            container.innerHTML = warnings.map(w => {
                const level = w.level || "info";
                const cls = level === "critical" ? "warning-item danger" : "warning-item";
                const icon = level === "critical"
                    ? "fa-circle-exclamation"
                    : level === "warning"
                        ? "fa-triangle-exclamation"
                        : "fa-circle-info";

                return `
                    <div class="${cls}">
                        <i class="fa-solid ${icon}" aria-hidden="true"></i>
                        <span>${this.escape(w.message || w.code || "—")}</span>
                    </div>
                `;
            }).join("");
        },

        /* ═══════════ Diagrams ═══════════ */

        renderPlanDiagram(model) {
            const container = document.getElementById("planDiagram");
            if (!container) return;

            /* ─── استخدم canvas إن أمكن ─── */
            const canvas = getCanvasAPI();
            if (canvas && typeof canvas.getDesignData === "function") {
                try {
                    const designData = canvas.getDesignData();
                    /* يمكن استخدام SVG مضمّن لاحقاً */
                } catch { /* ignore */ }
            }

            /* ─── SVG مبني يدوياً ─── */
            const room = model.room;
            const w = this.number(room.width, 20);
            const d = this.number(room.depth, 15);

            const width = 800;
            const height = width * (d / w);

            const svg = `
                <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;background:#0a1017;border-radius:8px;">
                    <defs>
                        <pattern id="reportGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1"/>
                        </pattern>
                    </defs>
                    <rect width="${width}" height="${height}" fill="url(#reportGrid)"/>
                    <rect x="20" y="20" width="${width - 40}" height="${height - 40}"
                          fill="rgba(56,189,248,.03)" stroke="#38bdf8" stroke-width="2"/>

                    ${model.speakers.map((item, i) => {
                        const obj = item.layout;
                        const x = 20 + (this.number(obj.x, 0) / w) * (width - 40);
                        const y = 20 + (this.number(obj.y, 0) / d) * (height - 40);
                        const rot = this.number(obj.rotation, 0);

                        return `
                            <g transform="translate(${x},${y})">
                                <circle r="8" fill="#e60012" stroke="#fff" stroke-width="1.5"/>
                                <line x1="0" y1="0" x2="0" y2="-20"
                                      stroke="#38bdf8" stroke-width="2"
                                      transform="rotate(${rot})"/>
                                <text y="22" fill="#cbd5e1" font-size="10"
                                      text-anchor="middle" font-family="Cairo,sans-serif">
                                    S${i + 1}
                                </text>
                            </g>
                        `;
                    }).join("")}
                </svg>
            `;

            container.innerHTML = svg;
        },

        renderHeatmapDiagram(model) {
            const container = document.getElementById("heatmapDiagram");
            if (!container) return;

            const points = model.analysis?.points;
            const room = model.room;
            const w = this.number(room.width, 20);
            const d = this.number(room.depth, 15);

            if (!Array.isArray(points) || points.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center;padding:40px;color:#8d99a8;">
                        <i class="fa-solid fa-chart-area" style="font-size:32px;margin-bottom:12px;opacity:.5;"></i>
                        <p>لا توجد بيانات تحليل متاحة.</p>
                    </div>
                `;
                return;
            }

            /* ─── حساب النطاق ─── */
            const splValues = points.map(p => p.spl).filter(s => s > 0);
            const minSpl = Math.min(...splValues, 0);
            const maxSpl = Math.max(...splValues, 100);

            const width = 800;
            const height = width * (d / w);
            const cellW = (width - 40) / Math.ceil(w);
            const cellH = (height - 40) / Math.ceil(d);

            const svg = `
                <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;background:#0a1017;border-radius:8px;">
                    ${points.map(point => {
                        const x = 20 + (point.x / w) * (width - 40);
                        const y = 20 + (point.y / d) * (height - 40);

                        /* ─── تدرج أزرق → أصفر → أحمر ─── */
                        const t = maxSpl > minSpl ? (point.spl - minSpl) / (maxSpl - minSpl) : 0;
                        const r = Math.round(255 * Math.min(1, t * 2));
                        const g = Math.round(255 * Math.min(1, (1 - Math.abs(t - 0.5) * 2)));
                        const b = Math.round(255 * Math.min(1, (1 - t) * 2));

                        return `
                            <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}"
                                  fill="rgba(${r},${g},${b},.55)" opacity="${point.covered ? 1 : 0.5}"/>
                        `;
                    }).join("")}
                    <rect x="20" y="20" width="${width - 40}" height="${height - 40}"
                          fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1"/>
                </svg>
            `;

            container.innerHTML = svg;
        },

        /* ═══════════ Narrative ═══════════ */

        buildNarrativeHTML(model) {
            return `
                <p>
                    <strong>المنهجية الهندسية:</strong>
                    يعتمد هذا التصميم على حساب انتشار الموجات الصوتية في الفراغ
                    وفق قانون التربيع العكسي، مع مراعاة زوايا التغطية الأفقية
                    والعمودية لكل سماعة، وارتفاع التركيب، وارتفاع أذن المستمع.
                </p>
                <p>
                    <strong>حساب SPL عند نقطة:</strong>
                    لكل سماعة، يُحسب ضغط الصوت على مسافة معينة كما يلي:
                </p>
                <div class="formula-box" style="direction:ltr;text-align:center;">
                    SPL(d) = SPL_max − 20 · log₁₀(d)
                </div>
                <p>
                    <strong>التراكب الطاقي:</strong>
                    عند وجود عدة سماعات تؤثر على نفس النقطة، يُحسب المجموع
                    لوغاريتمياً (وليس جمعاً خطياً):
                </p>
                <div class="formula-box" style="direction:ltr;text-align:center;">
                    SPL_total = 10 · log₁₀( Σ 10^(SPLᵢ / 10) )
                </div>
                <p>
                    <strong>نسبة التغطية:</strong>
                    تُحسب عبر توليد شبكة نقطية منتظمة فوق مساحة الفراغ،
                    وقياس نسبة النقاط التي تحقق شرط التغطية (SPL ≥ الهدف).
                </p>
                <p>
                    <strong>تحديد المواقع:</strong>
                    يعتمد التوزيع الموزَّع على حساب أبعاد مخروط التغطية عند
                    ارتفاع التركيب، ثم ترتيب السماعات بشبكة منتظمة مع هامش
                    تراكب بين المخاريط لضمان التجانس.
                </p>
            `;
        },

        /* ═══════════ Set Text Helper ═══════════ */

        setText(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value ?? "—";
        },

        /* ═══════════════════════════════════════════════════════
           API العام
           ═══════════════════════════════════════════════════════ */

        /**
         * يملأ صفحة report.html بالبيانات، أو ينتقل إليها.
         * هذا ما يستدعيه report.html عند التحميل.
         */
        async open() {
            /* ─── هل نحن على report.html؟ ─── */
            const isReportPage = document.getElementById("reportHtml") !== null
                             || document.getElementById("planDiagram") !== null;

            if (!isReportPage) {
                /* ─── انتقل إلى report.html ─── */
                window.location.href = "report.html";
                return;
            }

            /* ─── املأ الصفحة ─── */
            try {
                const model = this.renderIntoPage();
                return model;
            } catch (err) {
                console.error("[Report] open failed:", err);
                throw err;
            }
        },

        /**
         * يبني HTML مستقلاً (للتنزيل)
         */
        buildStandaloneHTML() {
            const model = this.buildModel();
            const project = model.project;
            const room = model.room;
            const area = this.number(room.width) * this.number(room.depth);
            const volume = area * this.number(room.height);
            const coverage = this.number(model.analysis.coveragePercent ?? model.analysis.coverage?.coveragePercent);
            const avgSPL = this.number(model.analysis.averageSPL ?? model.analysis.coverage?.averageSPL);

            const style = `
                * { box-sizing: border-box; }
                body { margin: 0; background: #eef1f5; font-family: Arial, sans-serif;
                       color: #17202a; direction: rtl; }
                .page { width: 210mm; min-height: 297mm; margin: 12mm auto;
                        background: #fff; padding: 16mm; box-shadow: 0 8px 40px rgba(0,0,0,.12); }
                h1 { font-size: 34px; margin: 0 0 12px; }
                h2 { font-size: 20px; color: #475467; margin: 0 0 30px; font-weight: 400; }
                .kicker { font-size: 12px; letter-spacing: 2px; color: #667085; margin-bottom: 10px; }
                .cover { border: 2px solid #17202a; padding: 25mm; min-height: 245mm;
                         display: flex; flex-direction: column; justify-content: center; }
                .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 30px; }
                .cover-meta div { border: 1px solid #d0d5dd; padding: 12px; border-radius: 8px; }
                .cover-meta small { display: block; color: #667085; margin-bottom: 5px; font-size: 11px; }
                .section { margin-top: 15mm; }
                .section-title { display: flex; align-items: center; gap: 10px;
                                 border-bottom: 2px solid #17202a; padding-bottom: 8px; margin-bottom: 15px; }
                .section-title span { display: inline-flex; width: 30px; height: 30px;
                                      border-radius: 6px; align-items: center; justify-content: center;
                                      background: #17202a; color: #fff; font-weight: bold; }
                .section-title h2 { margin: 0; font-size: 18px; color: #17202a; }
                .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
                .metric { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px; }
                .metric small { color: #667085; display: block; margin-bottom: 6px; font-size: 11px; }
                .metric strong { font-size: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
                th { background: #17202a; color: #fff; padding: 8px; text-align: center; }
                td { border: 1px solid #d0d5dd; padding: 7px; text-align: center; }
                tbody tr:nth-child(even) { background: #f8fafc; }
                .narrative { line-height: 1.8; font-size: 12px; }
                .narrative p { margin: 0 0 10px; }
                .status-box { border: 2px solid #17202a; padding: 15px; border-radius: 10px; margin-top: 15px; }
                .footer { margin-top: 15mm; padding-top: 10px; border-top: 1px solid #d0d5dd;
                          display: flex; justify-content: space-between; font-size: 10px; color: #667085; }
                @media print { @page { size: A4; margin: 0; } body { background: #fff; } .page { margin: 0; box-shadow: none; } }
            `;

            const specsRow = (s) => `
                <tr>
                    <td>${this.escape(s.identity.manufacturer)}</td>
                    <td>${this.escape(s.identity.model)}</td>
                    <td>${this.format(s.power.rms_watts, 0)} W</td>
                    <td>${this.format(s.power.peak_watts, 0)} W</td>
                    <td>${this.format(s.acoustics.max_spl_db, 1)} dB</td>
                    <td>${this.format(s.acoustics.sensitivity_db, 1)} dB</td>
                    <td>${this.escape(s.frequency.range_text)}</td>
                    <td>${this.escape(s.coverage.pattern_text)}</td>
                    <td>${this.format(s.electrical.impedance_ohms, 1)} Ω</td>
                    <td>${this.format(s.physical.weight_kg, 1)} kg</td>
                </tr>
            `;

            const positionsRow = (item, i) => {
                const obj = item.layout;
                const s = item.specs;
                return `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${this.escape(s.identity.model)}</td>
                        <td>${this.format(obj.x, 2)}</td>
                        <td>${this.format(obj.y, 2)}</td>
                        <td>${this.format(obj.z ?? obj.mountingHeight, 2)}</td>
                        <td>${this.format(obj.rotation, 1)}°</td>
                        <td>${this.escape(s.physical.mounting)}</td>
                    </tr>
                `;
            };

            return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${this.escape(project.name)} — التقرير الهندسي</title>
<style>${style}</style>
</head>
<body>

<div class="page">
    <div class="cover">
        <div class="kicker">ACOUSTIC ENGINEERING</div>
        <h1>التقرير الهندسي للنظام الصوتي</h1>
        <h2>تقرير تصميم وتحليل وتوزيع الأنظمة الصوتية</h2>

        <div class="cover-meta">
            <div><small>المشروع</small><strong>${this.escape(project.name)}</strong></div>
            <div><small>العميل</small><strong>${this.escape(project.client)}</strong></div>
            <div><small>الموقع</small><strong>${this.escape(project.location)}</strong></div>
            <div><small>النوع</small><strong>${this.escape(project.venue)}</strong></div>
        </div>

        <div class="status-box">
            <strong>حالة التصميم: </strong>${this.escape(model.status.label)}
        </div>

        <div class="footer">
            <span>Acoustic Engineering v${this.escape(model.meta.version)}</span>
            <span>${this.escape(model.meta.reportNumber)} — ${this.escape(model.meta.date)}</span>
        </div>
    </div>
</div>

<div class="page">
    <section class="section">
        <div class="section-title"><span>1</span><h2>الملخص التنفيذي</h2></div>
        <div class="grid4">
            <div class="metric"><small>المساحة</small><strong>${this.format(area, 1)} m²</strong></div>
            <div class="metric"><small>الحجم</small><strong>${this.format(volume, 1)} m³</strong></div>
            <div class="metric"><small>السماعات</small><strong>${model.speakerCount}</strong></div>
            <div class="metric"><small>التغطية</small><strong>${this.format(coverage, 1)}%</strong></div>
        </div>
        <div class="narrative" style="margin-top:20px;">
            <p>مشروع <strong>${this.escape(project.name)}</strong> بأبعاد
               ${this.format(room.width, 2)} × ${this.format(room.depth, 2)} × ${this.format(room.height, 2)} متر.</p>
            <p>عدد السماعات: <strong>${model.speakerCount}</strong>${model.totals.power ? ` بإجمالي قدرة <strong>${this.format(model.totals.power, 0)} W</strong>` : ""}.</p>
            ${coverage ? `<p>نسبة التغطية: <strong>${this.format(coverage, 1)}%</strong>${avgSPL ? ` — متوسط SPL: <strong>${this.format(avgSPL, 1)} dB</strong>` : ""}.</p>` : ""}
        </div>
    </section>

    <section class="section">
        <div class="section-title"><span>2</span><h2>بيانات الفراغ</h2></div>
        <table>
            <thead><tr><th>البند</th><th>القيمة</th></tr></thead>
            <tbody>
                <tr><td>العرض</td><td>${this.format(room.width, 2)} m</td></tr>
                <tr><td>العمق</td><td>${this.format(room.depth, 2)} m</td></tr>
                <tr><td>الارتفاع</td><td>${this.format(room.height, 2)} m</td></tr>
                <tr><td>المساحة</td><td>${this.format(area, 1)} m²</td></tr>
                <tr><td>الحجم</td><td>${this.format(volume, 1)} m³</td></tr>
            </tbody>
        </table>
    </section>
</div>

<div class="page">
    <section class="section">
        <div class="section-title"><span>3</span><h2>مواصفات السماعات</h2></div>
        ${model.speakers.length ? `
        <table>
            <thead>
                <tr>
                    <th>الشركة</th>
                    <th>الموديل</th>
                    <th>RMS</th>
                    <th>Peak</th>
                    <th>Max SPL</th>
                    <th>الحساسية</th>
                    <th>الترددات</th>
                    <th>التغطية</th>
                    <th>المعاوقة</th>
                    <th>الوزن</th>
                </tr>
            </thead>
            <tbody>
                ${model.speakers.map(w => specsRow(w.specs)).join("")}
            </tbody>
        </table>
        ` : "<p>لا توجد سماعات.</p>"}
    </section>
</div>

<div class="page">
    <section class="section">
        <div class="section-title"><span>4</span><h2>مواقع السماعات</h2></div>
        ${model.speakers.length ? `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>الموديل</th>
                    <th>X</th>
                    <th>Y</th>
                    <th>Z</th>
                    <th>الدوران</th>
                    <th>التثبيت</th>
                </tr>
            </thead>
            <tbody>
                ${model.speakers.map((item, i) => positionsRow(item, i)).join("")}
            </tbody>
        </table>
        ` : "<p>لا توجد مواقع.</p>"}
    </section>

    <section class="section">
        <div class="section-title"><span>5</span><h2>التحليل الهندسي</h2></div>
        <table>
            <thead><tr><th>المؤشر</th><th>القيمة</th></tr></thead>
            <tbody>
                <tr><td>نسبة التغطية</td><td>${this.format(coverage, 1)} %</td></tr>
                <tr><td>متوسط SPL</td><td>${this.format(avgSPL, 1)} dB</td></tr>
                <tr><td>أدنى SPL</td><td>${this.format(model.analysis.minimumSPL ?? model.analysis.coverage?.minimumSPL, 1)} dB</td></tr>
                <tr><td>أقصى SPL</td><td>${this.format(model.analysis.maximumSPL ?? model.analysis.coverage?.maximumSPL, 1)} dB</td></tr>
                <tr><td>تفاوت التغطية</td><td>${this.format(model.analysis.uniformity ?? model.analysis.coverage?.uniformity, 1)} dB</td></tr>
            </tbody>
        </table>
    </section>
</div>

<div class="page">
    <section class="section">
        <div class="section-title"><span>6</span><h2>المنهجية والحسابات</h2></div>
        <div class="narrative">${this.buildNarrativeHTML(model)}</div>
    </section>

    <div class="footer">
        <span>Acoustic Engineering v${this.escape(model.meta.version)}</span>
        <span>${this.escape(model.meta.reportNumber)}</span>
    </div>
</div>

</body>
</html>`;
        },

        /**
         * طباعة التقرير (من نفس الصفحة)
         */
        print() {
            /* ─── إن لم نكن على report.html، انتقل ─── */
            const isReportPage = document.getElementById("reportHtml") !== null;
            if (!isReportPage) {
                sessionStorage.setItem("ae_print_after_load", "1");
                window.location.href = "report.html";
                return false;
            }

            /* ─── اطبع ─── */
            try {
                window.print();
                return true;
            } catch (err) {
                console.error("[Report] print failed:", err);
                return false;
            }
        },

        /**
         * تنزيل HTML مستقل
         */
        downloadHTML() {
            try {
                const html = this.buildStandaloneHTML();
                const blob = new Blob([html], { type: "text/html;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                const project = this.getProjectInfo();

                const safeName = (project.name || "acoustic-report")
                    .replace(/[^\w\u0600-\u06FF-]+/g, "_")
                    .slice(0, 60);

                link.href = url;
                link.download = `${safeName}_report.html`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);

                this.toast("✓ تم تنزيل التقرير");
                return true;
            } catch (err) {
                console.error("[Report] downloadHTML failed:", err);
                this.toast("تعذّر تنزيل التقرير");
                return false;
            }
        },

        /**
         * تنزيل JSON
         */
        downloadJSON() {
            try {
                const model = this.buildModel();
                /* ─── نظّف من الدورات ─── */
                const sanitized = JSON.parse(JSON.stringify(model, (key, value) => {
                    if (key === "points" && Array.isArray(value) && value.length > 5000) {
                        return value.slice(0, 5000);
                    }
                    return value;
                }, 2));

                const json = JSON.stringify(sanitized, null, 2);
                const blob = new Blob([json], { type: "application/json;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `AE-report-${Date.now()}.json`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);

                this.toast("✓ تم تنزيل البيانات");
                return true;
            } catch (err) {
                console.error("[Report] downloadJSON failed:", err);
                this.toast("تعذّر تنزيل البيانات");
                return false;
            }
        },

        /* ═══════════ Toast ═══════════ */

        toast(msg, type = "info") {
            const container = document.getElementById("toastContainer");
            if (!container) {
                /* fallback: alert */
                try { alert(msg); } catch { /* ignore */ }
                return;
            }

            const el = document.createElement("div");
            el.className = "toast " + type;
            el.textContent = msg;
            container.appendChild(el);

            setTimeout(() => {
                el.style.opacity = "0";
                el.style.transform = "translateY(8px)";
                setTimeout(() => el.remove(), 250);
            }, 3000);
        },

        /* ═══════════ UI Bindings ═══════════ */

        bindUI() {
            const bind = (selectors, handler) => {
                selectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(btn => {
                        if (btn.dataset.reportBound === "1") return;
                        btn.dataset.reportBound = "1";
                        btn.addEventListener("click", handler);
                    });
                });
            };

            bind([
                "#generateReportBtn",
                "[data-action='generate-report']"
            ], (e) => {
                e.preventDefault();
                this.open();
            });

            bind([
                "#printReportBtn",
                "[data-action='print-report']"
            ], (e) => {
                e.preventDefault();
                this.print();
            });

            bind([
                "#downloadReportBtn",
                "[data-action='download-report']"
            ], (e) => {
                e.preventDefault();
                this.downloadHTML();
            });

            bind([
                "#exportReportJSONBtn",
                "[data-action='export-report-json']"
            ], (e) => {
                e.preventDefault();
                this.downloadJSON();
            });

            bind([
                "#backToAppBtn",
                "[data-action='back-to-app']"
            ], (e) => {
                e.preventDefault();
                if (document.referrer) {
                    history.back();
                } else {
                    window.location.href = "app.html";
                }
            });
        },

        /* ═══════════ Init ═══════════ */

        init() {
            try {
                this.bindUI();

                /* ─── هل يجب الطباعة بعد التحميل؟ ─── */
                let shouldPrint = false;
                try {
                    shouldPrint = sessionStorage.getItem("ae_print_after_load") === "1";
                    if (shouldPrint) sessionStorage.removeItem("ae_print_after_load");
                } catch { /* ignore */ }

                /* ─── إن كنا على report.html، املأ الصفحة ─── */
                const isReportPage = document.getElementById("reportHtml") !== null;
                if (isReportPage) {
                    /* انتظر قليلاً للسماح للوحدات الأخرى بالتحميل */
                    setTimeout(() => {
                        try {
                            this.renderIntoPage();
                            if (shouldPrint) setTimeout(() => this.print(), 400);
                        } catch (err) {
                            console.error("[Report] auto-render failed:", err);
                        }
                    }, 300);
                }

                window.dispatchEvent(new CustomEvent("report:ready", {
                    detail: { version: this.version }
                }));
            } catch (err) {
                console.error("[Report] init failed:", err);
            }
        }
    };

    /* ═══════════════ Exposure ═══════════════ */
    AE.report = Report;
    window.AcousticReport = Report;

    /* ═══════════════ Auto-init ═══════════════ */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => Report.init());
    } else {
        Report.init();
    }

    console.log("[report.js] v2.0.0 جاهز — يعرض مواصفات السماعة كاملة");

})();
