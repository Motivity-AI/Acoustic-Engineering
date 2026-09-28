"use strict";
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const db = require("../database");
const { requireLogin, requireAdmin, logActivity } = require("../auth");
const { generatePDFReport } = require("../engine/pdfReport");

const REPORTS = path.join(__dirname, "..", "..", "reports");

router.post("/generate", requireLogin, async (req, res) => {
    try {
        const { projectId, room, speakers, analysis, design } = req.body;
        const project = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(projectId, req.session.user.id);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const fileName = `AE-Report-${project.id}-${Date.now()}.pdf`;
        const outputPath = path.join(REPORTS, fileName);

        await generatePDFReport({ project, user: req.session.user, room, speakers, analysis, design, outputPath });

        const stats = fs.statSync(outputPath);
        db.prepare("INSERT INTO reports (project_id, user_id, file_name, file_size) VALUES (?, ?, ?, ?)").run(project.id, req.session.user.id, fileName, stats.size);
        logActivity(req.session.user.id, "report_create", `إنشاء تقرير: ${project.name}`, {});

        res.json({ success: true, file: `/reports/${fileName}`, fileName });
    } catch (e) { console.error(e); res.status(500).json({ success: false, message: e.message }); }
});

router.get("/", requireLogin, (req, res) => {
    const reports = db.prepare("SELECT r.*, p.name AS project_name FROM reports r JOIN projects p ON p.id = r.project_id WHERE r.user_id = ? ORDER BY r.created_at DESC").all(req.session.user.id);
    res.json({ success: true, reports });
});

router.get("/all", requireLogin, requireAdmin, (req, res) => {
    const reports = db.prepare("SELECT r.*, p.name AS project_name, u.name AS user_name FROM reports r JOIN projects p ON p.id = r.project_id JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC").all();
    res.json({ success: true, reports });
});

module.exports = router;