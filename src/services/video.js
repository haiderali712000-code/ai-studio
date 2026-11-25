const config = require('../config');
const { query } = require('../db');
const { grant } = require('./credits');
const { UserError } = require('./errors');
const { complete, parseJSON } = require('./ai');

const API = 'https://api.json2video.com/v2/movies';
const POLL_MS = 6000;
const MAX_WAIT_MS = 20 * 60 * 1000;
const LIMITS = { maxScenes: 8, voiceover: 400, prompt: 600, title: 120 };

// Azure neural voices that work with the template. Multilingual voices read most languages.
const VOICES = [
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian (male, multilingual)' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew (male, multilingual)' },
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava (female, multilingual)' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma (female, multilingual)' },
  { id: 'en-US-AriaNeural', label: 'Aria (female, English US)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (male, English UK)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (female, English UK)' },
  { id: 'ur-PK-AsadNeural', label: 'Asad (male, Urdu)' },
  { id: 'ur-PK-UzmaNeural', label: 'Uzma (female, Urdu)' },
  { id: 'hi-IN-MadhurNeural', label: 'Madhur (male, Hindi)' },
  { id: 'ar-SA-HamedNeural', label: 'Hamed (male, Arabic)' },
  { id: 'es-ES-ElviraNeural', label: 'Elvira (female, Spanish)' },
];
const SUB_COLORS = { gold: '#FFD700', mint: '#6FEEBE', white: '#FFFFFF', pink: '#FF6BB5' };

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

// ---------- AI script ----------
const SYSTEM = `You write scripts for short vertical-style explainer videos. Each scene has a spoken line and a prompt for an AI image generator.
Reply with JSON only, no commentary.`;

async function writeScript(topic, count) {
  const user = `Topic: ${topic}

Write a ${count}-scene video script.
Rules:
- "title": under 70 characters.
- Each scene "voiceoverText": 1 or 2 short sentences, 12 to 28 words, conversational. Scene 1 is a strong hook. The last scene ends with a short call to action.
- Write the voiceover in the same language as the topic.
- Each scene "imagePrompt": English, one detailed photorealistic image description (subject, setting, lighting, camera style). 25 to 60 words. No text, logos or watermarks in the image.

Return exactly: {"title":"","scenes":[{"voiceoverText":"","imagePrompt":""}]}`;
  let out;
  try {
    out = parseJSON(await complete({ system: SYSTEM, user, maxTokens: 3500 }));
  } catch (e) {
    if (e instanceof UserError) {
      if (e.status === 502) throw new UserError('The AI service did not respond. Try again in a minute.', 502);
      throw e;
    }
    console.error('[video] script parse failed:', e.message);
    throw new UserError('The script came back in a bad format. Try again.', 502);
  }
  const scenes = (Array.isArray(out.scenes) ? out.scenes : [])
    .map((s) => ({ voiceoverText: clean(s.voiceoverText, LIMITS.voiceover), imagePrompt: clean(s.imagePrompt, LIMITS.prompt) }))
    .filter((s) => s.voiceoverText && s.imagePrompt)
    .slice(0, LIMITS.maxScenes);
  if (!scenes.length) throw new UserError('No script came back. Try a clearer topic.', 502);
  return { title: clean(out.title, LIMITS.title) || clean(topic, LIMITS.title), scenes };
}

// ---------- Validation of what the user submits ----------
function validateRequest(body) {
  const scenes = (Array.isArray(body.scenes) ? body.scenes : []).slice(0, LIMITS.maxScenes + 1).map((s) => ({
    voiceoverText: clean(s && s.voiceoverText, LIMITS.voiceover),
    imagePrompt: clean(s && s.imagePrompt, LIMITS.prompt),
  }));
  if (!scenes.length) throw new UserError('Add at least one scene.');
  if (scenes.length > LIMITS.maxScenes) throw new UserError('You can have at most ' + LIMITS.maxScenes + ' scenes.');
  scenes.forEach((s, i) => {
    if (!s.voiceoverText) throw new UserError('Scene ' + (i + 1) + ' needs the spoken text.');
    if (!s.imagePrompt) throw new UserError('Scene ' + (i + 1) + ' needs an image description.');
  });
  const voice = VOICES.find((v) => v.id === body.voice) ? body.voice : VOICES[0].id;
  const subtitles = body.subtitles !== false && body.subtitles !== 'false';
  const subColor = SUB_COLORS[body.subColor] ? body.subColor : 'gold';
  return { title: clean(body.title, LIMITS.title) || 'Untitled video', scenes, voice, subtitles, subColor };
}

// ---------- JSON2Video ----------
function headers() {
  return { 'Content-Type': 'application/json', 'x-api-key': config.video.apiKey };
}

function movieBody(o) {
  return {
    template: config.video.templateId,
    variables: {
      scenes: o.scenes,
      voice1: { enabled: true, model: 'azure', id: o.voice },
      subtitles: {
        enabled: o.subtitles, language: 'auto', model: 'default', style: 'classic',
        fontFamily: 'Oswald', fontWeight: '700', fontSize: 140, fontURL: '',
        boxColor: '#000000', wordColor: SUB_COLORS[o.subColor], lineColor: '#FFFFFF',
        outlineColor: '#000000', outlineWidth: 3, shadowColor: '#000000', shadowOffset: 0,
        position: 'mid-bottom-center', maxWordsPerLine: 4, allCaps: false,
      },
      music: { enabled: false, url: '', volume: 0 },
      logo: { enabled: false, type: 'image', url: '', position: 'top-right' },
      imageSettings: { model: 'flux-schnell' },
    },
  };
}

async function submit(o) {
  const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify(movieBody(o)), signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.success || !j.project) {
    console.error('[video] submit failed:', res.status, JSON.stringify(j).slice(0, 400));
    if (res.status === 401 || res.status === 403) throw new Error('The video service rejected the API key.');
    throw new Error('The video service could not start this video.');
  }
  return j.project;
}

async function status(project) {
  const res = await fetch(`${API}?project=${encodeURIComponent(project)}`, { headers: { 'x-api-key': config.video.apiKey }, signal: AbortSignal.timeout(20000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.movie) throw new Error('status ' + res.status);
  return j.movie;
}

const isJ2VUrl = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && (x.hostname === 'json2video.com' || x.hostname.endsWith('.json2video.com')); } catch { return false; }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fail(jobId, userId, credits, msg) {
  await query("UPDATE jobs SET status='failed', stage=NULL, error=?, finished_at=NOW() WHERE id = ?", [msg.slice(0, 480), jobId]);
  if (credits) await grant(userId, credits, 'refund', 'job:' + jobId);
}

// Runs in-process (same pattern as the clip finder): submit, then poll until the render ends.
async function runJob(jobId) {
  const job = (await query('SELECT id, user_id, options, credits_used FROM jobs WHERE id = ?', [jobId]))[0];
  if (!job) return;
  try {
    const o = JSON.parse(job.options);
    await query("UPDATE jobs SET status='processing', stage='Sending to the video studio' WHERE id = ?", [jobId]);
    const project = await submit(o);
    await query("UPDATE jobs SET stage='Creating images, voice and captions' WHERE id = ?", [jobId]);

    const started = Date.now();
    let failures = 0;
    while (Date.now() - started < MAX_WAIT_MS) {
      await sleep(POLL_MS);
      let m;
      try { m = await status(project); failures = 0; } catch (e) {
        if (++failures >= 8) throw new Error('Lost contact with the video service.');
        continue;
      }
      if (m.status === 'done') {
        if (!isJ2VUrl(m.url)) throw new Error('The finished video had no usable link.');
        const result = { url: m.url, project, duration: m.duration || null, width: m.width || null, height: m.height || null };
        await query("UPDATE jobs SET status='done', stage=NULL, result=?, finished_at=NOW() WHERE id = ?", [JSON.stringify(result), jobId]);
        return;
      }
      if (m.status === 'error' || m.status === 'timeout' || m.success === false) {
        console.error('[video] render failed:', m.status, String(m.message || '').slice(0, 300));
        throw new Error('The video could not be rendered. Try simpler image descriptions.');
      }
    }
    throw new Error('The video took too long to render.');
  } catch (e) {
    console.error('[video] job', jobId, 'failed:', e.message);
    await fail(jobId, job.user_id, job.credits_used, e.message + ' Your credits were refunded.');
  }
}

module.exports = { writeScript, validateRequest, runJob, isJ2VUrl, VOICES, SUB_COLORS, LIMITS };
