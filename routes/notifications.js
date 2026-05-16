const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * Convert a Date or ISO string into MySQL DATETIME format: "YYYY-MM-DD HH:MM:SS"
 */
function formatDateForMySQL(input) {
    // Use UTC components to avoid timezone-related insertion errors
    const d = input ? new Date(input) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const YYYY = d.getUTCFullYear();
    const MM = pad(d.getUTCMonth() + 1);
    const DD = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mm = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

// queueCompanyNotification supports two calling styles for backward-compatibility:
// 1) queueCompanyNotification(companyId, payload, options)
// 2) queueCompanyNotification({ recipients: [...], actor_user_id, type, title, ... })
async function queueCompanyNotification(arg1, arg2 = {}, arg3 = {}) {
    let recipients = [];
    let actor_user_id = null;
    let type = null;
    let title = null;
    let content = null;
    let team_id = null;
    let link = null;
    let created_at = null;

    // use RegExp.exec() instead of String.prototype.match()
    const numericIdRegex = /^\d+$/;

    // Detect legacy signature: first arg is companyId (number/string)
    if (typeof arg1 === 'number' || (typeof arg1 === 'string' && numericIdRegex.exec(arg1))) {
        const companyId = arg1;
        const payload = arg2 || {};
        const options = arg3 || {};

        actor_user_id = payload.actorUserId ?? payload.actor_user_id ?? null;
        type = payload.type;
        title = payload.title;
        content = payload.content || '';
        team_id = payload.teamId ?? payload.team_id ?? null;
        link = payload.link || null;
        created_at = payload.createdAt ?? payload.created_at ?? new Date();

        // build recipient list: users in the company (exclude optional IDs)
        try {
            const exclude = Array.isArray(options.excludeUserIds) && options.excludeUserIds.length > 0 ? options.excludeUserIds : [];
            // fetch user ids for the company
            const [rows] = await db.promise().query('SELECT id FROM users WHERE company_id = ?', [companyId]);
            recipients = rows.map(r => r.id).filter(id => !exclude.includes(id));
        } catch (err) {
            console.error('Failed to fetch company recipients for notifications:', err);
            recipients = [];
        }
    } else if (typeof arg1 === 'object' && arg1 !== null) {
        // New-style: single object with recipients etc.
        const opts = arg1;
        recipients = Array.isArray(opts.recipients) ? opts.recipients : [];
        actor_user_id = opts.actor_user_id ?? opts.actorUserId ?? null;
        type = opts.type;
        title = opts.title;
        content = opts.content || '';
        team_id = opts.team_id ?? opts.teamId ?? null;
        link = opts.link || null;
        created_at = opts.created_at ?? opts.createdAt ?? new Date();
    } else {
        // nothing sensible passed
        return;
    }

    if (!Array.isArray(recipients) || recipients.length === 0) return;

    // ensure created_at is MySQL DATETIME-friendly
    const createdAtFormatted = formatDateForMySQL(created_at);

    try {
        // build multi-row INSERT using parameterized placeholders
        const values = [];
        const placeholders = recipients.map((recipientId) => {
            values.push(recipientId, actor_user_id, type, title, content, team_id, link, createdAtFormatted);
            return '(?, ?, ?, ?, ?, ?, ?, ?)';
        }).join(', ');

        const sql = `INSERT INTO notifications (recipient_user_id, actor_user_id, type, title, content, team_id, link, created_at) VALUES ${placeholders}`;

        await db.promise().query(sql, values);
    } catch (err) {
        console.error('Failed to store chat notification:', err);
    }
}

async function queueUserNotification(userId, payload) {
    if (!userId) return;
    try {
        const createdAt = formatDateForMySQL(payload.createdAt ?? payload.created_at ?? new Date());
        await db.promise().query(
            'INSERT INTO notifications (recipient_user_id, actor_user_id, type, title, content, team_id, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                userId,
                payload.actorUserId ?? payload.actor_user_id ?? null,
                payload.type,
                payload.title,
                payload.content || '',
                payload.teamId ?? payload.team_id ?? null,
                payload.link || null,
                createdAt,
            ]
        );
    } catch (err) {
        console.error('Failed to store user notification:', err);
    }
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