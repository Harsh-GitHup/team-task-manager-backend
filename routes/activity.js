const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");

// Helper function to log activity internally
const logActivity = async (action, entityType, entityId, userId, companyId) => {
  try {
    await db.promise().query(
      "INSERT INTO activities (action, entity_type, entity_id, user_id, company_id) VALUES (?, ?, ?, ?, ?)",
      [action, entityType, entityId, userId, companyId || null]
    );
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
};

// Get activities for the company
router.get("/", verifyToken, async (req, res) => {
  try {
    const companyFilter = req.user.company_id || null;
    let query = `
      SELECT a.*, u.name as user_name 
      FROM activities a 
      JOIN users u ON a.user_id = u.id 
    `;
    const params = [];

    if (companyFilter) {
      query += " WHERE a.company_id = ? ORDER BY a.created_at DESC LIMIT 20";
      params.push(companyFilter);
    } else {
      query += " ORDER BY a.created_at DESC LIMIT 20";
    }

    const [rows] = await db.promise().query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = { router, logActivity };
