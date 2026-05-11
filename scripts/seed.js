const db = require('../config/db');
const bcrypt = require('bcrypt');

const seed = async () => {
  console.log('🚀 Starting LARGE SCALE database seeding...');
  const pool = db.promise();

  let conn;
  try {
    conn = await pool.getConnection();

    // Helper for random picking
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

    // Data pools for realistic generation
    const firstNames = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzales', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'];
    const companyNames = ['Stark Industries', 'Wayne Enterprises', 'Cyberdyne Systems', 'Aperture Science', 'Oscorp', 'Umbrella Corp', 'Hooli', 'Pied Piper', 'LexCorp', 'Tyrell Corp'];
    const teamNiches = ['Core Eng', 'Frontend', 'Backend', 'DevOps', 'Mobile', 'Design', 'Growth', 'Security', 'QA', 'Infrastructure'];
    const projectEmojis = ['🚀', '🎨', '📱', '⚙️', '☁️', '🗺️', '🔒', '📊', '🌐', '🛠️', '💎', '🔥'];
    const colors = ['#7c6aff', '#2dd4a0', '#ffb347', '#f472b6', '#5b8def', '#9b59ff', '#ff595e', '#1982c4'];

    // ── 🧹 Cleaning old data ──
    console.log('🧹 Cleaning old data safely...');
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    const tables = [
      'task_attachments', 'tasks', 'messages', 'activities',
      'invite_tokens', 'projects', 'team_members', 'teams',
      'users', 'companies'
    ];

    for (const table of tables) {
      await conn.query(`DELETE FROM ${table}`);
      await conn.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log('📦 Pre-hashing passwords...');
    const adminPass = await bcrypt.hash('admin123', 10);
    const userPass = await bcrypt.hash('user123', 10);

    const TOTAL_COMPANIES = 6;
    const USERS_PER_COMPANY = 30;
    const TEAMS_PER_COMPANY = 5;
    const PROJECTS_PER_TEAM = 4;
    const TASKS_PER_PROJECT = 5;

    let totalUsers = 0;
    let totalTeams = 0;
    let totalProjects = 0;
    let totalTasks = 0;

    for (let c = 0; c < TOTAL_COMPANIES; c++) {
      const cName = companyNames[c] || `Company ${c + 1} Corp`;
      console.log(`\n🏢 [${c + 1}/${TOTAL_COMPANIES}] Seeding ${cName}...`);

      // Start a transaction for each company to ensure consistency
      await conn.beginTransaction();

      try {
        // 1. Create Company
        const [compRes] = await conn.query("INSERT INTO companies (name) VALUES (?)", [cName]);
        const companyId = compRes.insertId;

        // 2. Create Admin
        const adminEmail = `admin-${Date.now()}-${c}@${cName.toLowerCase().replaceAll(/\s/g, '')}.com`;
        const [adminRes] = await conn.query(
          "INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, 'admin', ?)",
          [`Admin ${c + 1}`, adminEmail, adminPass, companyId]
        );
        const adminId = adminRes.insertId;
        totalUsers++;

        // 3. Create Users
        const userIds = [];
        for (let u = 0; u < USERS_PER_COMPANY; u++) {
          const fName = pick(firstNames);
          const lName = pick(lastNames);
          const email = `${fName.toLowerCase()}.${lName.toLowerCase()}${u + (c * 1000)}@${cName.toLowerCase().replaceAll(/\s/g, '')}.io`;
          const [uRes] = await conn.query(
            "INSERT INTO users (name, email, password, role, company_id) VALUES (?, ?, ?, 'user', ?)",
            [`${fName} ${lName}`, email, userPass, companyId]
          );
          userIds.push(uRes.insertId);
          totalUsers++;
        }

        // 4. Create Teams
        for (let t = 0; t < TEAMS_PER_COMPANY; t++) {
          const tName = `${pick(teamNiches)} Team ${t + 1}`;
          const [tRes] = await conn.query(
            "INSERT INTO teams (name, admin_id, company_id) VALUES (?, ?, ?)",
            [tName, adminId, companyId]
          );
          const teamId = tRes.insertId;
          totalTeams++;

          // Assign Head
          const headId = Math.random() > 0.5 ? adminId : pick(userIds);
          await conn.query("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'head')", [teamId, headId]);

          // Assign Members
          const teamMembersCount = randomInt(5, 8);
          const selectedMembers = [];
          while (selectedMembers.length < teamMembersCount) {
            const uid = pick(userIds);
            if (!selectedMembers.includes(uid) && uid !== headId) {
              selectedMembers.push(uid);
              await conn.query("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')", [teamId, uid]);
            }
          }

          // 5. Create Projects
          for (let p = 0; p < PROJECTS_PER_TEAM; p++) {
            const pTitle = `${pick(['NextGen', 'Legacy', 'Internal', 'Client', 'Research'])} ${pick(['Portal', 'API', 'System', 'Engine', 'App'])}`;
            const [pRes] = await conn.query(
              "INSERT INTO projects (title, description, emoji, color, created_by, team_id, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [pTitle, `Strategic project for ${tName}`, pick(projectEmojis), pick(colors), adminId, teamId, companyId]
            );
            const projectId = pRes.insertId;
            totalProjects++;

            // 6. Create Tasks
            for (let k = 0; k < TASKS_PER_PROJECT; k++) {
              const tTitle = `${pick(['Optimize', 'Fix', 'Develop', 'Deploy', 'Review'])} ${pick(['Security', 'UI', 'Cache', 'Logs', 'Testing'])} module`;
              const tDesc = `This task involves ${pick(['auditing', 'refactoring', 'extending', 'securing', 'optimizing'])} the ${pick(['performance', 'scalability', 'user experience', 'data integrity', 'integration'])} of the ${pick(['backend services', 'frontend components', 'database queries', 'API endpoints', 'external webhooks'])}.`;
              const status = pick(['Todo', 'In Progress', 'Done']);
              const priority = pick(['low', 'medium', 'high']);
              const assigneeId = pick([headId, ...selectedMembers]);

              // Random due date between 5 years ago and 10 months in future
              const dueDate = new Date();
              const totalDaysRange = (5 * 365) + (10 * 30); // ~2125 days
              const offset = Math.floor(Math.random() * totalDaysRange) - (5 * 365);
              dueDate.setDate(dueDate.getDate() + offset);
              const dueDateStr = dueDate.toISOString().slice(0, 10); // YYYY-MM-DD

              await conn.query(
                "INSERT INTO tasks (title, description, project_id, assigned_to, team_id, status, priority, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tTitle, tDesc, projectId, assigneeId, teamId, status, priority, dueDateStr, adminId]
              );
              totalTasks++;
            }
          }
        }

        await conn.commit();
      } catch (innerErr) {
        await conn.rollback();
        throw innerErr;
      }
    }

    console.log('\n✅ SEEDING COMPLETE!');
    console.log('------------------------------');
    console.log(`🏢 Total Companies: ${TOTAL_COMPANIES}`);
    console.log(`👤 Total Users:     ${totalUsers}`);
    console.log(`👥 Total Teams:     ${totalTeams}`);
    console.log(`📂 Total Projects:  ${totalProjects}`);
    console.log(`📋 Total Tasks:     ${totalTasks}`);
    console.log('------------------------------');

    conn.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    if (conn) {
      try { await conn.query("SET FOREIGN_KEY_CHECKS = 1"); } catch (e) { console.error('Could not reset foreign key checks:', e); }
      conn.release();
    }
    process.exit(1);
  }
};

seed();
