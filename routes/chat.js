const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");

// SEND MESSAGE
router.post("/", verifyToken, (req, res) => {
  const { team_id, message } = req.body;
  if (!team_id || !message || message.length > 1000) {
    return res.status(400).json({ error: "Invalid input" });
  }

  // Check team membership
  db.query(
    "SELECT 1 FROM team_members WHERE team_id=? AND user_id=?",
    [team_id, req.user.id],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error" });
      }
      if (!result || result.length === 0) {
        return res.status(403).json({ error: "Not a team member" });
      }

      db.query(
        "INSERT INTO messages (team_id, sender_id, message) VALUES (?, ?, ?)",
        [team_id, req.user.id, message],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.error(insertErr);
            return res.status(500).json({ error: "Message send failed" });
          }

          const newMessage = {
            id: insertResult.insertId,
            team_id,
            sender_id: req.user.id,
            message,
            name: req.user.name,
            email: req.user.email,
            created_at: new Date()
          };

          // Broadcast to team members
          req.app.locals.io.to(`team_${team_id}`).emit("new_message", newMessage);

          return res.status(201).json({ id: insertResult.insertId, message: "Message sent", data: newMessage });
        }
      );
    }
  );
});

// GET TEAM CHAT (SECURE, recent first)
router.get("/:teamId", verifyToken, (req, res) => {
  const teamId = req.params.teamId;
  db.query(
    `SELECT m.*, u.name, u.email 
     FROM messages m 
     JOIN users u ON u.id = m.sender_id 
     WHERE m.team_id=? AND EXISTS(SELECT 1 FROM team_members WHERE team_id=? AND user_id=?)
     ORDER BY m.created_at DESC LIMIT 100`,
    [teamId, teamId, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Chat fetch failed" });
      res.json(result);
    }
  );
});

module.exports = router;
