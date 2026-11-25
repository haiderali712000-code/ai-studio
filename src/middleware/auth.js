const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');

const COOKIE = 'token';
const MAX_AGE = 30 * 24 * 3600 * 1000;

function signIn(res, userId) {
  const token = jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.baseUrl.startsWith('https://'),
    maxAge: MAX_AGE,
  });
}

function signOut(res) {
  res.clearCookie(COOKIE);
}

// Loads the current user on every request so bans and credit changes apply immediately.
async function loadUser(req, res, next) {
  req.user = null;
  res.locals.user = null;
  const token = req.cookies && req.cookies[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, config.jwtSecret);
      const rows = await query('SELECT id, name, email, avatar, role, status, credits FROM users WHERE id = ?', [uid]);
      if (rows[0] && rows[0].status === 'active') {
        req.user = rows[0];
        res.locals.user = rows[0];
      }
    } catch { /* invalid or expired token: treat as signed out */ }
  }
  next();
}

function safeNext(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : '/';
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in.' });
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(404).render('404');
}

function isAdminEmail(email) {
  return config.adminEmails.includes(String(email).toLowerCase());
}

module.exports = { signIn, signOut, loadUser, requireAuth, requireAdmin, safeNext, isAdminEmail };
