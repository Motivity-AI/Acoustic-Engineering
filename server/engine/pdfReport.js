/* ============================================================
   Acoustic Engineering — server/engine/pdfReport.js v2.0.0
   تقرير PDF هندسي مع دعم كامل للعربية + مواصفات كاملة للسماعة
   ============================================================ */
"use strict";

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/* ═══════════════ إعداد الخط العربي ═══════════════ */
/*
   يجب توفير خط يدعم العربية في مجلد ./fonts/
   - Cairo-Regular.ttf
   - Cairo-Bold.ttf
   
   تحميل من: https://fonts.google.com/specimen/Cairo
*/
const FONTS_DIR = path.join(__dirname, "..", "..", "fonts");
const FONT_REGULAR_PATH = path.join(FONTS_DIR, "Cairo-Regular.ttf");
const FONT_BOLD_PATH    = path.join(FONTS_DIR, "Cairo-Bold.ttf");

let FONTS_AVAILABLE = false;
try {
    FONTS_AVAILABLE = fs.existsSync(FONT_REGULAR_PATH)
                   && fs.existsSync(FONT_BOLD_PATH);
} catch { /* ignore */ }

if (!FONTS_AVAILABLE) {
    console.warn(
        "[pdfReport] ⚠️  خطوط Cairo غير متوفرة في ./fonts/\n" +
        "   النصوص العربية لن تُعرض بشكل صحيح.\n" +
        "   حمّل Cairo-Regular.ttf و Cairo-Bold.ttf من Google Fonts."
    );
}

/* ═══════════════ معالجة النص العربي ═══════════════ */
/*
   PDFKit لا يدعم Arabic Shaping (وصل الحروف) ولا RTL.
   نحتاج مكتبة خارجية. نجرّب عدة مكتبات.
*/
let reshapeArabic = (text) => text;   // fallback

try {
    const reshaper = require("arabic-persian-reshaper");
    if (typeof reshaper.convertArabic === "function") {
        reshapeArabic = (text) => reshaper.convertArabic(String(text));
    }
} catch {
    try {
        const reshaper = require("arabic-reshaper");
        if (typeof reshaper.convertArabic === "function") {
            reshapeArabic = (text) => reshaper.convertArabic(String(text));
        }
    } catch {
        // لا مكتبة — نستخدم النص كما هو
        // سيُعرض النص العربي مقلوباً/بدون وصل
    }
}

/**
 * يعالج النص: تشكيل + اتجاه RTL
 */
function processText(text) {
    if (text === undefined || text === null) return "";

    const str = String(text);

    // إذا كان النص لاتينياً فقط → لا حاجة لمعالجة
    if (!/[\u0600-\u06FF]/.test(str)) return str;

    try {
        // 1. إعادة تشكيل الحروف العربية
        const reshaped = reshapeArabic(str);

        // 2. عكس الكلمات لعرض RTL صحيح (PDFKit يرسم LTR)
        return reshaped.split(" ").reverse().join(" ");
    } catch {
        return str;
    }
}

/* ═══════════════ Helpers ═══════════════ */

/**
 * تحويل آمن للنص
 */
function safe(v, fb = "-") {
    if (v === undefined || v === null || v === "") return fb;
    return v;
}

/**
 * تنسيق رقم بأمان (لا NaN، لا long decimals)
 */
function safeNumber(v, decimals = 2, fb = "0") {
    const n = Number(v);
    if (!Number.isFinite(n)) return fb;
    return n.toFixed(decimals);
}

/**
 * تنسيق رقم كعدد صحيح
 */
function safeInt(v, fb = "0") {
    const n = Number(v);
    if (!Number.isFinite(n)) return fb;
    return String(Math.round(n));
}

/**
 * تنسيق التاريخ بشكل ثابت (ISO)
 */
function formatDate(d = new Date()) {
    try {
        const date = d instanceof Date ? d : new Date(d);
        return date.toISOString().slice(0, 19).replace("T", " ");
    } catch {
        return "-";
    }
}

/**
 * رسم خط فاصل
 */
function drawLine(doc, y) {
    const pos = y === undefined ? doc.y : y;
    doc.save()
       .strokeColor("#cccccc")
       .lineWidth(0.5)
       .moveTo(doc.page.margins.left, pos)
       .lineTo(doc.page.width - doc.page.margins.right, pos)
       .stroke()
       .restore();
    doc.moveDown(0.5);
}

/* ═══════════════ الأنماط ═══════════════ */
const STYLE = {
    title:     { size: 22, bold: true,  align: "center", color: "#0b0f14" },
    subtitle:  { size: 13, bold: false, align: "center", color: "#4b5563" },
    heading:   { size: 14, bold: true,  color: "#0b0f14" },
    subhead:   { size: 11, bold: true,  color: "#1f2937" },
    body:      { size: 10, bold: false, color: "#374151" },
    small:     { size: 9,  bold: false, color: "#6b7280" },
    tiny:      { size: 8,  bold: false, color: "#9ca3af" },
    danger:    { size: 10, bold: true,  color: "#e60012" },
    success:   { size: 10, bold: true,  color: "#16a34a" }
};

/* ═══════════════ إدارة الصفحات ═══════════════ */
class PageManager {
    constructor(doc) {
        this.doc = doc;
        this.pageNumber = 1;
        this.totalPages = 0;
    }

    /**
     * إضافة رقم الصفحة أسفل الصفحة الحالية
     * (يُستدعى عند الانتقال للصفحة التالية أو عند الإنهاء)
     */
    stampFooter() {
        const doc = this.doc;
        const bottom = doc.page.height - 30;
        const oldY = doc.y;

        doc.save()
           .font(this.boldFont || this.regularFont || "Helvetica")
           .fontSize(8)
           .fillColor("#9ca3af");

        // يسار: اسم التطبيق
        doc.text(
            processText("Acoustic Engineering"),
            doc.page.margins.left,
            bottom,
            { width: 200, align: "left" }
        );

        // يمين: رقم الصفحة
        doc.text(
            `Page ${this.pageNumber}`,
            doc.page.width - doc.page.margins.right - 100,
            bottom,
            { width: 100, align: "right" }
        );

        doc.restore();
        doc.y = oldY;
    }

    newPage() {
        this.stampFooter();
        this.doc.addPage();
        this.pageNumber++;
    }

    finish() {
        this.stampFooter();
    }
}

/* ═══════════════ التسجيل على PDFDocument ═══════════════ */

/**
 * يُسجّل الخطوط على الوثيقة ويعيد أسماءها
 */
function registerFonts(doc) {
    const fonts = {
        regular: "Helvetica",
        bold: "Helvetica-Bold"
    };

    if (FONTS_AVAILABLE) {
        try {
            doc.registerFont("Cairo-Regular", FONT_REGULAR_PATH);
            doc.registerFont("Cairo-Bold", FONT_BOLD_PATH);
            fonts.regular = "Cairo-Regular";
            fonts.bold = "Cairo-Bold";
        } catch (err) {
            console.warn("[pdfReport] فشل تسجيل خطوط Cairo:", err.message);
        }
    }

    return fonts;
}

/**
 * يكتب نصاً بنمط محدد
 */
function writeText(doc, text, style = STYLE.body, fonts, options = {}) {
    const fontName = style.bold ? fonts.bold : fonts.regular;
    const opts = Object.assign({}, style, options);
    delete opts.bold;

    doc.fontSize(style.size)
       .font(fontName)
       .fillColor(style.color || "#000000")
       .text(processText(text), opts);
}

/* ═══════════════ الأقسام ═══════════════ */

function addCoverPage(doc, project, user, fonts) {
    doc.moveDown(6);

    writeText(doc, "ACOUSTIC ENGINEERING", STYLE.title, fonts);
    doc.moveDown(0.5);

    writeText(doc, "تقرير هندسي للنظام الصوتي", STYLE.subtitle, fonts);
    doc.moveDown(0.3);

    writeText(doc, "Professional Sound System Design Report", STYLE.small, fonts);
    doc.moveDown(4);

    /* ─── اسم المشروع ─── */
    writeText(doc, safe(project?.name, "مشروع بدون اسم"), {
        size: 18, bold: true, align: "center", color: "#0b0f14"
    }, fonts);

    doc.moveDown(2);

    /* ─── تفاصيل صغيرة ─── */
    writeText(doc, `Generated: ${formatDate()}`, STYLE.small, fonts, { align: "center" });

    if (project?.project_type) {
        writeText(doc, `Project Type: ${project.project_type}`,
            STYLE.tiny, fonts, { align: "center" });
    }

    if (user?.name) {
        writeText(doc, `Engineer: ${user.name}`,
            STYLE.tiny, fonts, { align: "center" });
    }
}

function addProjectInfo(doc, project, user, fonts) {
    writeText(doc, "1. Project Information | معلومات المشروع", STYLE.heading, fonts);
    doc.moveDown(0.5);

    writeText(doc, `Project:  ${safe(project?.name)}`, STYLE.body, fonts);
    writeText(doc, `Type:     ${safe(project?.project_type)}`, STYLE.body, fonts);
    writeText(doc, `Client:   ${safe(user?.name)}`, STYLE.body, fonts);
    writeText(doc, `Phone:    ${safe(user?.phone)}`, STYLE.body, fonts);
    writeText(doc, `Company:  ${safe(user?.company)}`, STYLE.body, fonts);

    doc.moveDown();
    drawLine(doc);
}

function addRoomGeometry(doc, room, fonts) {
    writeText(doc, "2. Room Geometry | أبعاد الفراغ", STYLE.heading, fonts);
    doc.moveDown(0.5);

    /* ─── استخراج الأبعاد بأمان ─── */
    const width  = safeNumber(room?.width, 2);
    const length = safeNumber(room?.length ?? room?.depth, 2);
    const height = safeNumber(room?.height, 2);

    const area   = room?.area !== undefined
        ? safeNumber(room.area, 2)
        : safeNumber(Number(room?.width || 0) * Number(room?.length || room?.depth || 0), 2);

    const volume = room?.volume !== undefined
        ? safeNumber(room.volume, 2)
        : safeNumber(Number(room?.width || 0) * Number(room?.length || room?.depth || 0) * Number(room?.height || 0), 2);

    writeText(doc, `Width:   ${width} m`, STYLE.body, fonts);
    writeText(doc, `Length:  ${length} m`, STYLE.body, fonts);
    writeText(doc, `Height:  ${height} m`, STYLE.body, fonts);
    writeText(doc, `Area:    ${area} m²`, STYLE.body, fonts);
    writeText(doc, `Volume:  ${volume} m³`, STYLE.body, fonts);

    doc.moveDown();
    drawLine(doc);
}

function addDesignMethod(doc, project, design, fonts) {
    writeText(doc, "3. Design Method | منهجية التصميم", STYLE.heading, fonts);
    doc.moveDown(0.5);

    writeText(doc, `Design Mode:  ${safe(project?.design_mode, "manual")}`, STYLE.body, fonts);
    writeText(doc, `AI Strategy:  ${safe(design?.strategy, "-")}`, STYLE.body, fonts);

    const score = design?.score;
    const scoreText = Number.isFinite(Number(score))
        ? `${safeInt(score)} / 100`
        : "-";

    writeText(doc, `Design Score: ${scoreText}`, STYLE.body, fonts);

    doc.moveDown();
    drawLine(doc);
}

function addAcousticAnalysis(doc, analysis, fonts) {
    writeText(doc, "4. Acoustic Analysis | التحليل الصوتي", STYLE.heading, fonts);
    doc.moveDown(0.5);

    const avg = safeNumber(analysis?.averageSPL, 1);
    const min = safeNumber(analysis?.minimumSPL, 1);
    const max = safeNumber(analysis?.maximumSPL, 1);
    const uni = safeNumber(analysis?.uniformity, 1);

    writeText(doc, `Average SPL:  ${avg} dB`, STYLE.body, fonts);
    writeText(doc, `Minimum SPL:  ${min} dB`, STYLE.body, fonts);
    writeText(doc, `Maximum SPL:  ${max} dB`, STYLE.body, fonts);
    writeText(doc, `Uniformity:   ${uni} %`, STYLE.body, fonts);

    doc.moveDown();
    drawLine(doc);
}

/* ═══════════════ 🎯 قسم مواصفات السماعات (الأهم) ═══════════════ */
/*
   هذا هو القسم الذي يعرض "المواصفات" كما طلبت، لا روابط تحميل.
*/
function addSpeakerSpecifications(doc, speakers, fonts, pageManager) {
    writeText(doc, "5. Speaker Specifications | مواصفات السماعات",
        STYLE.heading, fonts);
    doc.moveDown(0.5);

    if (!Array.isArray(speakers) || speakers.length === 0) {
        writeText(doc, "لا توجد سماعات مُعرَّفة", STYLE.small, fonts);
        doc.moveDown();
        drawLine(doc);
        return;
    }

    speakers.forEach((spk, i) => {
        /* ─── تحقق من مساحة الصفحة ─── */
        if (doc.y > doc.page.height - 150) {
            pageManager.newPage();
        }

        /* ─── عنوان السماعة ─── */
        const manufacturer = safe(spk.manufacturer, "Generic");
        const model = safe(spk.model, `Speaker ${i + 1}`);
        const title = `${i + 1}. ${manufacturer} ${model}`;

        writeText(doc, title, STYLE.subhead, fonts);
        doc.moveDown(0.2);

        /* ─── جدول مواصفات منظّم ─── */
        const rows = [
            ["Category",    safe(spk.category, "-")],
            ["RMS Power",   `${safeNumber(spk.rms_power, 0)} W`],
            ["Peak Power",  `${safeNumber(spk.peak_power, 0)} W`],
            ["Max SPL",     `${safeNumber(spk.max_spl, 1)} dB`],
            ["Sensitivity", `${safeNumber(spk.sensitivity, 1)} dB (1W/1m)`],
            ["Frequency",   `${safeNumber(spk.frequency_min, 0)} – ${safeNumber(spk.frequency_max, 0)} Hz`],
            ["Coverage H",  `${safeNumber(spk.horizontal_coverage, 0)}°`],
            ["Coverage V",  `${safeNumber(spk.vertical_coverage, 0)}°`],
            ["Impedance",   `${safeNumber(spk.impedance, 1)} Ω`],
            ["Weight",      `${safeNumber(spk.weight, 1)} kg`],
            ["Mounting",    safe(spk.mounting_type, "-")]
        ];

        /* ─── ارسم الجدول ─── */
        const startX = doc.page.margins.left + 20;
        const labelWidth = 110;
        const valueWidth = 200;

        rows.forEach(([label, value]) => {
            const y = doc.y;

            // label
            doc.fontSize(9)
               .font(fonts.regular)
               .fillColor("#6b7280")
               .text(processText(label + ":"), startX, y, { width: labelWidth });

            // value
            doc.fontSize(9)
               .font(fonts.bold)
               .fillColor("#111827")
               .text(processText(String(value)), startX + labelWidth, y, { width: valueWidth });

            doc.y = y + 12;
        });

        doc.moveDown(0.6);

        /* ─── خط فاصل بين السماعات ─── */
        if (i < speakers.length - 1) {
            drawLine(doc);
            doc.moveDown(0.3);
        }
    });

    doc.moveDown();
}

/* ═══════════════ Speaker Layout ═══════════════ */
function addSpeakerLayout(doc, layout, fonts, pageManager) {
    writeText(doc, "6. Speaker Layout | مواقع السماعات",
        STYLE.heading, fonts);
    doc.moveDown(0.5);

    if (!Array.isArray(layout) || layout.length === 0) {
        writeText(doc, "لا توجد مواقع محددة", STYLE.small, fonts);
        doc.moveDown();
        drawLine(doc);
        return;
    }

    /* ─── رأس الجدول ─── */
    const cols = [
        { label: "#",        width: 25 },
        { label: "Model",    width: 120 },
        { label: "X (m)",    width: 55 },
        { label: "Y (m)",    width: 55 },
        { label: "Z (m)",    width: 55 },
        { label: "Angle",    width: 55 },
        { label: "Delay",    width: 55 }
    ];

    const startX = doc.page.margins.left;
    let x = startX;

    doc.fontSize(9).font(fonts.bold).fillColor("#111827");
    cols.forEach(col => {
        doc.text(processText(col.label), x, doc.y, { width: col.width });
        x += col.width;
    });

    doc.moveDown(0.3);
    drawLine(doc);

    /* ─── الصفوف ─── */
    layout.forEach((item, i) => {
        if (doc.y > doc.page.height - 100) {
            pageManager.newPage();
        }

        const values = [
            String(i + 1),
            safe(item.model, "-"),
            safeNumber(item.x, 2),
            safeNumber(item.y, 2),
            safeNumber(item.z, 2),
            `${safeNumber(item.angle, 1)}°`,
            `${safeNumber(item.delay, 2)} ms`
        ];

        x = startX;
        const y = doc.y;

        values.forEach((val, j) => {
            doc.fontSize(9)
               .font(fonts.regular)
               .fillColor("#374151")
               .text(processText(String(val)), x, y, { width: cols[j].width });
            x += cols[j].width;
        });

        doc.y = y + 12;
    });

    doc.moveDown();
    drawLine(doc);
}

/* ═══════════════ BOM ═══════════════ */
function addBillOfQuantities(doc, layout, speakers, fonts) {
    writeText(doc, "7. Bill of Quantities | جدول الكميات",
        STYLE.heading, fonts);
    doc.moveDown(0.5);

    /* ─── اجمع من layout أولاً، ثم من speakers ─── */
    const counts = {};

    const source = Array.isArray(layout) && layout.length > 0
        ? layout
        : (Array.isArray(speakers) ? speakers : []);

    source.forEach(item => {
        const mfg = item.manufacturer || "Generic";
        const mdl = item.model || "Unknown";
        const key = `${mfg} ${mdl}`;
        counts[key] = (counts[key] || 0) + 1;
    });

    const entries = Object.entries(counts);
    if (entries.length === 0) {
        writeText(doc, "لا توجد بيانات", STYLE.small, fonts);
        doc.moveDown();
        drawLine(doc);
        return;
    }

    /* ─── إجماليات ─── */
    let totalQty = 0;
    let totalRms = 0;

    entries.forEach(([model, qty]) => {
        totalQty += qty;

        // ابحث عن RMS من speakers
        if (Array.isArray(speakers)) {
            const found = speakers.find(s =>
                `${s.manufacturer || "Generic"} ${s.model || "Unknown"}` === model
            );
            if (found && Number.isFinite(Number(found.rms_power))) {
                totalRms += qty * Number(found.rms_power);
            }
        }

        writeText(doc, `${model} — Qty: ${qty}`, STYLE.body, fonts);
    });

    doc.moveDown(0.5);

    writeText(doc, `Total Units: ${totalQty}`, {
        size: 10, bold: true, color: "#0b0f14"
    }, fonts);

    if (totalRms > 0) {
        writeText(doc, `Total RMS Power: ${safeInt(totalRms)} W`,
            { size: 10, bold: true, color: "#0b0f14" }, fonts);
    }

    doc.moveDown();
    drawLine(doc);
}

/* ═══════════════ Notes ═══════════════ */
function addNotes(doc, fonts) {
    writeText(doc, "8. Notes | ملاحظات", STYLE.heading, fonts);
    doc.moveDown(0.5);

    writeText(doc,
        "This report is generated by Acoustic Engineering. " +
        "Values are engineering estimates based on supplied data.",
        STYLE.body, fonts);

    doc.moveDown(0.3);

    writeText(doc,
        "هذا التقرير مُنتَج بواسطة منصة هندسة صوتية. " +
        "القيم تقديرية وتعتمد على البيانات المُدخلة.",
        STYLE.body, fonts);

    doc.moveDown(0.5);

    writeText(doc,
        "⚠ يجب مراجعة ظروف الموقع الفعلية قبل التنفيذ النهائي.",
        { size: 10, bold: true, color: "#e60012" }, fonts);

    doc.moveDown(2);

    writeText(doc, "Acoustic Engineering — Unified Platform",
        STYLE.tiny, fonts, { align: "center" });
}

/* ═══════════════════════════════════════════════════════════
   الدالة الرئيسية
   ═══════════════════════════════════════════════════════════ */

/**
 * يولّد تقرير PDF كامل
 * @param {Object} options
 * @param {Object} options.project
 * @param {Object} options.user
 * @param {Object} options.room
 * @param {Array}  options.speakers
 * @param {Object} options.analysis
 * @param {Object} options.design
 * @param {string} options.outputPath
 * @returns {Promise<string>} مسار الملف
 */
function generatePDFReport({
    project,
    user,
    room,
    speakers,
    analysis,
    design,
    outputPath
}) {
    return new Promise((resolve, reject) => {
        /* ─── تحقق من المدخلات ─── */
        if (!outputPath) {
            return reject(new Error("outputPath مطلوب"));
        }

        if (!project || typeof project !== "object") {
            return reject(new Error("بيانات المشروع غير صالحة"));
        }

        let doc;
        let stream;

        try {
            /* ─── أنشئ الوثيقة ─── */
            doc = new PDFDocument({
                size: "A4",
                margin: 50,
                info: {
                    Title: `Acoustic Engineering Report - ${safe(project.name, "Untitled")}`,
                    Author: safe(user?.name, "Acoustic Engineering"),
                    Subject: "Sound System Design Report",
                    Keywords: "acoustics, audio, speaker, SPL, engineering",
                    Creator: "Acoustic Engineering v1.0",
                    Producer: "Acoustic Engineering Platform"
                },
                bufferPages: true   // ⚠️ مهم لترقيم الصفحات
            });

            stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            /* ─── سجّل الخطوط ─── */
            const fonts = registerFonts(doc);

            /* ─── مدير الصفحات ─── */
            const pageManager = new PageManager(doc);

            /* ─── ابنِ التقرير ─── */
            addCoverPage(doc, project, user, fonts);

            pageManager.newPage();

            addProjectInfo(doc, project, user, fonts);
            addRoomGeometry(doc, room || {}, fonts);
            addDesignMethod(doc, project, design, fonts);
            addAcousticAnalysis(doc, analysis, fonts);

            /* ─── ⚠️ حد أقصى للسماعات ─── */
            const safeSpeakers = Array.isArray(speakers)
                ? speakers.slice(0, 500)
                : [];

            const safeLayout = Array.isArray(design?.speakers)
                ? design.speakers.slice(0, 500)
                : [];

            addSpeakerSpecifications(doc, safeSpeakers, fonts, pageManager);
            addSpeakerLayout(doc, safeLayout, fonts, pageManager);
            addBillOfQuantities(doc, safeLayout, safeSpeakers, fonts);
            addNotes(doc, fonts);

            /* ─── ✅ طابع الصفحات على الكل ─── */
            pageManager.finish();

            /* ─── معالجة الأخطاء على الوثيقة ─── */
            doc.on("error", (err) => {
                console.error("[pdfReport] doc error:", err);
                reject(err);
            });

            /* ─── أنهِ ─── */
            doc.end();

            /* ─── انتظر الإنهاء ─── */
            stream.on("finish", () => resolve(outputPath));
            stream.on("error", (err) => {
                console.error("[pdfReport] stream error:", err);
                reject(err);
            });

            /* ─── Timeout (30 ثانية) ─── */
            const timeout = setTimeout(() => {
                try { doc.destroy(); } catch { /* ignore */ }
                reject(new Error("انتهت مهلة توليد PDF (30s)"));
            }, 30000);

            stream.on("finish", () => clearTimeout(timeout));
            stream.on("error", () => clearTimeout(timeout));

        } catch (err) {
            /* ─── تنظيف ─── */
            try { doc?.destroy(); } catch { /* ignore */ }
            try {
                if (stream) stream.destroy();
            } catch { /* ignore */ }

            reject(err);
        }
    });
}

module.exports = { generatePDFReport };
