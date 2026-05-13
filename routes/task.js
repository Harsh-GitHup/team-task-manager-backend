const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('node:path');
const { verifyToken } = require('../middleware/authMiddleware');
const { logActivity } = require('./activity');

function normalizeDueDate(value) {
  if (value === null || value === undefined || value === '') return { value: null };

  const raw = String(value).trim();
  if (!raw) return { value: null };

  // Accept both YYYY-MM-DD and full ISO strings like 2026-09-22T00:00:00.000Z.
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return { value: isoPrefix[1] };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { error: 'Invalid due_date' };

  return { value: parsed.toISOString().slice(0, 10) };
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 100 MB
  },
});

// Create task (company admin OR team head)
router.post('/', verifyToken, (req, res) => {
  const { title, description, team_id, project_id, assigned_to, priority, due_date } = req.body;
  if (!title || !team_id || !project_id) return res.status(400).json({ error: 'Missing fields' });

  const normalizedCreateDueDate = normalizeDueDate(due_date);
  if (normalizedCreateDueDate.error) {
    return res.status(400).json({ error: normalizedCreateDueDate.error });
  }

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
        "INSERT INTO tasks (title, description, priority, due_date, team_id, project_id, assigned_to, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'Todo', ?)",
        [title, description || '', priority || 'medium', normalizedCreateDueDate.value, team_id, project_id, assigned_to || null, req.user.id],
        (tErr, tRes) => {
          if (tErr) {
            console.error(tErr);
            return res.status(500).json({ error: 'Task creation failed' });
          }
          logActivity(`created task **${title}**`, 'task', tRes.insertId, req.user.id, req.user.company_id);
          if (req.app.locals.io) {
            req.app.locals.io.emit("refresh_tasks");
            if (req.user.company_id) {
              req.app.locals.io.to(`company_${req.user.company_id}`).emit("new_notification", {
                type: 'task',
                title: 'New Task',
                content: `**${title}** was created`,
                user_id: req.user.id,
                created_at: new Date().toISOString(),
                link: '/tasks'
              });
            }
          }
          res.status(201).json({ id: tRes.insertId, message: 'Task created' });
        }
      );
    }
  });
});

// GET tasks visible to requester
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', project_id, status, priority, assigned_to } = req.query;
    const offset = (Number.parseInt(page) - 1) * Number.parseInt(limit);
    const companyFilter = req.user.company_id || null;

    let query = "";
    let params = [];
    let countQuery = "";

    const filterSQL = [];
    const filterParams = [];

    if (search) {
      filterSQL.push("t.title LIKE ?");
      filterParams.push(`%${search}%`);
    }
    if (project_id) {
      filterSQL.push("t.project_id = ?");
      filterParams.push(project_id);
    }
    if (status) {
      filterSQL.push("t.status = ?");
      filterParams.push(status);
    }
    if (priority) {
      filterSQL.push("t.priority = ?");
      filterParams.push(priority);
    }
    if (assigned_to) {
      if (assigned_to === 'UNASSIGNED') {
        filterSQL.push("t.assigned_to IS NULL");
      } else {
        filterSQL.push("t.assigned_to = ?");
        filterParams.push(assigned_to);
      }
    }

    if (req.user.role === 'admin' && companyFilter) {
      const baseFilter = "tm.company_id <=> ?";
      const allFilters = [baseFilter, ...filterSQL].join(" AND ");
      query = `SELECT t.*, p.title as project_title FROM tasks t JOIN projects p ON t.project_id = p.id JOIN teams tm ON p.team_id = tm.id WHERE ${allFilters} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM tasks t JOIN projects p ON t.project_id = p.id JOIN teams tm ON p.team_id = tm.id WHERE ${allFilters}`;
      params = [companyFilter, ...filterParams, Number.parseInt(limit), offset];
    } else {
      const baseFilter = "(t.assigned_to = ? OR tm2.user_id = ?) AND (tm.company_id = ? OR ? IS NULL)";
      const allFilters = [baseFilter, ...filterSQL].join(" AND ");
      query = `SELECT DISTINCT t.*, p.title as project_title FROM tasks t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN teams tm ON p.team_id = tm.id LEFT JOIN team_members tm2 ON tm2.team_id = tm.id WHERE ${allFilters} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(DISTINCT t.id) as total FROM tasks t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN teams tm ON p.team_id = tm.id LEFT JOIN team_members tm2 ON tm2.team_id = tm.id WHERE ${allFilters}`;
      params = [req.user.id, req.user.id, companyFilter, companyFilter, ...filterParams, Number.parseInt(limit), offset];
    }

    const [[{ total }]] = await db.promise().query(countQuery, params.slice(0, -2));
    const [tasks] = await db.promise().query(query, params);

    res.json({
      tasks,
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

// UPDATE TASK (admin or assigned user / creator)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { title, description, status, assigned_to, project_id, team_id, priority, due_date } = req.body;

    const [rows] = await db.promise().query(
      'SELECT t.*, p.team_id as project_team_id, tm.company_id as team_company_id FROM tasks t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN teams tm ON COALESCE(t.team_id, p.team_id) = tm.id WHERE t.id = ?',
      [taskId]
    );

    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = rows[0];
    const isAssigned = String(task.assigned_to) === String(req.user.id);
    const isOwner = String(task.created_by) === String(req.user.id);
    const isAdmin = req.user.role === 'admin' && (!req.user.company_id || !task.team_company_id || String(req.user.company_id) === String(task.team_company_id));

    if (!isAdmin && !isAssigned && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    const allowedStatuses = ['Todo', 'In Progress', 'Review', 'Done'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (!isAdmin) {
      if (assigned_to !== undefined || project_id !== undefined || team_id !== undefined) {
        return res.status(403).json({ error: 'Only admins can reassign or move tasks' });
      }
    }

    // Build dynamic update query to only update provided fields
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description ?? '');
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (due_date !== undefined) {
      const normalizedDueDate = normalizeDueDate(due_date);
      if (normalizedDueDate.error) {
        return res.status(400).json({ error: normalizedDueDate.error });
      }
      updates.push('due_date = ?');
      params.push(normalizedDueDate.value);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (assigned_to !== undefined) {
      updates.push('assigned_to = ?');
      params.push(assigned_to ?? null);
    }
    if (project_id !== undefined) {
      updates.push('project_id = ?');
      params.push(project_id ?? null);
    }
    if (team_id !== undefined) {
      updates.push('team_id = ?');
      params.push(team_id ?? null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(taskId);

    await db.promise().query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logActivity(`updated task **${title ?? task.title}** to **${status ?? task.status}**`, 'task', taskId, req.user.id, req.user.company_id);
    if (req.app.locals.io) {
      req.app.locals.io.emit("refresh_tasks");
      if (req.user.company_id) {
        req.app.locals.io.to(`company_${req.user.company_id}`).emit("new_notification", {
          type: 'task',
          title: 'Task Updated',
          content: `**${title ?? task.title}** moved to **${status ?? task.status}**`,
          user_id: req.user.id,
          created_at: new Date().toISOString(),
          link: '/tasks'
        });
      }
    }
    return res.json({ message: 'Task updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Task update failed' });
  }
});

// DELETE TASK (admin or assigned user / creator)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const taskId = req.params.id;

    const [rows] = await db.promise().query(
      'SELECT t.*, tm.company_id as team_company_id FROM tasks t LEFT JOIN teams tm ON COALESCE(t.team_id, (SELECT team_id FROM projects WHERE id = t.project_id)) = tm.id WHERE t.id = ?',
      [taskId]
    );

    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = rows[0];
    const isAssigned = String(task.assigned_to) === String(req.user.id);
    const isOwner = String(task.created_by) === String(req.user.id);
    const isAdmin = req.user.role === 'admin' && (!req.user.company_id || !task.team_company_id || String(req.user.company_id) === String(task.team_company_id));

    if (!isAdmin && !isAssigned && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    await db.promise().query('DELETE FROM tasks WHERE id = ?', [taskId]);

    logActivity(`deleted task **${task.title}**`, 'task', taskId, req.user.id, req.user.company_id);
    if (req.app.locals.io) req.app.locals.io.emit("refresh_tasks");
    return res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Task delete failed' });
  }
});

// POST ATTACHMENT
router.post('/:id/attachments', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const taskId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    await db.promise().query(
      'INSERT INTO task_attachments (task_id, file_name, file_path, uploaded_by) VALUES (?, ?, ?, ?)',
      [taskId, req.file.originalname, req.file.filename, req.user.id]
    );

    logActivity(`attached file to task`, 'task', taskId, req.user.id, req.user.company_id);
    if (req.app.locals.io) req.app.locals.io.emit("refresh_tasks");
    return res.json({ message: 'File uploaded', file: req.file.filename });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET ATTACHMENTS
router.get('/:id/attachments', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      'SELECT a.*, u.name as uploader_name FROM task_attachments a JOIN users u ON a.uploaded_by = u.id WHERE task_id = ? ORDER BY a.created_at DESC',
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
