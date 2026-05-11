const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");

router.post("/signup", async (req, res) => {
    const { name, email, password, role, invite_token } = req.body;
    if (!name || !email || !password || password.length < 6) {
        return res.status(400).json({ error: 'Invalid input' });
    }

    db.query("SELECT id FROM users WHERE email = ?", [email], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Signup failed' });
        }

        if (result.length > 0) return res.status(400).json({ error: 'Email exists' });

        (async () => {
            try {
                const hash = bcrypt.hashSync(password, 10);
                let companyId = null;
                let invite = null;

                if (invite_token) {
                    const [rows] = await db.promise().query("SELECT * FROM invite_tokens WHERE token = ?", [invite_token]);
                    if (!rows || rows.length === 0) return res.status(400).json({ error: 'Invalid invite token' });
                    invite = rows[0];

                    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
                        return res.status(400).json({ error: 'Invite expired' });
                    }
                    companyId = invite.company_id;
                }

                const userRole = role === 'admin' ? 'admin' : 'user';

                const [userResult] = await db.promise().query(
                    "INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, ?, ?)",
                    [name, email, hash, userRole, companyId]
                );
                const newUserId = userResult.insertId;

                // Handle team auto-join if invite exists
                if (invite) {
                    if (invite.team_id) {
                        await db.promise().query(
                            "INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')",
                            [invite.team_id, newUserId]
                        );
                    }
                    // delete token after use
                    await db.promise().query("DELETE FROM invite_tokens WHERE id = ?", [invite.id]);
                }

                res.status(201).json({ message: 'User created' });
            } catch (e) {
                console.error(e);
                res.status(500).json({ error: 'Signup failed' });
            }
        })();
    });
});

router.post("/login", (req, res) => {
    const { email, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE email = ?",
        [email],
        async (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).send("Database error");
            }

            if (!result || result.length === 0) {
                return res.status(404).send("User not found");
            }

            const user = result[0];

            try {
                const match = await bcrypt.compare(password, user.password);

                if (!match) {
                    return res.status(401).send("Wrong password");
                }

                const token = jwt.sign(
                    { id: user.id, role: user.role, company_id: user.company_id },
                    process.env.JWT_SECRET || "secret"
                );

                // exclude password from response
                const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, company_id: user.company_id };
                res.json({ token, user: safeUser });
            } catch (error) {
                console.log(error);
                res.status(500).send("Login error");
            }
        }
    );
});

// GET /auth/users - list users in the same company (Admins see all, Users see teammates)
router.get('/users', verifyToken, (req, res) => {
    try {
        const { search = '' } = req.query;
        const companyId = req.user.company_id || null;
        const isAdmin = req.user.role === 'admin';

        let query = "";
        let params = [];

        if (isAdmin) {
            query = "SELECT id, name, email, role FROM users WHERE company_id <=> ?";
            params = [companyId];
            if (search) {
                query += " AND (name LIKE ? OR email LIKE ?)";
                params.push(`%${search}%`, `%${search}%`);
            }
        } else {
            // Only show users who are in at least one team with the requester
            query = `
                SELECT DISTINCT u.id, u.name, u.email, u.role 
                FROM users u
                JOIN team_members tm ON u.id = tm.user_id
                WHERE tm.team_id IN (SELECT team_id FROM team_members WHERE user_id = ?)
            `;
            params = [req.user.id];
            if (search) {
                query += " AND (u.name LIKE ? OR u.email LIKE ?)";
                params.push(`%${search}%`, `%${search}%`);
            }
        }

        db.query(query, params, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Could not fetch users' });
            }
            res.json(result);
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
