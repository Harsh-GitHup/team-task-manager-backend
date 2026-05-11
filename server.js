const express = require("express");
const cors = require("cors");
const http = require("node:http");
const { Server } = require("socket.io");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const teamRoutes = require("./routes/team");
const chatRoutes = require("./routes/chat");
const projectRoutes = require("./routes/project");
const taskRoutes = require("./routes/task");
const inviteRoutes = require("./routes/invite");
const db = require("./config/db");
const { initializeSchema } = require("./config/schema");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Make io available in routes
app.locals.io = io;

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join_team", (teamId) => {
    socket.join(`team_${teamId}`);
  });

  socket.on("join_company", (companyId) => {
    if (companyId) {
      socket.join(`company_${companyId}`);
      console.log(`Socket ${socket.id} joined company_${companyId}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

app.use(cors());
app.use(express.json());

let schemaReady = false;
let schemaError = null;

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Backend is running 🚀",
    schemaReady,
  });
});

// Health check
app.get("/health", (req, res) => {
  db.query("SELECT 1", (err) => {
    if (err) {
      return res.status(200).json({
        status: "DEGRADED",
        db: "error",
        schemaReady,
        schemaError: schemaError ? String(schemaError.message || schemaError) : null,
      });
    }

    return res.status(200).json({
      status: schemaReady ? "OK" : "STARTING",
      db: "connected",
      schemaReady,
      schemaError: schemaError ? String(schemaError.message || schemaError) : null,
    });
  });
});

const activityRoutes = require("./routes/activity").router;

// Routes
app.use("/auth", authRoutes);
app.use("/teams", teamRoutes);
app.use("/chat", chatRoutes);
app.use("/projects", projectRoutes);
app.use("/tasks", taskRoutes);
app.use("/invites", inviteRoutes);
app.use("/activities", activityRoutes);

const fs = require('node:fs');

// Ensure uploads dir exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Serve attachments statically
app.use("/uploads", express.static("uploads"));

const resolvedPort = Number(process.env.PORT);
const PORT = Number.isFinite(resolvedPort) && resolvedPort > 0 ? resolvedPort : 8080;
const HOST = "0.0.0.0";

async function initSchemaWithRetry(maxRetries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await initializeSchema(db);
      schemaReady = true;
      schemaError = null;
      console.log("✅ Database schema ready");
      return;
    } catch (error) {
      schemaError = error;
      console.error(`❌ Schema init failed (attempt ${attempt}/${maxRetries}):`, error.message);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  console.error("❌ Schema initialization failed after retries. Service stays up for diagnostics.");
}

function startServer() {
  server.listen(PORT, HOST, async () => {
    console.log(`🚀 Server running on ${HOST}:${PORT}`);
    console.log(`ℹ️ process.env.PORT=${process.env.PORT || "<undefined>"}`);
    await initSchemaWithRetry();
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

startServer();