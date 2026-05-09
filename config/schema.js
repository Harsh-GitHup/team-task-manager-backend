const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
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
    email VARCHAR(255) DEFAULT NULL,
    expires_at DATETIME DEFAULT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invite_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_invite_creator FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function initializeSchema(db) {
  const promiseDb = db.promise();

  for (const statement of schemaStatements) {
    await promiseDb.query(statement);
  }

  const [projectTeamColumns] = await promiseDb.query("SHOW COLUMNS FROM projects LIKE 'team_id'");
  if (projectTeamColumns.length === 0) {
    await promiseDb.query("ALTER TABLE projects ADD COLUMN team_id INT NULL AFTER description");
  }

  const [projectsCompany] = await promiseDb.query("SHOW COLUMNS FROM projects LIKE 'company_id'");
  if (projectsCompany.length === 0) {
    await promiseDb.query("ALTER TABLE projects ADD COLUMN company_id INT NULL AFTER team_id");
  }

  const [projectsColor] = await promiseDb.query("SHOW COLUMNS FROM projects LIKE 'color'");
  if (projectsColor.length === 0) {
    await promiseDb.query("ALTER TABLE projects ADD COLUMN color VARCHAR(32) DEFAULT '#7c6aff' AFTER description");
  }

  const [teamsCompany] = await promiseDb.query("SHOW COLUMNS FROM teams LIKE 'company_id'");
  if (teamsCompany.length === 0) {
    await promiseDb.query("ALTER TABLE teams ADD COLUMN company_id INT NULL AFTER admin_id");
  }

  const [usersCompany] = await promiseDb.query("SHOW COLUMNS FROM users LIKE 'company_id'");
  if (usersCompany.length === 0) {
    await promiseDb.query("ALTER TABLE users ADD COLUMN company_id INT NULL AFTER role");
  }

  const [teamMemberRole] = await promiseDb.query("SHOW COLUMNS FROM team_members LIKE 'role'");
  if (teamMemberRole.length === 0) {
    await promiseDb.query("ALTER TABLE team_members ADD COLUMN role ENUM('member','head') DEFAULT 'member' AFTER user_id");
  }

  const [tasksDescription] = await promiseDb.query("SHOW COLUMNS FROM tasks LIKE 'description'");
  if (tasksDescription.length === 0) {
    await promiseDb.query("ALTER TABLE tasks ADD COLUMN description TEXT AFTER team_id");
  }

  const [tasksPriority] = await promiseDb.query("SHOW COLUMNS FROM tasks LIKE 'priority'");
  if (tasksPriority.length === 0) {
    await promiseDb.query("ALTER TABLE tasks ADD COLUMN priority ENUM('low','medium','high') DEFAULT 'medium' AFTER description");
  }

  const [tasksDueDate] = await promiseDb.query("SHOW COLUMNS FROM tasks LIKE 'due_date'");
  if (tasksDueDate.length === 0) {
    await promiseDb.query("ALTER TABLE tasks ADD COLUMN due_date DATE DEFAULT NULL AFTER priority");
  }

  const [tasksCreatedBy] = await promiseDb.query("SHOW COLUMNS FROM tasks LIKE 'created_by'");
  if (tasksCreatedBy.length === 0) {
    await promiseDb.query("ALTER TABLE tasks ADD COLUMN created_by INT NULL AFTER status");
  }

  // create companies table if not exists handled in schemaStatements
  // create invite_tokens handled in schemaStatements

  // Create default company
  const [companies] = await promiseDb.query("SELECT id FROM companies WHERE name = 'Default'");
  let defaultCompanyId = null;
  if (companies.length === 0) {
    const [result] = await promiseDb.query("INSERT INTO companies (name) VALUES ('Default')");
    defaultCompanyId = result.insertId;
  } else {
    defaultCompanyId = companies[0].id;
  }

  // Seed admin user with default company
  await promiseDb.query(
    `INSERT IGNORE INTO users (id, name, email, password, role, company_id)
     VALUES (1, 'Admin', 'admin@team.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', ?)`,
    [defaultCompanyId]
  );

  // If admin already exists (INSERT IGNORE didn't insert), update company_id
  await promiseDb.query(
    "UPDATE users SET company_id = ? WHERE id = 1 AND company_id IS NULL",
    [defaultCompanyId]
  );

  console.log("✅ Database schema ready");
}

module.exports = { initializeSchema };
