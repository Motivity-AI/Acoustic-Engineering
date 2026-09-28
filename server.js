/* ============================================================
   Acoustic Engineering — server.js
   ============================================================ */
"use strict";
const args = process.argv.slice(2);
const SERVE_ONLY = args.includes("--serve-only");
const PORT_ARG = args.find(a => a.startsWith("--port="));
const PORT = PORT_ARG ? Number(PORT_ARG.split("=")[1]) : (process.env.PORT || 3000);

if (SERVE_ONLY) startStaticOnly(); else startFull();

function startFull() {
    try {
        const app = require("./server/index.js");
        app.listen(PORT, () => {
            banner("FULL MODE (Express + SQLite)");
            console.log(`   Server   : http://localhost:${PORT}`);
            console.log(`   API      : http://localhost:${PORT}/api/health`);
            console.log(`   Admin Ph : 0000000000`);
            console.log(`   Password : Admin123!`);
            line();
        });
    } catch (error) {
        console.error("\n❌ فشل تشغيل الخادم الكامل:", error.message);
        console.log("\n💡 ثبّت الحزم: npm install");
        console.log("💡 أو شغّل: node server.js --serve-only\n");
        process.exit(1);
    }
}

function startStaticOnly() {
    const express = require("express");
    const path = require("path");
    const app = express();
    const PUBLIC = __dirname;
    app.use(express.static(PUBLIC, { setHeaders: (res, fp) => { if (fp.endsWith("sw.js")) res.setHeader("Service-Worker-Allowed", "/"); } }));
    app.get("*", (req, res) => res.sendFile(path.join(PUBLIC, "index.html")));
    app.listen(PORT, () => {
        banner("STATIC MODE (Firebase PWA)");
        console.log(`   Server : http://localhost:${PORT}`);
        line();
    });
}

function banner(mode) {
    console.log("");
    console.log("╔══════════════════════════════════════════╗");
    console.log("║      ACOUSTIC ENGINEERING v1.0.0         ║");
    console.log("║  Unified Platform — Firebase + SQLite    ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log("");
    console.log(`   Mode     : ${mode}`);
}
function line() { console.log("─".repeat(46)); console.log(""); }
