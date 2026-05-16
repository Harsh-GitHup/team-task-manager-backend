const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");
const { queueCompanyNotification } = require("./notifications");

// CREATE TEAM (ADMIN ONLY)
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.length < 3) return res.status(400).json({ error: "Invalid name" });
    const companyId = req.user.company_id || null;

    const [result] = await db.promise().query(
      "INSERT INTO teams (name, admin_id, company_id) VALUES (?, ?, ?)",
      [name, req.user.id, companyId]
    );

    const teamId = result.insertId;
    try {
      // auto-add admin as head (best-effort)
      await db.promise().query(
        "INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'head')",
        [teamId, req.user.id]
      );
    } catch (mErr) {
      console.warn("Could not auto-add admin to team_members", mErr);
    }

    return res.status(201).json({ id: teamId, message: "Team created" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ADD MEMBER TO TEAM (company admin or team admin/head)
router.post("/add-member", verifyToken, async (req, res) => {
  try {
    const { team_id, user_id } = req.body;
    if (!team_id || !user_id) return res.status(400).json({ error: "Missing ids" });

    // validate team
    const [tRows] = await db.promise().query("SELECT company_id, admin_id FROM teams WHERE id = ?", [team_id]);
    if (!tRows || tRows.length === 0) return res.status(404).json({ error: "Team not found" });
    const team = tRows[0];

    if (req.user.company_id && team.company_id && req.user.company_id !== team.company_id) {
      return res.status(403).json({ error: "Cross-company action not allowed" });
    }

    // permission: company admin OR team admin OR team head
    const isCompanyAdmin = req.user.role === "admin" && req.user.company_id === team.company_id;
    const isTeamAdmin = req.user.id === team.admin_id;
    let allowed = isCompanyAdmin || isTeamAdmin;

    if (!allowed) {
      const [headRows] = await db.promise().query(
        "SELECT 1 FROM team_members WHERE team_id=? AND user_id=? AND role='head' LIMIT 1",
        [team_id, req.user.id]
      );
      allowed = headRows && headRows.length > 0;
    }

    if (!allowed) return res.status(403).json({ error: "Not authorized" });

    // ensure target user exists and same company
    const [uRows] = await db.promise().query("SELECT company_id FROM users WHERE id = ?", [user_id]);
    if (!uRows || uRows.length === 0) return res.status(404).json({ error: "User not found" });
    const userCompany = uRows[0].company_id;
    if (req.user.company_id && userCompany && req.user.company_id !== userCompany) {
      return res.status(400).json({ error: "User belongs to another company" });
    }

    await db.promise().query(
      "INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')",
      [team_id, user_id]
    );

    return res.json({ message: "User added to team" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// SET TEAM HEAD (company admin or team admin)
router.post("/set-head", verifyToken, async (req, res) => {
  try {
    const { team_id, user_id } = req.body;
    if (!team_id || !user_id) return res.status(400).json({ error: "Missing ids" });

    const [tRows] = await db.promise().query("SELECT admin_id, company_id FROM teams WHERE id = ?", [team_id]);
    if (!tRows || tRows.length === 0) return res.status(404).json({ error: "Team not found" });
    const team = tRows[0];

    const isCompanyAdmin = req.user.role === "admin" && req.user.company_id === team.company_id;
    const isTeamAdmin = req.user.id === team.admin_id;
    if (!isCompanyAdmin && !isTeamAdmin) return res.status(403).json({ error: "Admin only" });

    // ensure user exists and belongs to same company
    const [uRows] = await db.promise().query("SELECT company_id FROM users WHERE id = ?", [user_id]);
    if (!uRows || uRows.length === 0) return res.status(404).json({ error: "User not found" });
    const userCompany = uRows[0].company_id;
    if (req.user.company_id && userCompany && req.user.company_id !== userCompany) {
      return res.status(400).json({ error: "User belongs to another company" });
    }

    // ensure membership and set role
    await db.promise().query(
      "INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')",
      [team_id, user_id]
    );
    await db.promise().query("UPDATE team_members SET role='head' WHERE team_id=? AND user_id=?", [team_id, user_id]);

    // Also update user role to 'head' in users table
    await db.promise().query("UPDATE users SET role='head' WHERE id=?", [user_id]);

    // Emit real-time update via Socket.io
    const io = req.app.locals.io;
    if (io) {
      const team = tRows[0];
      const company_id = team.company_id;

      // Send role update to the user and all admins in the company
      io.to(`company_${company_id}`).emit("role_changed", {
        user_id: user_id,
        new_role: 'head',
        team_id: team_id,
        timestamp: new Date().toISOString()
      });

      // Send notification to the assigned head user and all company admins
      io.to(`company_${company_id}`).emit("new_notification", {
        type: 'role_change',
        user_id: req.user.id,
        title: 'Team Head Assignment',
        content: `User has been assigned as head of a team`,
        team_id: team_id,
        affected_user_id: user_id,
        created_at: new Date().toISOString()
      });

      queueCompanyNotification(company_id, {
        actorUserId: req.user.id,
        type: 'role_change',
        title: 'Team Head Assignment',
        content: 'User has been assigned as head of a team',
        teamId: team_id,
        createdAt: new Date().toISOString(),
      }).catch((err) => console.error('Failed to store head assignment notification:', err));
    }

    return res.json({ message: "Team head assigned" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET MY TEAMS (only teams in same company or membership)
router.get("/", verifyToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const companyFilter = req.user.company_id || null;

    let query = "";
    let params = [];

    if (isAdmin) {
      query = `
        SELECT t.*, u.name as admin_name,
          (SELECT COUNT(*) FROM team_members tm2 WHERE tm2.team_id = t.id) as member_count
        FROM teams t 
        JOIN users u ON t.admin_id = u.id 
        WHERE (t.company_id <=> ? OR ? IS NULL)
        GROUP BY t.id`;
      params = [companyFilter, companyFilter];
    } else {
      query = `
        SELECT t.*, u.name as admin_name,
          (SELECT COUNT(*) FROM team_members tm2 WHERE tm2.team_id = t.id) as member_count
        FROM teams t 
        JOIN team_members tm ON t.id = tm.team_id 
        JOIN users u ON t.admin_id = u.id 
        WHERE tm.user_id = ? AND (t.company_id <=> ? OR ? IS NULL)
        GROUP BY t.id`;
      params = [req.user.id, companyFilter, companyFilter];
    }

    const [rows] = await db.promise().query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET TEAM MEMBERS (must be member)
router.get("/:teamId/members", verifyToken, async (req, res) => {
  try {
    const teamId = req.params.teamId;
    const [tRows] = await db.promise().query("SELECT company_id FROM teams WHERE id = ?", [teamId]);
    if (!tRows || tRows.length === 0) return res.status(404).json({ error: "Team not found" });
    const teamCompany = tRows[0].company_id;
    if (req.user.company_id && teamCompany && req.user.company_id !== teamCompany) {
      return res.status(403).json({ error: "Cross-company access denied" });
    }

    const isCompanyAdmin = req.user.role === "admin" && req.user.company_id === teamCompany;
    const [existsRows] = await db.promise().query("SELECT 1 FROM team_members WHERE team_id=? AND user_id=? LIMIT 1", [teamId, req.user.id]);

    if (!isCompanyAdmin && (!existsRows || existsRows.length === 0)) {
      return res.status(403).json({ error: "Not a member" });
    }

    const [members] = await db.promise().query(
      "SELECT users.id, users.name, users.email, tm.role FROM team_members tm JOIN users ON users.id = tm.user_id WHERE tm.team_id=?",
      [teamId]
    );
    return res.json(members);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// UPDATE TEAM (admin only)
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim().length < 3) return res.status(400).json({ error: "Invalid name" });

    const [rows] = await db.promise().query("SELECT company_id FROM teams WHERE id = ?", [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Team not found" });

    const team = rows[0];
    if (!(req.user.role === "admin" && (!req.user.company_id || !team.company_id || String(req.user.company_id) === String(team.company_id)))) {
      return res.status(403).json({ error: "Admin only" });
    }

    await db.promise().query("UPDATE teams SET name = ? WHERE id = ?", [name.trim(), id]);
    return res.json({ message: "Team updated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// DELETE TEAM (admin only)
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.promise().query("SELECT company_id FROM teams WHERE id = ?", [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Team not found" });

    const team = rows[0];
    if (!(req.user.role === "admin" && (!req.user.company_id || !team.company_id || String(req.user.company_id) === String(team.company_id)))) {
      return res.status(403).json({ error: "Admin only" });
    }

    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM messages WHERE team_id = ?", [id]);
      await conn.query("DELETE FROM tasks WHERE team_id = ?", [id]);
      await conn.query("DELETE FROM projects WHERE team_id = ?", [id]);
      await conn.query("DELETE FROM team_members WHERE team_id = ?", [id]);
      await conn.query("DELETE FROM teams WHERE id = ?", [id]);
      await conn.commit();
      return res.json({ message: "Team deleted" });
    } catch (innerErr) {
      await conn.rollback();
      throw innerErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// UPDATE TEAM MEMBER ROLE (admin only)
router.put("/:teamId/members/:userId", verifyToken, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const { role } = req.body;
    if (!["member", "head"].includes(role)) return res.status(400).json({ error: "Invalid role" });

    const [rows] = await db.promise().query("SELECT company_id FROM teams WHERE id = ?", [teamId]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Team not found" });

    const team = rows[0];
    if (!(req.user.role === "admin" && (!req.user.company_id || !team.company_id || String(req.user.company_id) === String(team.company_id)))) {
      return res.status(403).json({ error: "Admin only" });
    }

    await db.promise().query(
      "INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')",
      [teamId, userId]
    );
    await db.promise().query(
      "UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?",
      [role, teamId, userId]
    );

    // Also update user role in users table based on team_members role
    if (role === 'head') {
      await db.promise().query("UPDATE users SET role='head' WHERE id=?", [userId]);
    } else if (role === 'member') {
      // When demoting from head to member, set user role back to base 'user' role
      await db.promise().query("UPDATE users SET role='user' WHERE id=? AND role='head'", [userId]);
    }

    // Emit real-time update via Socket.io
    const io = req.app.locals.io;
    if (io) {
      const company_id = team.company_id;

      // Send role update to the user and all admins in the company
      io.to(`company_${company_id}`).emit("role_changed", {
        user_id: userId,
        new_role: role,
        team_id: teamId,
        timestamp: new Date().toISOString()
      });

      // Send notification
      const roleLabel = role === 'head' ? 'Team Head' : 'Team Member';
      io.to(`company_${company_id}`).emit("new_notification", {
        type: 'role_change',
        user_id: req.user.id,
        title: `Role Updated to ${roleLabel}`,
        content: `User role has been updated`,
        team_id: teamId,
        affected_user_id: userId,
        created_at: new Date().toISOString()
      });

      queueCompanyNotification(company_id, {
        actorUserId: req.user.id,
        type: 'role_change',
        title: `Role Updated to ${roleLabel}`,
        content: `User role has been updated`,
        teamId: teamId,
        createdAt: new Date().toISOString(),
      }).catch((err) => console.error('Failed to store role update notification:', err));
    }

    return res.json({ message: "Team member updated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// REMOVE TEAM MEMBER (admin only)
router.delete("/:teamId/members/:userId", verifyToken, async (req, res) => {
  try {
    const { teamId, userId } = req.params;

    const [rows] = await db.promise().query("SELECT company_id FROM teams WHERE id = ?", [teamId]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Team not found" });

    const team = rows[0];
    if (!(req.user.role === "admin" && (!req.user.company_id || !team.company_id || String(req.user.company_id) === String(team.company_id)))) {
      return res.status(403).json({ error: "Admin only" });
    }

    await db.promise().query("DELETE FROM team_members WHERE team_id = ? AND user_id = ?", [teamId, userId]);
    return res.json({ message: "Team member removed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
