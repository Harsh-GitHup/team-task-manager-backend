# Team Task Manager - Backend

This folder contains the Express + MySQL API for the company-scoped Team Task Manager app. It supports invite-based onboarding, company isolation through `company_id`, team roles, activity tracking, file uploads, and Socket.IO updates for projects, tasks, chat, and notifications.

## What it does

- Authenticates users with signup and login
- Issues JWT tokens for protected routes
- Supports invite-token signup and invite-based team joining
- Manages companies, teams, team membership, and team heads
- Creates, updates, lists, and deletes projects and tasks with company/team visibility rules
- Supports pagination and search on the main list endpoints
- Supports task descriptions, priorities, due dates, assignees, creators, and attachments
- Stores company activity feed events for the dashboard
- Provides team chat messaging over HTTP and Socket.IO

## Current API surface

### Auth

- `POST /auth/signup` - create a new user, optionally through an invite token
- `POST /auth/login` - login and receive a JWT token
- `GET /auth/users` - list users for the authenticated company, with optional `search`

### Invites

- `POST /invites` - admin-only invite creation, with optional email, team, and expiry
- `GET /invites/:token` - inspect invite details
- `POST /invites/join` - join a company and optional team while logged in

### Teams

- `GET /teams` - list teams visible to the current user
- `POST /teams` - create a team, admin only
- `PUT /teams/:id` - rename a team, admin only
- `DELETE /teams/:id` - delete a team, admin only
- `POST /teams/add-member` - add a user to a team
- `POST /teams/set-head` - mark a team member as head
- `GET /teams/:teamId/members` - list team members
- `PUT /teams/:teamId/members/:userId` - update a member role
- `DELETE /teams/:teamId/members/:userId` - remove a member from a team

### Projects

- `GET /projects` - list projects visible to the current user, with `page`, `limit`, and `search`
- `POST /projects` - create a project with title, description, color, emoji, and team
- `PUT /projects/:id` - update a project
- `DELETE /projects/:id` - delete a project and its tasks

### Tasks

- `GET /tasks` - list visible tasks, with `page`, `limit`, `search`, `project_id`, `status`, `priority`, and `assigned_to`
- `POST /tasks` - create a task with description, priority, due date, assignee, project, and team
- `PUT /tasks/:id` - update a task
- `DELETE /tasks/:id` - delete a task
- `POST /tasks/:id/attachments` - upload a task attachment
- `GET /tasks/:id/attachments` - list uploaded attachments for a task

### Chat and Activity

- `GET /chat/:teamId` - fetch recent team messages
- `POST /chat` - send a team message
- `GET /activities` - fetch recent company activity items

### Utility

- `GET /` - runtime status with schema readiness
- `GET /health` - health check with database and schema state

## How it works

- Uses `dotenv` to load environment variables from `.env`
- Uses `mysql2` for database queries
- Uses `bcryptjs` to hash passwords
- Uses `jsonwebtoken` to generate and validate JWT tokens
- Uses `socket.io` to broadcast task, project, chat, and notification updates
- Uses `company_id` to keep data scoped to the correct tenant
- Protects routes with `verifyToken`
- Restricts admin-only flows with `isAdmin`

## Key files

- `server.js` - Express entrypoint, health checks, uploads, and Socket.IO wiring
- `config/db.js` - MySQL pool connection
- `config/schema.js` - startup schema initialization and migrations
- `middleware/authMiddleware.js` - JWT verification and admin checks
- `routes/auth.js` - signup, login, and company-scoped user lookup
- `routes/invite.js` - invite-token creation, lookup, and join flow
- `routes/team.js` - team creation, membership, role updates, and deletion
- `routes/project.js` - project creation, listing, update, and delete
- `routes/task.js` - task creation, listing, update, delete, and attachments
- `routes/chat.js` - team message send and retrieval
- `routes/activity.js` - activity feed retrieval and logging helper
- `scripts/admin_e2e.js` - scripted admin-to-member end-to-end flow
- `scripts/seed.js` - large-scale test data generator
- `schema.sql` - manual schema bootstrap for fresh databases

## Setup instructions

### 1. Install dependencies

```bash
cd Backend
npm install
```

### 2. Create `.env`

Use either a connection string or individual MySQL fields:

```env
DATABASE_URL=mysql://<user>:<password>@<host>:<port>/<database>
JWT_SECRET=your-secret-key
PORT=5000
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

Or:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=team_db
JWT_SECRET=your-secret-key
PORT=5000
```

### 3. Run the server

```bash
npm start
```

The server starts on `PORT` (default `5000`), initializes the schema on startup, and exposes a health check at `/health`.

### 4. Optional seed data

```bash
npm run seed
```

This clears the database and generates a large demo dataset for testing.

## Runtime details

- The backend creates a default admin user at `admin@team.com` with password `password` and a default company on first startup when the database is empty.
- Invite tokens are company-scoped, and invite links point to the frontend invite route.
- Projects support `description`, `color`, `emoji`, and `created_by` metadata.
- Tasks support `description`, `priority`, `due_date`, `status`, `assigned_to`, `created_by`, and attachments.
- Chat and dashboard data refresh through Socket.IO events.
- `POST /tasks/:id/attachments` stores files in `Backend/uploads` and serves them from `/uploads`.

## Enterprise features

- Server-side pagination for large project and task lists
- Search support on `GET /projects`, `GET /tasks`, and `GET /auth/users`
- Large-scale seeding for high-volume testing
- Automatic schema initialization and startup retry logic
- Company-scoped authorization for multi-tenant isolation
- Activity logging for key workspace changes

## Deployment notes

- Railway uses `nixpacks.toml` to run `npm ci --omit=dev` during install and `npm start` during launch
- Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, and `FRONTEND_URL` in production
- Use a managed MySQL service for production workloads
- Keep `.env` out of version control

## Socket.IO events

- `join_team(teamId)` - join a team room
- `join_company(companyId)` - join a company room
- `refresh_tasks` - task data changed
- `refresh_projects` - project data changed
- `new_message` - chat message broadcast
- `new_notification` - company notification broadcast

## Notes

- The admin E2E script exercises the invite, team, project, and task flow end to end.
- `config/schema.js` keeps the database schema current on startup, so manual migrations are usually only needed for brand new databases.
