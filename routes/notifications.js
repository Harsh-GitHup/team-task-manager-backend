const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

async function queueCompanyNotification(companyId, payload, options = {}) {
    if (!companyId) return;

    const { excludeUserIds = [] } = options;
    const excludeSet = new Set(excludeUserIds.map(String));
    const [users] = await db.promise().query(
        'SELECT id FROM users WHERE company_id = ?',
        [companyId]
    );

    const recipientIds = (users || [])
        .map((user) => user.id)
        .filter((id) => !excludeSet.has(String(id)));

    if (recipientIds.length === 0) return;

    const rows = recipientIds.map((recipientUserId) => [
        recipientUserId,
        payload.actorUserId ?? null,
        payload.type,
        payload.title,
        payload.content || '',
        payload.teamId ?? null,
        payload.link || null,
        payload.createdAt || new Date().toISOString(),
    ]);

    await db.promise().query(
        'INSERT INTO notifications (recipient_user_id, actor_user_id, type, title, content, team_id, link, created_at) VALUES ?',
        [rows]
    );
}

async function queueUserNotification(userId, payload) {
    if (!userId) return;

    await db.promise().query(
        'INSERT INTO notifications (recipient_user_id, actor_user_id, type, title, content, team_id, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            userId,
            payload.actorUserId ?? null,
            payload.type,
            payload.title,
            payload.content || '',
            payload.teamId ?? null,
            payload.link || null,
            payload.createdAt || new Date().toISOString(),
        ]
    );
}

router.get('/', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, type, title, content, team_id, link, actor_user_id, created_at
       FROM notifications
       WHERE recipient_user_id = ? AND read_at IS NULL
       ORDER BY created_at DESC
       LIMIT 100`,
            [req.user.id]
        );

        return res.json(rows || []);
    } catch (err) {
        console.error('Failed to fetch notifications:', err);
        return res.status(500).json({ error: 'Failed to load notifications' });
    }
});

router.post('/mark-read', verifyToken, async (req, res) => {
    try {
        const { ids, all } = req.body || {};

        if (all) {
            await db.promise().query(
                'UPDATE notifications SET read_at = NOW() WHERE recipient_user_id = ? AND read_at IS NULL',
                [req.user.id]
            );
            return res.json({ message: 'Notifications marked as read' });
        }

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Missing ids' });
        }

        await db.promise().query(
            'UPDATE notifications SET read_at = NOW() WHERE recipient_user_id = ? AND id IN (?)',
            [req.user.id, ids]
        );

        return res.json({ message: 'Notifications marked as read' });
    } catch (err) {
        console.error('Failed to mark notifications read:', err);
        return res.status(500).json({ error: 'Failed to update notifications' });
    }
});

router.post('/read-on-open', verifyToken, async (req, res) => {
    try {
        const { ids } = req.body || {};

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Missing ids' });
        }

        await db.promise().query(
            'UPDATE notifications SET read_at = NOW() WHERE recipient_user_id = ? AND read_at IS NULL AND id IN (?)',
            [req.user.id, ids]
        );

        return res.json({ message: 'Visible notifications marked as read' });
    } catch (err) {
        console.error('Failed to mark notifications on open:', err);
        return res.status(500).json({ error: 'Failed to update notifications' });
    }
});

module.exports = { router, queueCompanyNotification, queueUserNotification };