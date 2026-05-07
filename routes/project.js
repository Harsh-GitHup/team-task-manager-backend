const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

// Create project (company admin OR team head)
router.post('/', verifyToken, (req, res) => {
  const { title, description, team_id } = req.body;
  if (!title || !team_id) return res.status(400).json({ error: 'Missing fields' });

  // validate team and company
  db.query("SELECT company_id FROM teams WHERE id = ?", [team_id], (tErr, tRes) => {
    if (tErr) {
      console.error(tErr);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!tRes || tRes.length === 0) return res.status(404).json({ error: 'Team not found' });
    const teamCompany = tRes[0].company_id;

    if (req.user.company_id && teamCompany && req.user.company_id !== teamCompany) {
      return res.status(403).json({ error: 'Cross-company action not allowed' });
    }

    // check permission: company admin OR team head
    if (req.user.role === 'admin' && req.user.company_id === teamCompany) {
      return doInsert();
    }

    // check team head
    db.query("SELECT role FROM team_members WHERE team_id=? AND user_id=?", [team_id, req.user.id], (mErr, mRes) => {
      if (mErr) return res.status(500).json({ error: 'DB error' });
      if (mRes && mRes.length > 0 && mRes[0].role === 'head') return doInsert();
      return res.status(403).json({ error: 'Not authorized' });
    });

    function doInsert() {
      db.query("INSERT INTO projects (title, description, team_id, created_by) VALUES (?, ?, ?, ?)", [title, description || '', team_id, req.user.id], (pErr, pRes) => {
        if (pErr) {
          console.error(pErr);
          return res.status(500).json({ error: 'Project creation failed' });
        }
        res.status(201).json({ id: pRes.insertId, message: 'Project created' });
      });
    }
  });
});

// GET projects visible to user (company scope)
router.get('/', verifyToken, (req, res) => {
  try {
    const companyFilter = req.user.company_id || null;
    db.query(
      "SELECT p.* FROM projects p JOIN teams t ON p.team_id = t.id WHERE t.company_id = ?",
      [companyFilter],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Could not fetch projects' });
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

