"use strict";
const express = require("express");
const router = express.Router();
const db = require("../database");

router.get("/", (req, res) => {
    let dbStatus = "disconnected";
    try { db.prepare("SELECT 1").get(); dbStatus = "connected"; } catch { dbStatus = "error"; }
    res.json({
        success: true, service: "Acoustic Engineering", version: "1.0.0",
        mode: "express-sqlite", database: dbStatus,
        uptime: process.uptime(), timestamp: new Date().toISOString()
    });
});
module.exports = router;