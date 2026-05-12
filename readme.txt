================================================================================
  TASK MANAGER BACKEND - README
================================================================================

PROJECT OVERVIEW
================================================================================

This is the Express.js + MySQL backend for a full-stack Team Task Manager 
application. It provides a comprehensive REST API for managing teams, projects, 
tasks, and real-time collaboration features. The backend is designed for 
multi-tenant (company-scoped) operations with role-based access control, 
Socket.IO real-time updates, and enterprise-grade features like activity 
tracking, file uploads, and data seeding.

KEY FEATURES
================================================================================

✓ Multi-Tenant Architecture
  - Complete data isolation through company_id scoping
  - Supports unlimited companies with independent workspaces

✓ Authentication & Authorization
  - JWT-based authentication with secure password hashing (bcryptjs)
  - Role-based access control: admin, team head, member
  - Invite-token system for secure onboarding

✓ Team Management
  - Create, update, and manage teams
  - Assign team members with different roles
  - Set team heads for delegation

✓ Project & Task Management
  - Full CRUD operations for projects and tasks
  - Rich metadata: descriptions, colors, emojis, priorities, due dates
  - Task assignment and status tracking
  - File attachments on tasks

✓ Real-Time Collaboration
  - Socket.IO integration for live updates
  - Team chat with real-time messaging
  - Activity feed tracking for all operations

✓ Data Persistence & Performance
  - MySQL database with automatic schema initialization
  - Transactional operations for data consistency
  - Database indexing on all critical query paths
  - Large-scale data seeding capability (600+ tasks, 180+ users)

✓ Security & Compliance
  - CORS configuration for cross-origin requests
  - Secure file upload handling with multer
  - UTF8MB4 support for international characters and emoji

================================================================================
REPOSITORY STRUCTURE
================================================================================

Backend/
├── server.js                  # Express server setup, Socket.IO, routing
├── package.json              # Dependencies and scripts
├── .env                       # Environment variables (local development)
├── .env.example              # Template for environment variables
├── schema.sql                # SQL schema definition for manual setup
├── nixpacks.toml             # Railway deployment configuration
├── README.md                 # Quick reference (markdown)
├── readme.txt                # This file
│
├── config/
│   ├── db.js                 # MySQL connection pool and configuration
│   └── schema.js             # Automatic schema initialization on startup
│
├── middleware/
│   └── authMiddleware.js     # JWT verification and role checks
│
├── routes/
│   ├── auth.js               # Signup, login, user lookup
│   ├── invite.js             # Invite token generation, validation, joining
│   ├── team.js               # Team CRUD and membership management
│   ├── project.js            # Project CRUD operations
│   ├── task.js               # Task CRUD and file attachments
│   ├── chat.js               # Team messaging
│   └── activity.js           # Activity feed and logging
│
├── scripts/
│   ├── admin_e2e.js          # End-to-end flow test script
│   └── seed.js               # Large-scale database seeder
│
├── uploads/                  # Directory for task attachments
└── .gitignore               # Git ignore rules

================================================================================
QUICK START GUIDE
================================================================================

1. INSTALL DEPENDENCIES

   cd Backend
   npm install

2. CONFIGURE ENVIRONMENT

   Create a .env file (or copy from .env.example):

   DATABASE_URL=mysql://user:password@host:port/database
   JWT_SECRET=your-secret-key-here
   PORT=5000
   CORS_ORIGIN=http://localhost:5173
   FRONTEND_URL=http://localhost:5173

   For local development with MySQL:
   DATABASE_URL=mysql://root:password@localhost:3306/team_db

   Or individual DB config:
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=yourpassword
   DB_NAME=team_db
   JWT_SECRET=your-secret-key
   PORT=5000

3. START THE SERVER

   npm start

   The server will:
   - Connect to the database
   - Initialize schema automatically
   - Seed a default admin user if needed
   - Start listening on PORT (default: 5000)
   - Display health check at http://localhost:5000/health

4. TEST THE API

   Health check:
   curl http://localhost:5000/health

   Login:
   curl -X POST http://localhost:5000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@team.com","password":"password"}'

================================================================================
DATABASE SETUP
================================================================================

AUTOMATIC (RECOMMENDED)
   The schema initializes automatically on server start via config/schema.js.
   Tables and indexes are created automatically.

MANUAL SETUP
   If you need to set up the database manually:
   1. Create database: CREATE DATABASE team_db;
   2. Import schema: mysql -u root -p team_db < schema.sql
   3. Start the server to complete schema migration

DEFAULT DATA
   On first startup, the backend creates:
   - A default company: "Default"
   - An admin user:
     Email: admin@team.com
     Password: password
   
   Change these credentials in production!

================================================================================
SCRIPTS
================================================================================

npm start
   Starts the Express server with Socket.IO support.
   Automatically initializes database schema on startup.
   Usage: npm start

npm run seed
   Generates large-scale test data for stress testing:
   - 6 companies
   - 180+ users per company
   - 5 teams per company
   - 4 projects per team
   - 5 tasks per project
   
   This script:
   1. Clears existing data
   2. Creates realistic user accounts
   3. Sets up team structures
   4. Generates projects with metadata
   5. Creates tasks with assignments
   
   WARNING: This deletes all existing data!
   Usage: npm run seed
   Run after: npm start (to ensure database is ready)

admin_e2e.js
   Automated test script that validates the complete flow:
   - Admin login
   - Invite creation
   - User signup with invite
   - Team creation
   - User addition to team
   - Project creation
   - Task creation
   
   Usage: node scripts/admin_e2e.js
   Set BASE environment variable to test different endpoints:
   BASE=http://your-backend:5000 node scripts/admin_e2e.js

================================================================================
ENVIRONMENT VARIABLES
================================================================================

Required:
   DATABASE_URL          MySQL connection string
   JWT_SECRET           Secret key for JWT token signing

Optional:
   PORT                 Server port (default: 5000)
   FRONTEND_URL         Frontend URL for invite links (default: http://localhost:5173)
   CORS_ORIGIN          Comma-separated CORS allowed origins

Examples:

   DATABASE_URL=mysql://root:password@localhost:3306/team_db
   DATABASE_URL=mysql://user:pass@containers-us-west-XXX.railway.app:7284/railway

   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

   CORS_ORIGIN=http://localhost:5173,https://yourdomain.com

================================================================================
API ENDPOINTS
================================================================================

AUTHENTICATION
   POST   /auth/signup           Create a new user
   POST   /auth/login            Login and receive JWT
   GET    /auth/users            List users in company (admin only)

INVITES
   POST   /invites               Create invite link (admin only)
   GET    /invites/:token        Get invite details
   POST   /invites/join          Join via invite (logged in)

TEAMS
   GET    /teams                 List user's teams
   POST   /teams                 Create team (admin only)
   PUT    /teams/:id             Update team (admin only)
   DELETE /teams/:id             Delete team (admin only)
   POST   /teams/add-member      Add member to team
   POST   /teams/set-head        Set team head
   GET    /teams/:teamId/members List team members
   PUT    /teams/:teamId/members/:userId  Update member role
   DELETE /teams/:teamId/members/:userId  Remove member

PROJECTS
   GET    /projects              List projects
   POST   /projects              Create project
   PUT    /projects/:id          Update project
   DELETE /projects/:id          Delete project

TASKS
   GET    /tasks                 List tasks
   POST   /tasks                 Create task
   PUT    /tasks/:id             Update task
   DELETE /tasks/:id             Delete task
   POST   /tasks/:id/attachments Upload file to task

CHAT
   GET    /chat/:teamId          Get team messages
   POST   /chat                  Send message

ACTIVITY
   GET    /activities            Get company activity feed

UTILITY
   GET    /                      Server status
   GET    /health                Health check with DB status

================================================================================
DEPLOYMENT
================================================================================

RAILWAY DEPLOYMENT

Railway is configured via nixpacks.toml:
- Install: npm ci --omit=dev (production dependencies only)
- Start:   npm start

Steps to deploy:
1. Push code to GitHub
2. Connect GitHub repo to Railway
3. Set environment variables in Railway dashboard:
   - DATABASE_URL (Railway MySQL service)
   - JWT_SECRET (generate a strong secret)
   - CORS_ORIGIN (your frontend URL)
4. Deploy

DOCKER DEPLOYMENT

Create Dockerfile:
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --omit=dev
   COPY . .
   EXPOSE 5000
   CMD ["npm", "start"]

Build and run:
   docker build -t task-manager-backend .
   docker run -e DATABASE_URL=<url> -e JWT_SECRET=<secret> -p 5000:5000 task-manager-backend

ENVIRONMENT SETUP FOR PRODUCTION

1. Generate strong JWT_SECRET:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

2. Use managed MySQL service (Railway, AWS RDS, etc.)

3. Configure CORS for your domain:
   CORS_ORIGIN=https://yourdomain.com

4. Keep .env file secure - never commit to version control

5. Monitor logs and performance

================================================================================
SOCKET.IO EVENTS
================================================================================

Client can join channels:
   socket.emit('join_team', teamId)     # Join team chat room
   socket.emit('join_company', companyId) # Join company updates

Server broadcasts:
   refresh_tasks      # Tasks have changed (UI should reload)
   refresh_projects   # Projects have changed (UI should reload)
   new_message        # New chat message in team
   refresh_activities # Activity feed updated

================================================================================
TROUBLESHOOTING
================================================================================

"Database connection failed"
   - Check DATABASE_URL format
   - Verify MySQL is running
   - Test connection: mysql -u user -p -h host database

"JWT error: invalid token"
   - Ensure JWT_SECRET is consistent across restarts
   - Check token hasn't expired
   - Verify Authorization header format: "Bearer <token>"

"CORS error in browser"
   - Add frontend URL to CORS_ORIGIN environment variable
   - Separate multiple origins with commas
   - Restart server after changing .env

"Seeding fails"
   - Ensure database is initialized: npm start (let it complete once)
   - Check DATABASE_URL is correct
   - Clear .env issues: npm run seed might need DATABASE_URL set

"Socket.IO connections failing"
   - Verify CORS_ORIGIN matches frontend domain
   - Check firewall allows WebSocket connections
   - Verify frontend is connecting to correct backend URL

================================================================================
MAINTENANCE
================================================================================

Regular Tasks:
   1. Monitor database size and performance
   2. Review activity logs for suspicious patterns
   3. Update npm dependencies: npm update
   4. Backup database regularly
   5. Rotate JWT_SECRET periodically (requires token refresh)

Performance Optimization:
   - Database indexes are set up on all critical paths
   - Query results are scoped by company_id for efficiency
   - Use pagination on large lists (implement as needed)
   - Monitor Socket.IO connection count

Security Practices:
   - Never commit .env to version control
   - Rotate JWT_SECRET every 6 months
   - Use HTTPS in production
   - Rate limit API endpoints (implement as needed)
   - Validate and sanitize all inputs

================================================================================
SUPPORT & DOCUMENTATION
================================================================================

- Frontend: ../Frontend/README.md
- Root Project: ../README.txt
- Full API: See Backend/README.md

For issues or questions, review the relevant route files in routes/ directory.

================================================================================
Version: 1.0.0
Last Updated: 2026
License: See LICENSE file
================================================================================
