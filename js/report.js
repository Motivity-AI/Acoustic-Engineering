/* ============================================================
   Acoustic Engineering — js/report.js
   Engineering Report Generator
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

    const Report = {
        version: "1.0",

        number(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; },
        round(v, d = 2) { const f = Math.pow(10, d); return Math.round(v * f) / f; },
        escape(v) {
            return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        },
        format(v, d = 2) {
            const n = Number(v);
            if (!Number.isFinite(n)) return "—";
            return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
        },
        date() { return new Date().toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" }); },
        time() { return new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }); },

        getData() {
            if (AE.engine && typeof AE.engine.getDesignData === "function") return AE.engine.getDesignData();
            return { room: {}, stage: {}, audience: {}, target: {}, design: {}, speakers: [], analysis: null };
        },

        getProjectInfo() {
            const ids = ["projectName", "clientName", "projectLocation", "venueType"];
            const result = {};
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) result[id] = el.value || el.textContent || "";
            });
            return {
                name: result.projectName || "مشروع هندسة صوتية",
                client: result.clientName || "—",
                location: result.projectLocation || "—",
                venue: result.venueType || "—"
            };
        },

        getStatus(analysis) {
            if (!analysis) return { key: "unknown", label: "غير محلل" };
            const coverage = this.number(analysis.coveragePercent ?? analysis.coverage?.coveragePercent);
            const spl = this.number(analysis.minimumSPL ?? analysis.coverage?.minimumSPL);
            const target = this.number(analysis.targetSPL ?? analysis.coverage?.targetSPL, 85);
            if (coverage < 70 || spl < target - 6) return { key: "critical", label: "يحتاج مراجعة هندسية" };
            if (coverage < 90 || spl < target) return { key: "review", label: "مقبول مع مراجعة" };
            return { key: "good", label: "ضمن الأهداف" };
        },

        buildModel() {
            const data = this.getData();
            const project = this.getProjectInfo();
            const analysis = data.analysis || {};
            const speakers = Array.isArray(data.speakers) ? data.speakers : [];
            let bom = [];
            if (AE.engine && typeof AE.engine.generateBOM === "function") {
                bom = AE.engine.generateBOM(speakers);
            }
            return {
                meta: {
                    title: "تقرير هندسي للنظام الصوتي",
                    generatedAt: new Date().toISOString(),
                    date: this.date(), time: this.time(), version: this.version
                },
                project, room: data.room || {}, stage: data.stage || {},
                audience: data.audience || {}, target: data.target || {},
                design: data.design || {}, speakers, bom, analysis,
                status: this.getStatus(analysis)
            };
        },

        buildHTML() {
            const model = this.buildModel();
            const room = model.room;
            const area = this.number(room.width) * this.number(room.depth);
            const volume = area * this.number(room.height);
            const coverage = this.number(model.analysis.coveragePercent ?? model.analysis.coverage?.coveragePercent);
            const avgSPL = this.number(model.analysis.averageSPL ?? model.analysis.coverage?.averageSPL);
            const spkCount = model.speakers.length;

            const esc = (s) => this.escape(s);
            const fmt = (n, d) => this.format(n, d);

            return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${esc(model.project.name)} - التقرير الهندسي</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; background: #eef1f5; font-family: Arial, sans-serif; color: #17202a; direction: rtl; }
.page { width: 210mm; min-height: 297mm; margin: 12mm auto; background: #fff; padding: 16mm; box-shadow: 0 8px 40px rgba(0,0,0,.12); }
h1 { font-size: 36px; margin: 0 0 15px; }
h2 { font-size: 22px; color: #475467; margin: 0 0 40px; font-weight: 400; }
.kicker { font-size: 13px; letter-spacing: 2px; color: #667085; margin-bottom: 12px; }
.cover { border: 2px solid #17202a; padding: 25mm; min-height: 245mm; display: flex; flex-direction: column; justify-content: center; }
.cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 30px; }
.cover-meta div { border: 1px solid #d0d5dd; padding: 12px; border-radius: 8px; }
.cover-meta small { display: block; color: #667085; margin-bottom: 5px; font-size: 11px; }
.section { margin-top: 20mm; page-break-inside: avoid; }
.section-title { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #17202a; padding-bottom: 8px; margin-bottom: 15px; }
.section-title span { display: inline-flex; width: 30px; height: 30px; border-radius: 6px; align-items: center; justify-content: center; background: #17202a; color: #fff; font-weight: bold; }
.section-title h2 { margin: 0; font-size: 20px; color: #17202a; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.metric { border: 1px solid #d0d5dd; border-radius: 8px; padding: 14px; }
.metric small { color: #667085; display: block; margin-bottom: 6px; font-size: 11px; }
.metric strong { font-size: 22px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { background: #17202a; color: #fff; padding: 9px; text-align: center; }
td { border: 1px solid #d0d5dd; padding: 8px; text-align: center; }
tbody tr:nth-child(even) { background: #f8fafc; }
.narrative { line-height: 1.9; font-size: 13px; }
.narrative p { margin: 0 0 10px; }
.status-box { border: 2px solid #17202a; padding: 18px; border-radius: 10px; margin-top: 15px; }
.footer { margin-top: 20mm; padding-top: 10px; border-top: 1px solid #d0d5dd; display: flex; justify-content: space-between; font-size: 10px; color: #667085; }
@media print { @page { size: A4; margin: 0; } body { background: #fff; } .page { margin: 0; box-shadow: none; } }
</style>
</head>
<body>

<div class="page">
    <div class="cover">
        <div class="kicker">ACOUSTIC ENGINEERING</div>
        <h1>التقرير الهندسي للنظام الصوتي</h1>
        <h2>تقرير تصميم وتحليل النظام الصوتي</h2>
        <div class="cover-meta">
            <div><small>المشروع</small><strong>${esc(model.project.name)}</strong></div>
            <div><small>العميل</small><strong>${esc(model.project.client)}</strong></div>
            <div><small>الموقع</small><strong>${esc(model.project.location)}</strong></div>
            <div><small>النوع</small><strong>${esc(model.project.venue)}</strong></div>
        </div>
        <div class="status-box">
            <strong>حالة التصميم: </strong>${esc(model.status.label)}
        </div>
        <div class="footer">
            <span>Acoustic Engineering</span>
            <span>${esc(model.meta.date)}</span>
        </div>
    </div>
</div>

<div class="page">
    <section class="section">
        <div class="section-title"><span>1</span><h2>الملخص التنفيذي</h2></div>
        <div class="grid4">
            <div class="metric"><small>المساحة</small><strong>${fmt(area, 1)} m²</strong></div>
            <div class="metric"><small>السماعات</small><strong>${spkCount}</strong></div>
            <div class="metric"><small>التغطية</small><strong>${fmt(coverage, 1)}%</strong></div>
            <div class="metric"><small>متوسط SPL</small><strong>${fmt(avgSPL, 1)} dB</strong></div>
        </div>
        <div class="narrative" style="margin-top:20px;">
            <p>تم إعداد هذا التقرير لمشروع ${esc(model.project.name)}.</p>
            <p>أبعاد الفراغ ${fmt(room.width)} × ${fmt(room.depth)} × ${fmt(room.height)} متر، بمساحة تقريبية ${fmt(area)} م² وحجم ${fmt(volume)} م³.</p>
            <p>تم استخدام ${spkCount} سماعة في التصميم الحالي.</p>
            <p>هذه الحسابات تمثل تقديرًا هندسيًا أوليًا ويعتمد على بيانات المشروع.</p>
        </div>
    </section>

    <section class="section">
        <div class="section-title"><span>2</span><h2>بيانات الفراغ</h2></div>
        <table>
            <thead><tr><th>البند</th><th>القيمة</th><th>الوحدة</th></tr></thead>
            <tbody>
                <tr><td>العرض</td><td>${fmt(room.width)}</td><td>m</td></tr>
                <tr><td>العمق</td><td>${fmt(room.depth)}</td><td>m</td></tr>
                <tr><td>الارتفاع</td><td>${fmt(room.height)}</td><td>m</td></tr>
                <tr><td>المساحة</td><td>${fmt(area)}</td><td>m²</td></tr>
                <tr><td>الحجم</td><td>${fmt(volume)}</td><td>m³</td></tr>
            </tbody>
        </table>
    </section>
</div>

<div class="page">
    <section class="section">
        <div class="section-title"><span>3</span><h2>التحليل الهندسي</h2></div>
        <table>
            <thead><tr><th>المؤشر</th><th>النتيجة</th><th>الوحدة</th></tr></thead>
            <tbody>
                <tr><td>نسبة التغطية</td><td>${fmt(coverage, 1)}</td><td>%</td></tr>
                <tr><td>متوسط SPL</td><td>${fmt(avgSPL, 1)}</td><td>dB</td></tr>
                <tr><td>أقل SPL</td><td>${fmt(model.analysis.minimumSPL, 1)}</td><td>dB</td></tr>
                <tr><td>أعلى SPL</td><td>${fmt(model.analysis.maximumSPL, 1)}</td><td>dB</td></tr>
                <tr><td>فرق التغطية</td><td>${fmt(model.analysis.uniformity, 1)}</td><td>dB</td></tr>
            </tbody>
        </table>
    </section>

    <section class="section">
        <div class="section-title"><span>4</span><h2>السماعات</h2></div>
        ${model.speakers.length ? `
        <table>
            <thead><tr><th>#</th><th>الموديل</th><th>X</th><th>Y</th><th>Z</th><th>Rotation</th></tr></thead>
            <tbody>
                ${model.speakers.map((s, i) => `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${esc(s.model)}</td>
                        <td>${fmt(s.x, 2)} m</td>
                        <td>${fmt(s.y, 2)} m</td>
                        <td>${fmt(s.z || s.mountingHeight, 2)} m</td>
                        <td>${fmt(s.rotation, 1)}°</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>` : "<p>لا توجد سماعات.</p>"}
    </section>
</div>

<div class="page">
    <section class="section">
        <div class="section-title"><span>5</span><h2>الخلاصة</h2></div>
        <div class="status-box">
            <p>حالة التصميم: <strong>${esc(model.status.label)}</strong></p>
            <p>عدد السماعات: <strong>${spkCount}</strong></p>
            <p>التغطية: <strong>${fmt(coverage, 1)}%</strong></p>
        </div>
        <p style="margin-top:20px; font-size:11px; color:#667085; line-height:1.8;">
            هذا التقرير ناتج عن نموذج حسابي هندسي أولي. النتائج الفعلية قد تتأثر بالانعكاسات والامتصاص والظروف الميدانية.
            يوصى بالتحقق الميداني قبل اعتماد التنفيذ.
        </p>
    </section>

    <div class="footer">
        <span>Acoustic Engineering</span>
        <span>${esc(model.meta.date)}</span>
    </div>
</div>

</body>
</html>`;
        },

        open() {
            const html = this.buildHTML();
            const w = window.open("", "_blank", "width=1200,height=900");
            if (!w) { this.toast("يرجى السماح بالنوافذ المنبثقة."); return null; }
            w.document.open();
            w.document.write(html);
            w.document.close();
            return w;
        },

        print() {
            const w = this.open();
            if (!w) return false;
            w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 500);
            return true;
        },

        downloadHTML() {
            const html = this.buildHTML();
            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const project = this.getProjectInfo();
            link.href = url;
            link.download = (project.name || "acoustic-report").replace(/[^\w\u0600-\u06FF-]+/g, "_") + "_report.html";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return true;
        },

        downloadJSON() {
            const model = this.buildModel();
            const json = JSON.stringify(model, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "acoustic-engineering-report.json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return true;
        },

        toast(msg) {
            const c = document.getElementById("toastContainer");
            if (!c) { alert(msg); return; }
            const t = document.createElement("div");
            t.className = "toast";
            t.textContent = msg;
            c.appendChild(t);
            setTimeout(() => t.remove(), 3000);
        },

        bindUI() {
            document.querySelectorAll("#generateReportBtn, [data-action='generate-report']").forEach(btn => {
                btn.addEventListener("click", () => this.open());
            });
            document.querySelectorAll("#printReportBtn, [data-action='print-report']").forEach(btn => {
                btn.addEventListener("click", () => this.print());
            });
            document.querySelectorAll("#downloadReportBtn, [data-action='download-report']").forEach(btn => {
                btn.addEventListener("click", () => this.downloadHTML());
            });
            document.querySelectorAll("#exportReportJSONBtn, [data-action='export-report-json']").forEach(btn => {
                btn.addEventListener("click", () => this.downloadJSON());
            });
        }
    };

    AE.report = Report;
    window.AcousticReport = Report;

    function init() {
        try {
            Report.bindUI();
            window.dispatchEvent(new CustomEvent("report:ready", { detail: { version: Report.version } }));
        } catch (e) { console.error("Report init failed:", e); }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else { init(); }
})();
