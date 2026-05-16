const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');
const { logActivity } = require('./activity');
const { queueCompanyNotification } = require('./notifications');


// Create project (company admin OR team head)
router.post('/', verifyToken, (req, res) => {
  const { title, description, team_id, color, emoji } = req.body;
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
      db.query("INSERT INTO projects (title, description, color, emoji, team_id, created_by) VALUES (?, ?, ?, ?, ?, ?)", [title, description || '', color || '#7c6aff', emoji || '📁', team_id, req.user.id], (pErr, pRes) => {
        if (pErr) {
          console.error(pErr);
          return res.status(500).json({ error: 'Project creation failed' });
        }
        logActivity(`created project **${title}**`, 'project', pRes.insertId, req.user.id, req.user.company_id);
        if (req.app.locals.io) {
          req.app.locals.io.emit("refresh_projects");
          if (req.user.company_id) {
            req.app.locals.io.to(`company_${req.user.company_id}`).emit("new_notification", {
              type: 'project',
              title: 'New Project',
              content: `**${title}** was created`,
              user_id: req.user.id,
              created_at: new Date().toISOString(),
              link: '/projects'
            });
            queueCompanyNotification(req.user.company_id, {
              actorUserId: req.user.id,
              type: 'project',
              title: 'New Project',
              content: `**${title}** was created`,
              teamId: team_id,
              link: '/projects',
              createdAt: new Date().toISOString(),
            });
          }
        }
        res.status(201).json({ id: pRes.insertId, message: 'Project created' });
      });
    }
  });
});

// GET projects visible to user (company scope for admins, team scope for others)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (Number.parseInt(page) - 1) * Number.parseInt(limit);
    const companyFilter = req.user.company_id || null;
    const isAdmin = req.user.role === 'admin';

    let query = "";
    let countQuery = "";
    let params = [];

    if (isAdmin) {
      query = `
        SELECT p.*, t.name as team_name 
        FROM projects p 
        JOIN teams t ON p.team_id = t.id 
        WHERE t.company_id <=> ?
      `;
      countQuery = `
        SELECT COUNT(*) as total 
        FROM projects p 
        JOIN teams t ON p.team_id = t.id 
        WHERE t.company_id <=> ?
      `;
      params = [companyFilter];
    } else {
      query = `
        SELECT DISTINCT p.*, t.name as team_name 
        FROM projects p 
        JOIN teams t ON p.team_id = t.id 
        JOIN team_members tm ON tm.team_id = t.id
        WHERE t.company_id <=> ? AND tm.user_id = ?
      `;
      countQuery = `
        SELECT COUNT(DISTINCT p.id) as total 
        FROM projects p 
        JOIN teams t ON p.team_id = t.id 
        JOIN team_members tm ON tm.team_id = t.id
        WHERE t.company_id <=> ? AND tm.user_id = ?
      `;
      params = [companyFilter, req.user.id];
    }

    if (search) {
      query += " AND p.title LIKE ?";
      countQuery += " AND p.title LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
    const fetchParams = [...params, Number.parseInt(limit), offset];

    const [[{ total }]] = await db.promise().query(countQuery, params);
    const [projects] = await db.promise().query(query, fetchParams);

    res.json({
      projects,
      pagination: {
        total,
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        totalPages: Math.ceil(total / Number.parseInt(limit))
      }
    });
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
    const { title, description, team_id, color, emoji } = req.body;

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
    const nextEmoji = emoji ?? project.emoji ?? '📁';
    const nextTeamId = team_id ?? project.team_id;

    await db.promise().query(
      'UPDATE projects SET title = ?, description = ?, color = ?, emoji = ?, team_id = ? WHERE id = ?',
      [nextTitle, nextDescription, nextColor, nextEmoji, nextTeamId, projectId]
    );

    if (req.app.locals.io) {
      req.app.locals.io.emit("refresh_projects");
      if (req.user.company_id) {
        req.app.locals.io.to(`company_${req.user.company_id}`).emit("new_notification", {
          type: 'project',
          title: 'Project Updated',
          content: `**${nextTitle}** was modified`,
          user_id: req.user.id,
          created_at: new Date().toISOString(),
          link: '/projects'
        });
        queueCompanyNotification(req.user.company_id, {
          actorUserId: req.user.id,
          type: 'project',
          title: 'Project Updated',
          content: `**${nextTitle}** was modified`,
          teamId: nextTeamId,
          link: '/projects',
          createdAt: new Date().toISOString(),
        });
      }
    }

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

