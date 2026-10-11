const jwt = require("jsonwebtoken");
const db = require("../config/db");

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    db.query(
      "SELECT id, name, email, role, company_id FROM users WHERE id = ?",
      [decoded.id],
      (err, rows) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Database error" });
        }

        if (!rows || rows.length === 0) {
          return res.status(401).json({ error: "Invalid token" });
        }

        req.user = { ...decoded, ...rows[0] };
        next();
      }
    );
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
};

module.exports = { verifyToken, isAdmin };