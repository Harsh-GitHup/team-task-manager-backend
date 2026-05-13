const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin', 'head') DEFAULT 'user',
    company_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    admin_id INT,
    company_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_teams_admin FOREIGN KEY (admin_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(32) DEFAULT '#7c6aff',
    emoji VARCHAR(16) DEFAULT '📁',
    created_by INT,
    team_id INT,
    company_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_projects_team FOREIGN KEY (team_id) REFERENCES teams(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS team_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT,
    user_id INT,
    role ENUM('member','head') DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams(id),
    CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY unique_team_user (team_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    project_id INT,
    assigned_to INT,
    team_id INT,
    description TEXT,
    priority ENUM('low','medium','high') DEFAULT 'medium',
    due_date DATE DEFAULT NULL,
    status ENUM('Todo', 'In Progress', 'Done') DEFAULT 'Todo',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_tasks_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id),
    CONSTRAINT fk_tasks_team FOREIGN KEY (team_id) REFERENCES teams(id),
    CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT,
    sender_id INT,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_messages_team FOREIGN KEY (team_id) REFERENCES teams(id),
    CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS invite_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    company_id INT,
    team_id INT DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    expires_at DATETIME DEFAULT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invite_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_invite_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_invite_team FOREIGN KEY (team_id) REFERENCES teams(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    user_id INT,
    company_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS task_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    uploaded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attachments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function initializeSchema(db) {
  const promiseDb = db.promise();

  for (const statement of schemaStatements) {
    await promiseDb.query(statement);
  }

  // Helper to safely add column
  const addColumn = async (table, col, definition) => {
    const [cols] = await promiseDb.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [
      col,
    ]);
    if (cols.length > 0) return;

    try {
      await promiseDb.query(
        `ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`,
      );
    } catch (err) {
      // Multi-instance startup can race and attempt the same ALTER simultaneously.
      if (err?.code === "ER_DUP_FIELDNAME") return;

      // If an AFTER target column does not exist on legacy schemas, retry without positioning.
      if (
        err?.code === "ER_BAD_FIELD_ERROR" &&
        /\s+AFTER\s+/i.test(definition)
      ) {
        const fallbackDefinition = definition
          .replace(/\s+AFTER\s+\w+\s*$/i, "")
          .trim();
        await promiseDb.query(
          `ALTER TABLE ${table} ADD COLUMN ${col} ${fallbackDefinition}`,
        );
        return;
      }

      throw err;
    }
  };

  const ensureTaskStatusEnum = async () => {
    const [cols] = await promiseDb.query(
      "SHOW COLUMNS FROM tasks LIKE 'status'",
    );
    if (!cols.length) return;

    const type = String(cols[0].Type || "").toLowerCase();
    if (type.includes("'review'")) return;

    // Keep existing data, but expand enum values used by the frontend.
    await promiseDb.query(
      "ALTER TABLE tasks MODIFY COLUMN status ENUM('Todo','In Progress','Review','Done') DEFAULT 'Todo'",
    );
  };

  // Add missing columns if they don't exist (for safe schema evolution)
  // Projects: team_id, company_id, color, emoji
  await addColumn("projects", "team_id", "INT NULL AFTER description");
  await addColumn("projects", "company_id", "INT NULL AFTER team_id");
  await addColumn(
    "projects",
    "color",
    "VARCHAR(32) DEFAULT '#7c6aff' AFTER description",
  );
  await addColumn(
    "projects",
    "emoji",
    "VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '📁' AFTER color",
  );

  // Teams: company_id, Users: company_id, Team Members: role
  await addColumn("teams", "company_id", "INT NULL AFTER admin_id");
  await addColumn("users", "company_id", "INT NULL AFTER role");
  await addColumn(
    "team_members",
    "role",
    "ENUM('member','head') DEFAULT 'member' AFTER user_id",
  );

  // Tasks: description, priority, due_date, created_by
  await addColumn("tasks", "description", "TEXT AFTER team_id");
  await addColumn(
    "tasks",
    "priority",
    "ENUM('low','medium','high') DEFAULT 'medium' AFTER description",
  );
  await addColumn("tasks", "due_date", "DATE DEFAULT NULL AFTER priority");
  await addColumn("tasks", "created_by", "INT NULL AFTER status");

  // Invite Tokens: team_id, email, expires_at, created_by
  await addColumn("invite_tokens", "team_id", "INT NULL AFTER company_id");
  await addColumn(
    "invite_tokens",
    "email",
    "VARCHAR(255) DEFAULT NULL AFTER team_id",
  );
  await addColumn(
    "invite_tokens",
    "expires_at",
    "DATETIME DEFAULT NULL AFTER email",
  );
  await addColumn("invite_tokens", "created_by", "INT NULL AFTER expires_at");

  // Align enum with app usage (Task status includes "Review" in UI/routes).
  await ensureTaskStatusEnum();

  /*
  // Create default company
  const [companies] = await promiseDb.query("SELECT id FROM companies WHERE name = 'Default'");
  let defaultCompanyId = null;
  if (companies.length === 0) {
    const [result] = await promiseDb.query("INSERT INTO companies (name) VALUES ('Default')");
    defaultCompanyId = result.insertId;
  } else {
    defaultCompanyId = companies[0].id;
  }

  // Seed admin user
  await promiseDb.query(
    `INSERT IGNORE INTO users (id, name, email, password, role, company_id)
     VALUES (1, 'Alex', 'admin@team.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', ?)`,
    [defaultCompanyId]
  );

  await promiseDb.query(
    "UPDATE users SET company_id = ? WHERE id = 1 AND company_id IS NULL",
    [defaultCompanyId]
  );
  */

  // --- Performance Indexes (Safe Version) ---
  const addIndex = async (table, indexName, columns) => {
    try {
      // For older MySQL, we check if index exists via information_schema or just try/catch
      await promiseDb.query(
        `CREATE INDEX ${indexName} ON ${table}(${columns})`,
      );
    } catch (err) {
      if (err?.code === "ER_DUP_KEYNAME") return;
      if (!String(err?.message || "").includes("already exists")) {
        console.warn(`Could not create index ${indexName}:`, err.message);
      }
    }
  };

  await addIndex("tasks", "idx_tasks_project", "project_id");
  await addIndex("tasks", "idx_tasks_assigned", "assigned_to");
  await addIndex("tasks", "idx_tasks_team", "team_id");
  await addIndex("projects", "idx_projects_team", "team_id");
  await addIndex("projects", "idx_projects_company", "company_id");
  await addIndex("users", "idx_users_company", "company_id");
  await addIndex("teams", "idx_teams_company", "company_id");
  await addIndex("team_members", "idx_team_members_team", "team_id");
  await addIndex("team_members", "idx_team_members_user", "user_id");
  await addIndex("invite_tokens", "idx_invite_tokens_team", "team_id");
  await addIndex("invite_tokens", "idx_invite_tokens_email", "email");
}

module.exports = { initializeSchema };
