/* ============================================================
   Acoustic Engineering — server.js v1.1.0
   ============================================================ */
"use strict";

const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);
const SERVE_ONLY = args.includes("--serve-only");
const PORT_ARG = args.find(a => a.startsWith("--port="));

function parsePort(raw) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
        console.error(`❌ منفذ غير صالح: ${raw}`);
        process.exit(1);
    }
    return n;
}

const PORT = parsePort(
    PORT_ARG?.split("=")[1] ?? process.env.PORT ?? 3000
);

const PUBLIC = path.join(__dirname);   // إن أمكن، انقل الأصول إلى public/

SERVE_ONLY ? startStaticOnly() : startFull();

/* ---------------------------- Full mode --------------------------- */
function startFull() {
    let app;
    try {
        app = require("./server/index.js");
    } catch (err) {
        console.error("\n❌ فشل تحميل الخادم الكامل:", err.message);
        console.log("\n💡 ثبّت الحزم: npm install");
        console.log("💡 أو شغّل: node server.js --serve-only\n");
        process.exit(1);
    }

    const server = app.listen(PORT, () => {
        banner("FULL MODE (Express + SQLite)");
        console.log(`   Server   : http://localhost:${PORT}`);
        console.log(`   API      : http://localhost:${PORT}/api/health`);
        if (process.env.NODE_ENV !== "production") {
            console.log(`   Admin    : ${process.env.ADMIN_PHONE || "(from .env)"}`);
        }
        line();
    });

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`❌ المنفذ ${PORT} مشغول. جرّب: node server.js --port=${PORT + 1}`);
        } else {
            console.error("❌ خطأ في الخادم:", err);
        }
        process.exit(1);
    });

    process.on("SIGINT", shutdown(server));
    process.on("SIGTERM", shutdown(server));
}

/* -------------------------- Static mode --------------------------- */
function startStaticOnly() {
    let express;
    try {
        express = require("express");
    } catch {
        console.error("❌ express غير مثبت. شغّل: npm install express");
        process.exit(1);
    }

    const app = express();

    // منع صراحةً الوصول للمجلدات الحساسة
    app.use(["/server", "/node_modules", "/.git"], (req, res) =>
        res.status(404).end()
    );

    app.use(express.static(PUBLIC, {
        dotfiles: "deny",
        index: "index.html",
        setHeaders: (res, fp) => {
            if (fp.endsWith("sw.js"))
                res.setHeader("Service-Worker-Allowed", "/");
        }
    }));

    // SPA fallback — بدون التقاط ملفات HTML المفقودة أو API
    app.use((req, res) => {
        if (req.path.startsWith("/api/"))
            return res.status(404).json({ error: "Not found" });

        if (req.path.endsWith(".html")) {
            const fp = path.join(PUBLIC, req.path);
            if (!fs.existsSync(fp)) return res.status(404).send("Not found");
        }

        if (path.extname(req.path))
            return res.status(404).send("Not found");

        res.sendFile(path.join(PUBLIC, "index.html"));
    });

    const server = app.listen(PORT, () => {
        banner("STATIC MODE (Firebase PWA)");
        console.log(`   Server : http://localhost:${PORT}`);
        line();
    });

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`❌ المنفذ ${PORT} مشغول.`);
        } else {
            console.error("❌ خطأ:", err);
        }
        process.exit(1);
    });

    process.on("SIGINT", shutdown(server));
    process.on("SIGTERM", shutdown(server));
}

/* ---------------------------- Helpers ----------------------------- */
function shutdown(server) {
    return () => {
        console.log("\n👋 إيقاف الخادم...");
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5000).unref();
    };
}

function banner(mode) {
    const lines = [
        "ACOUSTIC ENGINEERING v1.0.0",
        "Unified Platform — Firebase + SQLite",
        `Mode: ${mode}`
    ];
    const width = Math.max(...lines.map(l => l.length)) + 4;
    console.log("\n╔" + "═".repeat(width) + "╗");
    lines.forEach(l => console.log("║ " + l.padEnd(width - 2) + " ║"));
    console.log("╚" + "═".repeat(width) + "╝\n");
}

function line() {
    console.log("─".repeat(46));
    console.log("");
}