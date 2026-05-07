const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

// Create task (company admin OR team head)
router.post('/', verifyToken, (req, res) => {
  const { title, description, team_id, project_id, assigned_to } = req.body;
  if (!title || !team_id || !project_id) return res.status(400).json({ error: 'Missing fields' });

  // validate team/project/company
  db.query("SELECT t.company_id FROM teams t JOIN projects p ON p.team_id = t.id WHERE t.id = ? AND p.id = ?", [team_id, project_id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!result || result.length === 0) return res.status(404).json({ error: 'Project/Team mismatch or not found' });
    const teamCompany = result[0].company_id;
    if (req.user.company_id && teamCompany && req.user.company_id !== teamCompany) {
      return res.status(403).json({ error: 'Cross-company action not allowed' });
    }

    // check permission
    if (req.user.role === 'admin' && req.user.company_id === teamCompany) {
      return checkAssigneeAndInsert();
    }

    // check team head
    db.query("SELECT role FROM team_members WHERE team_id=? AND user_id=?", [team_id, req.user.id], (mErr, mRes) => {
      if (mErr) return res.status(500).json({ error: 'DB error' });
      if (!(mRes && mRes.length > 0 && mRes[0].role === 'head')) return res.status(403).json({ error: 'Not authorized' });
      return checkAssigneeAndInsert();
    });

    function checkAssigneeAndInsert() {
      if (assigned_to) {
        db.query("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?", [team_id, assigned_to], (aErr, aRes) => {
          if (aErr) return res.status(500).json({ error: 'DB error' });
          if (!aRes || aRes.length === 0) return res.status(400).json({ error: 'Assignee is not a member of the team' });
          doInsert();
        });
      } else {
        doInsert();
      }
    }

    function doInsert() {
      db.query(
        "INSERT INTO tasks (title, description, team_id, project_id, assigned_to, status, created_by) VALUES (?, ?, ?, ?, ?, 'Todo', ?)",
        [title, description || '', team_id, project_id, assigned_to || null, req.user.id],
        (tErr, tRes) => {
          if (tErr) {
            console.error(tErr);
            return res.status(500).json({ error: 'Task creation failed' });
          }
          res.status(201).json({ id: tRes.insertId, message: 'Task created' });
        }
      );
    }
  });
});

// GET tasks visible to requester
router.get('/', verifyToken, (req, res) => {
  try {
    const companyFilter = req.user.company_id || null;
    if (req.user.role === 'admin' && companyFilter) {
      // company admin sees all tasks in company
      db.query(
        "SELECT t.* FROM tasks t JOIN projects p ON t.project_id = p.id JOIN teams tm ON p.team_id = tm.id WHERE tm.company_id = ?",
        [companyFilter],
        (err, result) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Fetch failed' });
          }
          res.json(result);
        }
      );
      return;
    }

    // regular user: tasks assigned to them or in teams they belong to
    db.query(
      "SELECT DISTINCT t.* FROM tasks t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN teams tm ON p.team_id = tm.id LEFT JOIN team_members tm2 ON tm2.team_id = tm.id WHERE (t.assigned_to = ? OR tm2.user_id = ?) AND (tm.company_id = ? OR ? IS NULL)",
      [req.user.id, req.user.id, companyFilter, companyFilter],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Fetch failed' });
        }
        res.json(result);
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
