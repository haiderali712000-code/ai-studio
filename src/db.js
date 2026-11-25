const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  connectTimeout: 8000,
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NULL,
    google_id VARCHAR(64) NULL UNIQUE,
    avatar VARCHAR(500) NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user',
    status ENUM('active','banned') NOT NULL DEFAULT 'active',
    credits INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL
  ) CHARACTER SET utf8mb4`);

  // Email sign-ups wait here until the emailed code is confirmed. The user row is only created after that.
  await query(`CREATE TABLE IF NOT EXISTS pending_signups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts TINYINT NOT NULL DEFAULT 0,
    sends TINYINT NOT NULL DEFAULT 1,
    last_sent_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`);

  await query(`CREATE TABLE IF NOT EXISTS jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(40) NOT NULL DEFAULT 'clips',
    input_url VARCHAR(500) NOT NULL,
    video_id VARCHAR(20) NULL,
    title VARCHAR(300) NULL,
    options MEDIUMTEXT NULL,
    result MEDIUMTEXT NULL,
    status ENUM('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
    stage VARCHAR(80) NULL,
    error VARCHAR(500) NULL,
    credits_used INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    INDEX idx_jobs_user (user_id, created_at),
    INDEX idx_jobs_status (status),
    CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`);

  // Every credit change is logged here. Payments will write rows with reason 'purchase'.
  await query(`CREATE TABLE IF NOT EXISTS credit_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    delta INT NOT NULL,
    reason VARCHAR(40) NOT NULL,
    ref VARCHAR(80) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ledger_user (user_id, created_at),
    CONSTRAINT fk_ledger_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`);
}

module.exports = { pool, query, migrate };
