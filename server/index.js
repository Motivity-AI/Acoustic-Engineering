/* ============================================================
   Acoustic Engineering — server/index.js
   ============================================================ */
"use strict";
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

const ROOT = path.join(__dirname, "..");
const UPLOADS = path.join(ROOT, "uploads");
const REPORTS = path.join(ROOT, "reports");
const DATA = path.join(ROOT, "data");

[UPLOADS, REPORTS, DATA].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(session({
    secret: process.env.SESSION_SECRET || "ACOUSTIC_ENGINEERING_CHANGE_THIS",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: "lax" },
    name: "ae.sid"
}));

app.use(express.static(ROOT, { setHeaders: (res, fp) => { if (fp.endsWith("sw.js")) res.setHeader("Service-Worker-Allowed", "/"); } }));
app.use("/uploads", express.static(UPLOADS));
app.use("/reports", express.static(REPORTS));

app.use("/api/health", require("./routes/health"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/speakers", require("./routes/speakers"));
app.use("/api/reports", require("./routes/reports"));

app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ success: false, message: "API not found" });
    }
    res.sendFile(path.join(ROOT, "index.html"));
});

app.use((error, req, res, next) => {
    console.error("[Server Error]", error);
    res.status(error.status || 500).json({ success: false, message: error.message || "Internal error" });
});

module.exports = app;
