const express = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { grant } = require('../services/credits');

const router = express.Router();
router.use(requireAuth, requireAdmin);
router.use((req, res, next) => { res.locals.active = 'admin'; next(); });

router.get('/', async (req, res, next) => {
  try {
    const [s] = await query(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL 7 DAY) AS newUsers,
      (SELECT COUNT(*) FROM jobs) AS jobs,
      (SELECT COUNT(*) FROM jobs WHERE created_at > NOW() - INTERVAL 1 DAY) AS jobsToday,
      (SELECT COUNT(*) FROM jobs WHERE status = 'failed') AS failed,
      (SELECT COALESCE(SUM(credits),0) FROM users) AS credits`);
    const recentUsers = await query('SELECT id, name, email, created_at FROM users ORDER BY id DESC LIMIT 6');
    const recentJobs = await query('SELECT j.id, j.title, j.status, j.created_at, u.email FROM jobs j JOIN users u ON u.id = j.user_id ORDER BY j.id DESC LIMIT 6');
    res.render('admin/dashboard', { title: 'Admin', stats: s, recentUsers, recentJobs });
  } catch (e) { next(e); }
});

router.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const per = 25;
    const where = q ? 'WHERE name LIKE ? OR email LIKE ?' : '';
    const args = q ? [`%${q}%`, `%${q}%`] : [];
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM users ${where}`, args);
    const users = await query(
      `SELECT id, name, email, role, status, credits, google_id IS NOT NULL AS google, created_at, last_login_at FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, per, (page - 1) * per]
    );
    res.render('admin/users', { title: 'Users', users, q, page, pages: Math.max(1, Math.ceil(total / per)), total, notice: req.query.notice || null });
  } catch (e) { next(e); }
});

router.post('/users/:id/credits', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const amount = parseInt(req.body.amount, 10);
    if (!Number.isInteger(amount) || Math.abs(amount) > 100000) return res.redirect('/admin/users?notice=' + encodeURIComponent('Enter a whole number of credits.'));
    await grant(id, amount, 'admin', 'by:' + req.user.id);
    res.redirect('/admin/users?notice=' + encodeURIComponent('Credits updated.'));
  } catch (e) { next(e); }
});

router.post('/users/:id/status', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) return res.redirect('/admin/users?notice=' + encodeURIComponent('You cannot suspend your own account.'));
    const status = req.body.status === 'banned' ? 'banned' : 'active';
    await query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    res.redirect('/admin/users?notice=' + encodeURIComponent(status === 'banned' ? 'User suspended.' : 'User reactivated.'));
  } catch (e) { next(e); }
});

router.post('/users/:id/role', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) return res.redirect('/admin/users?notice=' + encodeURIComponent('You cannot change your own role.'));
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    await query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    res.redirect('/admin/users?notice=' + encodeURIComponent('Role updated.'));
  } catch (e) { next(e); }
});

router.get('/jobs', async (req, res, next) => {
  try {
    const status = ['queued', 'processing', 'done', 'failed'].includes(req.query.status) ? req.query.status : '';
    const jobs = await query(
      `SELECT j.id, j.title, j.input_url, j.status, j.error, j.credits_used, j.created_at, u.email
       FROM jobs j JOIN users u ON u.id = j.user_id ${status ? 'WHERE j.status = ?' : ''} ORDER BY j.id DESC LIMIT 100`,
      status ? [status] : []
    );
    res.render('admin/jobs', { title: 'Jobs', jobs, status });
  } catch (e) { next(e); }
});

module.exports = router;
