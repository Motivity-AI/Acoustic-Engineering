"use strict";
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../database");
const { requireLogin } = require("../auth");

const UPLOADS = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `spk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

router.get("/", requireLogin, (req, res) => {
    const speakers = db.prepare("SELECT * FROM speakers ORDER BY manufacturer, model").all();
    res.json({ success: true, speakers });
});

router.get("/:id", requireLogin, (req, res) => {
    const s = db.prepare("SELECT * FROM speakers WHERE id = ?").get(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: "Speaker not found" });
    res.json({ success: true, speaker: s });
});

router.post("/", requireLogin, upload.single("datasheet"), (req, res) => {
    try {
        const b = req.body;
        const datasheet = req.file ? `/uploads/${req.file.filename}` : null;
        const result = db.prepare("INSERT INTO speakers (manufacturer, model, category, rms_power, peak_power, max_spl, sensitivity, frequency_min, frequency_max, horizontal_coverage, vertical_coverage, impedance, weight, mounting_type, datasheet, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
            b.manufacturer, b.model, b.category || "Point Source",
            Number(b.rms_power || 0), Number(b.peak_power || 0), Number(b.max_spl || 0),
            Number(b.sensitivity || 0), Number(b.frequency_min || 0), Number(b.frequency_max || 0),
            Number(b.horizontal_coverage || 90), Number(b.vertical_coverage || 60),
            Number(b.impedance || 8), Number(b.weight || 0),
            b.mounting_type || "Wall", datasheet, req.session.user.id
        );
        const speaker = db.prepare("SELECT * FROM speakers WHERE id = ?").get(result.lastInsertRowid);
        res.json({ success: true, speaker });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.delete("/:id", requireLogin, (req, res) => {
    if (req.session.user.role !== "admin") return res.status(403).json({ success: false, message: "Admin required" });
    const result = db.prepare("DELETE FROM speakers WHERE id = ?").run(req.params.id);
    res.json({ success: result.changes > 0 });
});

module.exports = router;