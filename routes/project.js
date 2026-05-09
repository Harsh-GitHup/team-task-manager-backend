const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');
const { logActivity } = require('./activity');


// Create project (company admin OR team head)
router.post('/', verifyToken, (req, res) => {
  const { title, description, team_id, color } = req.body;
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
      db.query("INSERT INTO projects (title, description, color, team_id, created_by) VALUES (?, ?, ?, ?, ?)", [title, description || '', color || '#7c6aff', team_id, req.user.id], (pErr, pRes) => {
        if (pErr) {
          console.error(pErr);
          return res.status(500).json({ error: 'Project creation failed' });
        }
        logActivity(`created project **${title}**`, 'project', pRes.insertId, req.user.id, req.user.company_id);
        if (req.app.locals.io) req.app.locals.io.emit("refresh_projects");
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
      "SELECT p.* FROM projects p JOIN teams t ON p.team_id = t.id WHERE t.company_id <=> ?",
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


// UPDATE PROJECT (admin or owner)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { title, description, team_id, color } = req.body;

    const [rows] = await db.promise().query(
      'SELECT p.*, t.company_id as team_company_id FROM projects p LEFT JOIN teams t ON p.team_id = t.id WHERE p.id = ?',
      [projectId]
    );

    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = rows[0];
    const isOwner = String(project.created_by) === String(req.user.id);
    const isAdmin = req.user.role === 'admin' && (!req.user.company_id || !project.team_company_id || String(req.user.company_id) === String(project.team_company_id));

    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    if (team_id && !isAdmin && String(team_id) !== String(project.team_id)) {
      return res.status(403).json({ error: 'Only admins can move projects between teams' });
    }

    const nextTitle = title ?? project.title;
    const nextDescription = description ?? project.description ?? '';
    const nextColor = color ?? project.color ?? '#7c6aff';
    const nextTeamId = team_id ?? project.team_id;

    await db.promise().query(
      'UPDATE projects SET title = ?, description = ?, color = ?, team_id = ? WHERE id = ?',
      [nextTitle, nextDescription, nextColor, nextTeamId, projectId]
    );

    return res.json({ message: 'Project updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Project update failed' });
  }
});

// DELETE PROJECT (admin or owner)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const projectId = req.params.id;

    const [rows] = await db.promise().query(
      'SELECT p.*, t.company_id as team_company_id FROM projects p LEFT JOIN teams t ON p.team_id = t.id WHERE p.id = ?',
      [projectId]
    );

    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = rows[0];
    const isOwner = String(project.created_by) === String(req.user.id);
    const isAdmin = req.user.role === 'admin' && (!req.user.company_id || !project.team_company_id || String(req.user.company_id) === String(project.team_company_id));

    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    await db.promise().query('DELETE FROM tasks WHERE project_id = ?', [projectId]);
    await db.promise().query('DELETE FROM projects WHERE id = ?', [projectId]);

    return res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Project delete failed' });
  }
});

