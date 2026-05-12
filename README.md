# Task Manager Backend

This folder contains the Express + MySQL API for the company-scoped Team Task Manager app.
It supports invite-based onboarding, company isolation through `company_id`, team roles, activity tracking, file uploads, and Socket.IO updates for projects, tasks, and chat.

## What it does

- Authenticates users with signup and login
- Issues JWT tokens for protected routes
- Supports invite-token signup and invite-based team joining
- Manages companies, teams, team membership, and team heads
- Creates, updates, lists, and deletes projects and tasks with company/team visibility rules
- Supports task descriptions, priorities, due dates, assignees, creators, and attachments
- Stores company activity feed events for the dashboard
- Provides team chat messaging over HTTP and Socket.IO

## Key files

- `server.js` - Express entrypoint, health checks, static uploads, and Socket.IO wiring
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
- `schema.sql` - manual schema bootstrap for fresh databases

## How it works

- Uses `dotenv` to load environment variables from `.env`
- Uses `mysql2` for database queries
- Uses `bcryptjs` to hash passwords
- Uses `jsonwebtoken` to generate and validate JWT tokens
- Uses `socket.io` to broadcast task, project, and chat updates
- Uses `company_id` to keep data scoped to the correct tenant
- Protects routes with `verifyToken`
- Restricts admin-only flows with `isAdmin`

## API Endpoints

- `GET /` - basic runtime status
- `GET /health` - health check with database and schema state
- `POST /auth/signup` - create a new user, optionally through an invite token
- `POST /auth/login` - login and receive a JWT token
- `GET /auth/users` - list users for the authenticated company
- `POST /invites` - create an invite link
- `GET /invites/:token` - inspect an invite
- `POST /invites/join` - join a team through an invite while logged in
- `GET /projects` - list projects for the authenticated user
- `POST /projects` - create a project for a team
- `PUT /projects/:id` - update a project
- `DELETE /projects/:id` - delete a project and its tasks
- `GET /tasks` - get tasks visible to the user
- `POST /tasks` - create a new task
- `PUT /tasks/:id` - update a task
- `DELETE /tasks/:id` - delete a task
- `POST /tasks/:id/attachments` - upload a task attachment
- `GET /teams` - get teams where the user is a member
- `POST /teams` - create a new team
- `PUT /teams/:id` - update a team name
- `DELETE /teams/:id` - delete a team and its related records
- `POST /teams/add-member` - add a member to a team
- `POST /teams/set-head` - mark a team member as team head
- `PUT /teams/:teamId/members/:userId` - update a team member role
- `DELETE /teams/:teamId/members/:userId` - remove a team member
- `GET /teams/:teamId/members` - list members in a team
- `GET /chat/:teamId` - fetch messages for a team
- `POST /chat` - send a team message
- `GET /activities` - fetch recent company activity

## Setup Instructions

### 1. Install dependencies

```bash
cd Backend
npm install
```

### 2. Create `.env`

```env
DATABASE_URL=mysql://<user>:<password>@<host>:<port>/<database>
JWT_SECRET=your-secret-key
PORT=5000
FRONTEND_URL=http://localhost:5173
```

### 3. Run the server

```bash
npm start
```

### 4. Seed or migrate the database

- `config/schema.js` runs on startup and creates or updates the tables automatically.
- `schema.sql` is available if you want to initialize a fresh MySQL database manually.

## Notes

- The backend seeds a default admin user at `admin@team.com` with password `password` and a default company.
- Invite tokens are company-scoped, and invite links point to the frontend invite route.
- Projects now support `description`, `color`, `emoji`, and `created_by` metadata.
- Tasks now support `description`, `priority`, `due_date`, `status`, `assigned_to`, `created_by`, and attachments.
- Chat and dashboard data refresh through Socket.IO events.
- The admin E2E script exercises the invite, team, project, and task flow end to end.

## Improvements

- Add request validation middleware
- Add pagination for projects, tasks, messages, and activities
- Add structured logging
- Add more granular permissions for team heads
- Add user profile management and password reset flows
