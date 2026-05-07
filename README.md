# Task Manager Backend

This folder contains the Express + MySQL API for the company-scoped Team Task Manager app.
It now supports invite-based signup, admin/team-head/member workflow, team chat, and multi-tenant isolation through `company_id`.

## What it does

- Authenticates users with signup and login
- Issues JWT tokens for protected routes
- Supports invite-token signup so admins can onboard users into the correct company
- Manages companies, teams, team membership, and team heads
- Creates and lists projects and tasks with team/company visibility rules
- Supports task descriptions, assignees, creators, and status updates
- Provides team chat messaging

## Key files

- `server.js` - Express entrypoint and route mounting
- `config/db.js` - MySQL pool connection
- `config/schema.js` - startup schema initialization and migrations
- `middleware/authMiddleware.js` - JWT verification and admin checks
- `routes/auth.js` - signup, login, and company-scoped user lookup
- `routes/invite.js` - invite-token creation for onboarding users
- `routes/team.js` - team creation, membership, head assignment, and team queries
- `routes/project.js` - project creation and listing
- `routes/task.js` - task creation, listing, and status updates
- `routes/chat.js` - team message send and retrieval
- `scripts/admin_e2e.js` - scripted admin-to-member end-to-end flow
- `schema.sql` - manual schema bootstrap for fresh databases

## How it works

- Uses `dotenv` to load environment variables from `.env`
- Uses `mysql2` for database queries
- Uses `bcrypt` to hash passwords
- Uses `jsonwebtoken` to generate and validate JWT tokens
- Uses `company_id` to keep data scoped to the correct tenant
- Protects routes with `verifyToken`
- Restricts admin-only flows with `isAdmin`

## API Endpoints

- `POST /auth/signup` - create a new user, optionally through an invite token
- `POST /auth/login` - login and receive a JWT token
- `GET /auth/users` - list users for the authenticated company
- `POST /invites` - create an invite link
- `GET /projects` - list projects for the authenticated user
- `POST /projects` - create a project for a team
- `GET /tasks` - get tasks visible to the user
- `POST /tasks` - create a new task
- `PUT /tasks/:id` - update task status
- `GET /teams` - get teams where the user is a member
- `POST /teams` - create a new team
- `POST /teams/add-member` - add a member to a team
- `POST /teams/set-head` - mark a team member as team head
- `GET /teams/:teamId/members` - list members in a team
- `GET /chat/:teamId` - fetch messages for a team
- `POST /chat` - send a team message

## Setup Instructions

### 1. Install dependencies

```bash
cd Backend
npm install
```

### 2. Create `.env`

```env
PORT=5000
DATABASE_URL=mysql://<user>:<password>@<host>:<port>/<database>
JWT_SECRET=your-secret-key
```

### 3. Run the server

```bash
npm start
```

### 4. Seed or migrate the database

- Use `config/schema.js` when starting the server to auto-create and update tables.
- Use `schema.sql` if you want to initialize a fresh MySQL database manually.

## Notes

- The backend uses `verifyToken` to protect the data routes.
- Invite tokens are company-scoped so new users join the right tenant.
- Tasks and projects now store `description` and `created_by` metadata.
- Team membership is checked before returning tasks, projects, and chat messages.
- The backend includes an admin E2E script for validating the full invite-to-task flow.

## Improvements

- Add request validation middleware
- Add pagination for projects, tasks, and messages
- Add structured logging
- Add real-time chat with WebSockets
- Add user profile management and password reset flows
- Add charts and graphs to the dashboard with aggregated data from the backend
- Add more granular permissions (e.g. team heads can manage their teams but not others)
