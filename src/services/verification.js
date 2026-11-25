const crypto = require('crypto');
const config = require('../config');

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;

function newCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashCode(email, code) {
  return crypto.createHash('sha256').update(`${email}:${code}:${config.jwtSecret}`).digest('hex');
}

function codeMatches(email, code, storedHash) {
  const a = Buffer.from(hashCode(email, code), 'hex');
  const b = Buffer.from(String(storedHash || ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function maskEmail(email) {
  const [u, d] = String(email).split('@');
  return (u.length <= 2 ? u[0] + '*' : u[0] + '*'.repeat(Math.min(u.length - 2, 6)) + u.slice(-1)) + '@' + d;
}

module.exports = { newCode, hashCode, codeMatches, maskEmail, CODE_MINUTES, MAX_ATTEMPTS, RESEND_SECONDS, MAX_SENDS_PER_HOUR };
