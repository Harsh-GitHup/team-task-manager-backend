const mysql = require('mysql2');
const dotenv = require('dotenv');
const path = require('node:path');

// Load .env from the Backend directory regardless of where the script is run from
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL || process.env.DATABASE || process.env.DATABASE_URL_DEPRECATED || process.env.DB || '';

// create pool (callback-style)
const pool = mysql.createPool(connectionString || {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'team_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// create promise pool
const promisePool = pool.promise();

// export pool but keep .promise() compatibility so existing code calling db.promise().query(...) works
pool.promise = () => promisePool;

module.exports = pool;