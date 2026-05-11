const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /invites - admin generates invite link for their company/team
router.post('/', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

        const { email, expiresDays, team_id } = req.body;
        const token = crypto.randomBytes(20).toString('hex');
        const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 3600 * 1000) : null;

        await db.promise().query(
            'INSERT INTO invite_tokens (token, company_id, team_id, email, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [
                token,
                req.user.company_id || null,
                team_id || null,
                email || null,
                expiresAt ? expiresAt.toISOString().slice(0, 19).replace('T', ' ') : null,
                req.user.id
            ]
        );

        const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
        // Changed to /invite/ instead of /signup?invite= to allow checking login status
        const link = `${frontend}/invite/${token}`;
        res.json({ token, link });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Invite creation failed' });
    }
});

// GET /invites/:token - get invite details
router.get('/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const [rows] = await db.promise().query(
            `SELECT it.*, c.name as company_name, t.name as team_name 
             FROM invite_tokens it
             LEFT JOIN companies c ON it.company_id = c.id
             LEFT JOIN teams t ON it.team_id = t.id
             WHERE it.token = ?`,
            [token]
        );

        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Invite not found' });

        const invite = rows[0];
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Invite expired' });
        }

        res.json(invite);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch invite' });
    }
});

// POST /invites/join - logged in user joins via invite
router.post('/join', verifyToken, async (req, res) => {
    try {
        const { token } = req.body;
        const userId = req.user.id;

        const [rows] = await db.promise().query("SELECT * FROM invite_tokens WHERE token = ?", [token]);
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Invalid token' });

        const invite = rows[0];
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Invite expired' });
        }

        // 1. Update user company_id if not set or different (depending on policy)
        if (invite.company_id) {
            await db.promise().query("UPDATE users SET company_id = ? WHERE id = ?", [invite.company_id, userId]);
        }

        // 2. Add to team if team_id exists
        if (invite.team_id) {
            await db.promise().query(
                "INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')",
                [invite.team_id, userId]
            );
        }

        // 3. Delete token or mark as used
        await db.promise().query("DELETE FROM invite_tokens WHERE id = ?", [invite.id]);

        res.json({ message: 'Joined successfully', team_id: invite.team_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to join team' });
    }
});

module.exports = router;
