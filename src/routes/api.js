const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { spend, grant } = require('../services/credits');
const { UserError } = require('../services/errors');
const { resolve: resolveDownload } = require('../services/downloader');
const { parseVideoId } = require('../services/youtube');
const { enqueue } = require('../services/clips');
const tts = require('../services/tts');
const video = require('../services/video');
const hand = require('../services/handwriting');

const router = express.Router();
router.use(requireAuth);

const createLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'u' + req.user.id,
  message: { error: 'You are creating jobs too quickly. Wait a few minutes.' },
});

router.post('/clips', createLimit, async (req, res, next) => {
  try {
    const url = String(req.body.url || '').trim();
    const videoId = parseVideoId(url);
    if (!videoId) return res.status(400).json({ error: 'Enter a valid YouTube link.' });

    const count = [3, 5, 8].includes(Number(req.body.count)) ? Number(req.body.count) : 5;
    const length = ['short', 'medium', 'long'].includes(req.body.length) ? req.body.length : 'medium';
    const transcript = String(req.body.transcript || '').slice(0, 400000).trim();
    const cost = config.costs.clips;

    const r = await query('INSERT INTO jobs (user_id, type, input_url, video_id, options, credits_used) VALUES (?,?,?,?,?,?)', [
      req.user.id, 'clips', url.slice(0, 500), videoId, JSON.stringify({ count, length, transcript: transcript || undefined }), cost,
    ]);
    const ok = await spend(req.user.id, cost, 'clips', 'job:' + r.insertId);
    if (!ok) {
      await query('DELETE FROM jobs WHERE id = ?', [r.insertId]);
      return res.status(402).json({ error: 'You do not have enough credits. Add credits on the Billing page.' });
    }
    enqueue(r.insertId);
    res.json({ id: r.insertId });
  } catch (e) { next(e); }
});

const downloadLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'd' + req.user.id,
  message: { error: 'Too many download requests. Wait a few minutes.' },
});

router.post('/download', downloadLimit, async (req, res, next) => {
  try {
    if (!config.downloader.enabled) return res.status(503).json({ error: 'Downloads are turned off.' });
    const url = String(req.body.url || '').trim();
    if (!url || url.length > 500 || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Paste a full link that starts with https://' });
    }
    const cost = config.costs.download;
    if (cost > 0 && !(await spend(req.user.id, cost, 'download'))) {
      return res.status(402).json({ error: 'You do not have enough credits. Add credits on the Billing page.' });
    }
    try {
      res.json(await resolveDownload(url));
    } catch (e) {
      if (cost > 0) await grant(req.user.id, cost, 'refund', 'download');
      if (e instanceof UserError) return res.status(e.status || 400).json({ error: e.message });
      throw e;
    }
  } catch (e) { next(e); }
});

router.get('/voices', async (req, res, next) => {
  try {
    if (!config.tts.enabled) return res.status(503).json({ error: 'Voiceover is turned off.' });
    res.set('Cache-Control', 'private, max-age=3600');
    res.json({ voices: await tts.getVoices() });
  } catch (e) {
    if (e instanceof UserError) return res.status(e.status || 400).json({ error: e.message });
    next(e);
  }
});

const ttsLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 't' + req.user.id,
  message: { error: 'Too many voiceover requests. Wait a few minutes.' },
});

router.post('/tts', ttsLimit, async (req, res, next) => {
  try {
    if (!config.tts.enabled) return res.status(503).json({ error: 'Voiceover is turned off.' });
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Type some text first.' });
    if (text.length > config.tts.maxChars) return res.status(400).json({ error: 'Text is too long. The limit is ' + config.tts.maxChars + ' characters.' });
    const voiceIndex = parseInt(req.body.voiceIndex, 10);
    if (!Number.isInteger(voiceIndex) || voiceIndex < 1) return res.status(400).json({ error: 'Pick a voice.' });
    const clamp = (v) => Math.max(-100, Math.min(100, Math.round(Number(v) || 0)));
    const pitch = clamp(req.body.pitch);
    const rate = clamp(req.body.rate);

    const cost = config.costs.voice;
    if (cost > 0 && !(await spend(req.user.id, cost, 'voice'))) {
      return res.status(402).json({ error: 'You do not have enough credits. Add credits on the Billing page.' });
    }
    try {
      const audio = await tts.synthesize({ text, voiceIndex, pitch, rate });
      res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
      res.send(audio);
    } catch (e) {
      if (cost > 0) await grant(req.user.id, cost, 'refund', 'voice');
      if (e instanceof UserError) return res.status(e.status || 400).json({ error: e.message });
      throw e;
    }
  } catch (e) { next(e); }
});

const scriptLimit = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => 's' + req.user.id,
  message: { error: 'Too many script requests. Wait a few minutes.' },
});

router.post('/video/script', scriptLimit, async (req, res, next) => {
  try {
    if (!config.video.enabled) return res.status(503).json({ error: 'The video maker is turned off.' });
    const topic = String(req.body.topic || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (topic.length < 3) return res.status(400).json({ error: 'Describe what the video is about.' });
    const count = [4, 5, 6, 8].includes(Number(req.body.count)) ? Number(req.body.count) : 5;
    res.json(await video.writeScript(topic, count));
  } catch (e) {
    if (e instanceof UserError) return res.status(e.status || 400).json({ error: e.message });
    next(e);
  }
});

const videoLimit = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => 'v' + req.user.id,
  message: { error: 'You are creating videos too quickly. Wait a few minutes.' },
});

router.post('/video', videoLimit, async (req, res, next) => {
  try {
    if (!config.video.enabled) return res.status(503).json({ error: 'The video maker is turned off.' });
    let o;
    try { o = video.validateRequest(req.body); } catch (e) {
      if (e instanceof UserError) return res.status(400).json({ error: e.message });
      throw e;
    }
    const active = (await query("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND type = 'video' AND status IN ('queued','processing')", [req.user.id]))[0].n;
    if (active >= 2) return res.status(429).json({ error: 'You already have 2 videos being made. Wait for one to finish.' });

    const cost = config.costs.video;
    const r = await query('INSERT INTO jobs (user_id, type, input_url, title, options, credits_used) VALUES (?,?,?,?,?,?)', [
      req.user.id, 'video', o.title.slice(0, 500), o.title, JSON.stringify(o), cost,
    ]);
    if (cost > 0 && !(await spend(req.user.id, cost, 'video', 'job:' + r.insertId))) {
      await query('DELETE FROM jobs WHERE id = ?', [r.insertId]);
      return res.status(402).json({ error: 'You do not have enough credits. Add credits on the Billing page.' });
    }
    video.runJob(r.insertId).catch((e) => console.error('[video] runner crashed:', e));
    res.json({ id: r.insertId });
  } catch (e) { next(e); }
});

router.get('/video/:id/download', async (req, res, next) => {
  try {
    const j = (await query("SELECT title, result FROM jobs WHERE id = ? AND user_id = ? AND type = 'video' AND status = 'done'", [req.params.id, req.user.id]))[0];
    const url = j && j.result ? JSON.parse(j.result).url : null;
    if (!url || !video.isJ2VUrl(url)) return res.status(404).json({ error: 'Not found.' });
    const upstream = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!upstream.ok || !upstream.body) return res.status(502).json({ error: 'The video file is not available right now.' });
    const name = (String(j.title || 'video').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'video') + '.mp4';
    res.set({ 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="' + name + '"' });
    const len = upstream.headers.get('content-length');
    if (len) res.set('Content-Length', len);
    require('stream').Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) { next(e); }
});

router.get('/hand/options', async (req, res, next) => {
  try {
    if (!config.hand.enabled) return res.status(503).json({ error: 'Handwriting is turned off.' });
    res.set('Cache-Control', 'private, max-age=3600');
    res.json(await hand.getOptions());
  } catch (e) { next(e); }
});

const handLimit = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => 'h' + req.user.id,
  message: { error: 'Too many handwriting requests. Wait a few minutes.' },
});

router.post('/hand', handLimit, async (req, res, next) => {
  try {
    if (!config.hand.enabled) return res.status(503).json({ error: 'Handwriting is turned off.' });
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Type some text first.' });
    if (text.length > config.hand.maxChars) return res.status(400).json({ error: 'Text is too long. The limit is ' + config.hand.maxChars + ' characters.' });

    const cost = config.costs.hand;
    if (cost > 0 && !(await spend(req.user.id, cost, 'handwriting'))) {
      return res.status(402).json({ error: 'You do not have enough credits. Add credits on the Billing page.' });
    }
    try {
      res.json(await hand.render(req.body));
    } catch (e) {
      if (cost > 0) await grant(req.user.id, cost, 'refund', 'handwriting');
      if (e instanceof UserError) return res.status(e.status || 400).json({ error: e.message });
      throw e;
    }
  } catch (e) { next(e); }
});

router.get('/jobs/:id', async (req, res, next) => {
  try {
    const j = (await query('SELECT id, video_id, title, status, stage, error, result, created_at FROM jobs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]))[0];
    if (!j) return res.status(404).json({ error: 'Not found.' });
    res.json({ ...j, result: j.result ? JSON.parse(j.result) : null });
  } catch (e) { next(e); }
});

router.delete('/jobs/:id', async (req, res, next) => {
  try {
    await query("DELETE FROM jobs WHERE id = ? AND user_id = ? AND status IN ('done','failed')", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
