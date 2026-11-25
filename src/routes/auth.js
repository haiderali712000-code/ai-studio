const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { query } = require('../db');
const { grant } = require('../services/credits');
const { signIn, signOut, safeNext, isAdminEmail } = require('../middleware/auth');
const { sendVerificationCode } = require('../services/mailer');
const V = require('../services/verification');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false, message: 'Too many attempts. Try again in a few minutes.' });
const resendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: 'Too many codes requested. Try again later.' });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function googleEnabled() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

router.use((req, res, next) => {
  res.locals.googleEnabled = googleEnabled();
  next();
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Log in', error: req.query.error || null, email: '', next: safeNext(req.query.next) });
});

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('signup', { title: 'Create your account', error: null, values: {} });
});

const PV_COOKIE = 'pv';
const pvCookie = (res, email) => res.cookie(PV_COOKIE, email, { httpOnly: true, sameSite: 'lax', secure: config.baseUrl.startsWith('https://'), maxAge: 30 * 60 * 1000 });

router.post('/signup', limiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 120);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const fail = (error) => res.status(400).render('signup', { title: 'Create your account', error, values: { name, email } });

    if (!name) return fail('Enter your name.');
    if (!EMAIL_RE.test(email) || email.length > 190) return fail('Enter a valid email address.');
    if (password.length < 8) return fail('Use a password with at least 8 characters.');
    if (password.length > 72) return fail('Passwords can be at most 72 characters.');
    if (config.isProd && !config.mail.enabled) return fail('Email sign-up is not available right now. Use Google instead.');

    const exists = (await query('SELECT id, google_id, password_hash FROM users WHERE email = ?', [email]))[0];
    if (exists) {
      return fail(exists.google_id && !exists.password_hash
        ? 'This email is registered with Google. Choose "Continue with Google".'
        : 'An account with this email already exists. Log in instead.');
    }

    await query('DELETE FROM pending_signups WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
    const prev = (await query('SELECT sends, created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) AS recent, last_sent_at > DATE_SUB(NOW(), INTERVAL ? SECOND) AS cooling FROM pending_signups WHERE email = ?', [V.RESEND_SECONDS, email]))[0];
    if (prev && prev.recent && prev.sends >= V.MAX_SENDS_PER_HOUR) return fail('Too many codes were sent to this email. Try again in an hour.');
    if (prev && prev.cooling) { pvCookie(res, email); return res.redirect('/verify'); }

    const hash = await bcrypt.hash(password, 11);
    const code = V.newCode();
    await query(`INSERT INTO pending_signups (email, name, password_hash, code_hash, expires_at, last_sent_at)
      VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE), NOW())
      ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), code_hash = VALUES(code_hash),
        expires_at = VALUES(expires_at), attempts = 0, last_sent_at = NOW(), sends = IF(created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR), sends + 1, 1),
        created_at = IF(created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR), created_at, NOW())`,
    [email, name, hash, V.hashCode(email, code), V.CODE_MINUTES]);
    try {
      await sendVerificationCode({ to: email, name, code, minutes: V.CODE_MINUTES });
    } catch (e) {
      console.error('[mail] send failed:', e.message);
      await query('DELETE FROM pending_signups WHERE email = ?', [email]);
      return fail('We could not send the verification email. Check the address and try again.');
    }
    pvCookie(res, email);
    res.redirect('/verify');
  } catch (e) { next(e); }
});

// ---- Email verification ----
async function pendingFor(req) {
  const email = String(req.cookies[PV_COOKIE] || '').toLowerCase();
  if (!email) return null;
  const p = (await query('SELECT *, expires_at > NOW() AS live FROM pending_signups WHERE email = ?', [email]))[0];
  return p || null;
}
const renderVerify = (res, p, extra = {}) => res.render('verify', { title: 'Verify your email', masked: V.maskEmail(p.email), minutes: V.CODE_MINUTES, error: null, info: null, ...extra });

router.get('/verify', async (req, res, next) => {
  try {
    if (req.user) return res.redirect('/');
    const p = await pendingFor(req);
    if (!p) return res.redirect('/signup');
    renderVerify(res, p, { info: req.query.sent ? 'We sent a new code.' : null });
  } catch (e) { next(e); }
});

router.post('/verify', limiter, async (req, res, next) => {
  try {
    const p = await pendingFor(req);
    if (!p) return res.redirect('/signup');
    const code = String(req.body.code || '').replace(/\D/g, '');
    const bad = (msg) => res.status(400).render('verify', { title: 'Verify your email', masked: V.maskEmail(p.email), minutes: V.CODE_MINUTES, error: msg, info: null });

    if (!p.live) return bad('This code has expired. Send a new one.');
    if (p.attempts >= V.MAX_ATTEMPTS) return bad('Too many wrong tries. Send a new code.');
    if (code.length !== 6) return bad('Enter the 6-digit code.');
    if (!V.codeMatches(p.email, code, p.code_hash)) {
      await query('UPDATE pending_signups SET attempts = attempts + 1 WHERE id = ?', [p.id]);
      return bad('That code is not correct.');
    }

    // Consume the pending row first so a double submit cannot create two accounts.
    const del = await query('DELETE FROM pending_signups WHERE id = ?', [p.id]);
    if (!del.affectedRows) return res.redirect('/login');
    if ((await query('SELECT id FROM users WHERE email = ?', [p.email])).length) return res.redirect('/login');

    const role = isAdminEmail(p.email) ? 'admin' : 'user';
    const r = await query('INSERT INTO users (name, email, password_hash, role, credits) VALUES (?,?,?,?,?)', [p.name, p.email, p.password_hash, role, config.signupCredits]);
    await query('INSERT INTO credit_ledger (user_id, delta, reason) VALUES (?,?,?)', [r.insertId, config.signupCredits, 'signup']);
    res.clearCookie(PV_COOKIE);
    signIn(res, r.insertId);
    res.redirect('/');
  } catch (e) { next(e); }
});

router.post('/verify/resend', resendLimiter, async (req, res, next) => {
  try {
    const p = await pendingFor(req);
    if (!p) return res.redirect('/signup');
    const state = (await query('SELECT sends, created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) AS recent, last_sent_at > DATE_SUB(NOW(), INTERVAL ? SECOND) AS cooling FROM pending_signups WHERE id = ?', [V.RESEND_SECONDS, p.id]))[0];
    const show = (error) => res.status(429).render('verify', { title: 'Verify your email', masked: V.maskEmail(p.email), minutes: V.CODE_MINUTES, error, info: null });
    if (state.cooling) return show('Please wait a minute before asking for another code.');
    if (state.recent && state.sends >= V.MAX_SENDS_PER_HOUR) return show('Too many codes were sent. Try again in an hour.');

    const code = V.newCode();
    await query(`UPDATE pending_signups SET code_hash = ?, expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), attempts = 0, last_sent_at = NOW(),
      sends = IF(created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR), sends + 1, 1) WHERE id = ?`, [V.hashCode(p.email, code), V.CODE_MINUTES, p.id]);
    try {
      await sendVerificationCode({ to: p.email, name: p.name, code, minutes: V.CODE_MINUTES });
    } catch (e) {
      console.error('[mail] resend failed:', e.message);
      return show('We could not send the email. Try again shortly.');
    }
    res.redirect('/verify?sent=1');
  } catch (e) { next(e); }
});

router.post('/login', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const nextUrl = safeNext(req.body.next);
    const fail = (error) => res.status(400).render('login', { title: 'Log in', error, email, next: nextUrl });

    const u = (await query('SELECT * FROM users WHERE email = ?', [email]))[0];
    if (!u) return fail('Email or password is incorrect.');
    if (!u.password_hash) return fail('This account uses Google. Choose "Continue with Google".');
    if (!(await bcrypt.compare(password, u.password_hash))) return fail('Email or password is incorrect.');
    if (u.status !== 'active') return fail('This account is suspended. Contact support.');

    await touchLogin(u);
    signIn(res, u.id);
    res.redirect(nextUrl);
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  signOut(res);
  res.redirect('/');
});

async function touchLogin(u) {
  const promote = u.role !== 'admin' && isAdminEmail(u.email);
  await query('UPDATE users SET last_login_at = NOW(), role = ? WHERE id = ?', [promote ? 'admin' : u.role, u.id]);
}

// ---- Google OAuth (authorization code flow, no extra dependencies) ----
const redirectUri = () => `${config.baseUrl}/auth/google/callback`;

router.get('/auth/google', (req, res) => {
  if (!googleEnabled()) return res.redirect('/login?error=' + encodeURIComponent('Google sign-in is not set up yet.'));
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('g_state', state, { httpOnly: true, sameSite: 'lax', secure: config.baseUrl.startsWith('https://'), maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params);
});

router.get('/auth/google/callback', async (req, res, next) => {
  const back = (msg) => res.redirect('/login?error=' + encodeURIComponent(msg));
  try {
    if (!googleEnabled()) return back('Google sign-in is not set up yet.');
    const { code, state, error } = req.query;
    if (error) return back('Google sign-in was cancelled.');
    if (!code || !state || state !== req.cookies.g_state) return back('Google sign-in expired. Try again.');
    res.clearCookie('g_state');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) return back('Google sign-in failed. Try again.');
    const { access_token } = await tokenRes.json();

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!infoRes.ok) return back('Google sign-in failed. Try again.');
    const g = await infoRes.json();
    if (!g.sub || !g.email || g.email_verified === false) return back('Your Google email is not verified.');
    const email = g.email.toLowerCase();

    let u = (await query('SELECT * FROM users WHERE google_id = ? OR email = ? LIMIT 1', [g.sub, email]))[0];
    if (!u) {
      const role = isAdminEmail(email) ? 'admin' : 'user';
      const r = await query('INSERT INTO users (name, email, google_id, avatar, role, credits) VALUES (?,?,?,?,?,?)', [
        (g.name || email.split('@')[0]).slice(0, 120), email, g.sub, g.picture || null, role, config.signupCredits,
      ]);
      await query('INSERT INTO credit_ledger (user_id, delta, reason) VALUES (?,?,?)', [r.insertId, config.signupCredits, 'signup']);
      u = (await query('SELECT * FROM users WHERE id = ?', [r.insertId]))[0];
    } else {
      if (u.status !== 'active') return back('This account is suspended. Contact support.');
      if (!u.google_id) await query('UPDATE users SET google_id = ?, avatar = COALESCE(avatar, ?) WHERE id = ?', [g.sub, g.picture || null, u.id]);
    }
    await touchLogin(u);
    signIn(res, u.id);
    res.redirect('/');
  } catch (e) { next(e); }
});

module.exports = router;
