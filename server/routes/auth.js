"use strict";
const express = require("express");
const router = express.Router();
const { registerUser, loginUser, logActivity } = require("../auth");

router.post("/register", (req, res) => {
    try {
        const user = registerUser(req.body);
        req.session.user = user;
        logActivity(user.id, "register", "إنشاء حساب جديد", { phone: user.phone });
        res.json({ success: true, user });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/login", (req, res) => {
    try {
        const user = loginUser(req.body.phone, req.body.password);
        req.session.user = user;
        logActivity(user.id, "login", "تسجيل دخول", {});
        res.json({ success: true, user });
    } catch (e) { res.status(401).json({ success: false, message: e.message }); }
});

router.post("/logout", (req, res) => {
    const u = req.session?.user;
    if (u) logActivity(u.id, "logout", "تسجيل خروج", {});
    req.session.destroy(() => res.json({ success: true }));
});

router.get("/me", (req, res) => {
    res.json({ success: true, user: req.session?.user || null });
});

module.exports = router;