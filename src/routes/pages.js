const express = require('express');
const config = require('../config');
const features = require('../features');
const plans = require('../plans');
const { query } = require('../db');
const video = require('../services/video');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => res.render('index', { title: null, features, plans }));

router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const recent = await query('SELECT id, title, status, created_at FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 5', [req.user.id]);
    res.render('dashboard', { title: 'Dashboard', active: 'dashboard', features, recent });
  } catch (e) { next(e); }
});

router.get('/tools/clips', requireAuth, (req, res) => {
  res.render('clips', { title: 'Clip finder', active: 'clips' });
});

router.get('/tools/download', requireAuth, (req, res) => {
  if (!config.downloader.enabled) return res.status(404).render('404');
  res.render('download', { title: 'Downloader', active: 'download', prefill: String(req.query.url || '').slice(0, 500), cost: config.costs.download });
});

router.get('/tools/voice', requireAuth, (req, res) => {
  if (!config.tts.enabled) return res.status(404).render('404');
  res.render('voice', { title: 'Voiceover', active: 'voice', cost: config.costs.voice, maxChars: config.tts.maxChars });
});

router.get('/tools/video', requireAuth, (req, res) => {
  if (!config.video.enabled) return res.status(404).render('404');
  res.render('video', { title: 'AI video maker', active: 'video', cost: config.costs.video, voices: video.VOICES, limits: video.LIMITS });
});

router.get('/tools/handwriting', requireAuth, (req, res) => {
  if (!config.hand.enabled) return res.status(404).render('404');
  res.render('handwriting', { title: 'Text to handwriting', active: 'handwriting', cost: config.costs.hand, maxChars: config.hand.maxChars });
});

router.get('/jobs', requireAuth, async (req, res, next) => {
  try {
    const jobs = await query('SELECT id, title, video_id, status, credits_used, created_at FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]);
    res.render('history', { title: 'History', active: 'history', jobs });
  } catch (e) { next(e); }
});

router.get('/jobs/:id', requireAuth, async (req, res, next) => {
  try {
    const job = (await query('SELECT id, type, title, video_id FROM jobs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]))[0];
    if (!job) return res.status(404).render('404');
    if (job.type === 'video') return res.render('video-job', { title: job.title || 'Video', active: 'history', job });
    res.render('job', { title: job.title || 'Clips', active: 'history', job });
  } catch (e) { next(e); }
});

router.get('/billing', requireAuth, async (req, res, next) => {
  try {
    const ledger = await query('SELECT delta, reason, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 15', [req.user.id]);
    res.render('billing', { title: 'Billing', active: 'billing', plans, ledger });
  } catch (e) { next(e); }
});

module.exports = router;
