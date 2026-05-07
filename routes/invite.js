const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /invites - admin generates invite link for their company
router.post('/', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

        const { email, expiresDays } = req.body;
        const token = crypto.randomBytes(20).toString('hex');
        const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 3600 * 1000) : null;

        await db.promise().query(
            'INSERT INTO invite_tokens (token, company_id, email, expires_at, created_by) VALUES (?, ?, ?, ?, ?)',
            [token, req.user.company_id || null, email || null, expiresAt ? expiresAt.toISOString().slice(0, 19).replace('T', ' ') : null, req.user.id]
        );

        const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
        const link = `${frontend}/signup?invite=${token}`;
        res.json({ token, link });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Invite creation failed' });
    }
});

module.exports = router;
