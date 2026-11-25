const { query } = require('../db');

async function spend(userId, amount, reason, ref) {
  const r = await query('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?', [amount, userId, amount]);
  if (!r.affectedRows) return false;
  await query('INSERT INTO credit_ledger (user_id, delta, reason, ref) VALUES (?,?,?,?)', [userId, -amount, reason, ref || null]);
  return true;
}

// Positive or negative delta. Balance never goes below zero.
async function grant(userId, delta, reason, ref) {
  await query('UPDATE users SET credits = GREATEST(credits + ?, 0) WHERE id = ?', [delta, userId]);
  await query('INSERT INTO credit_ledger (user_id, delta, reason, ref) VALUES (?,?,?,?)', [userId, delta, reason, ref || null]);
}

module.exports = { spend, grant };
