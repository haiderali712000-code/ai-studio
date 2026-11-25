const { query } = require('../db');
const { grant } = require('./credits');
const { UserError } = require('./errors');
const { fetchMeta, fetchTranscript, parsePastedTranscript } = require('./youtube');
const { complete, parseJSON } = require('./ai');

const LENGTHS = { short: [15, 30], medium: [30, 60], long: [60, 120] };
const MAX_CHUNKS = 6;
const CHUNK_CHARS = 24000;

// Group caption lines into ~10 second blocks formatted as "[seconds] text" to save tokens.
function buildChunks(lines) {
  const blocks = [];
  let cur = null;
  for (const l of lines) {
    if (!cur || l.start - cur.start >= 10) {
      cur = { start: Math.floor(l.start), text: l.text };
      blocks.push(cur);
    } else cur.text += ' ' + l.text;
  }
  const chunks = [];
  let buf = '';
  let first = 0;
  for (const b of blocks) {
    const row = `[${b.start}] ${b.text}\n`;
    if (buf && buf.length + row.length > CHUNK_CHARS) {
      chunks.push({ text: buf, from: first, to: b.start });
      buf = '';
    }
    if (!buf) first = b.start;
    buf += row;
  }
  if (buf) chunks.push({ text: buf, from: first, to: Infinity });
  return chunks;
}

const SYSTEM = `You are a senior short-form video editor. You read timestamped transcripts and pick the moments most likely to perform as standalone clips on TikTok, Reels and Shorts.
Good clips open with a hook, are self-contained, make one clear point or tell one mini-story, and end on a natural pause. Avoid intros, sponsor reads and rambling.
Reply with JSON only, no commentary.`;

async function askChunk(chunk, meta, count, [minLen, maxLen]) {
  const user = `Video title: ${meta.title}
Transcript lines look like "[seconds] text". Pick the ${count} best clips from the transcript below.

Rules:
- "start" and "end" are whole seconds taken from the transcript timestamps.
- Each clip is between ${minLen} and ${maxLen} seconds long.
- Clips must not overlap. Start at the beginning of a sentence.
- "title": under 60 characters, written for a viewer. "hook": the opening line a viewer should see or hear first. "reason": one sentence on why it works. "score": 0-100 for viral potential.

Return exactly: {"clips":[{"start":0,"end":0,"title":"","hook":"","reason":"","score":0}]}

Transcript:
${chunk.text}`;
  const out = parseJSON(await complete({ system: SYSTEM, user }));
  return Array.isArray(out.clips) ? out.clips : [];
}

function normalise(raw, [minLen, maxLen], videoEnd) {
  const clips = [];
  for (const c of raw) {
    let start = Math.max(0, Math.floor(Number(c.start)));
    let end = Math.floor(Number(c.end));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (end - start < minLen) end = start + minLen;
    if (end - start > maxLen) end = start + maxLen;
    if (end > videoEnd) {
      end = Math.floor(videoEnd);
      start = Math.max(0, Math.min(start, end - minLen));
    }
    if (end <= start) continue;
    clips.push({
      start,
      end,
      title: String(c.title || 'Untitled clip').slice(0, 80),
      hook: String(c.hook || '').slice(0, 240),
      reason: String(c.reason || '').slice(0, 300),
      score: Math.max(0, Math.min(100, Math.round(Number(c.score) || 0))),
    });
  }
  return clips;
}

function pickBest(clips, count) {
  const picked = [];
  for (const c of [...clips].sort((a, b) => b.score - a.score)) {
    if (picked.some((p) => c.start < p.end && c.end > p.start)) continue; // overlap
    picked.push(c);
    if (picked.length === count) break;
  }
  return picked;
}

async function findClips(meta, lines, { count, length }, onStage) {
  const range = LENGTHS[length] || LENGTHS.medium;
  const duration = Math.ceil(lines[lines.length - 1].end);
  let chunks = buildChunks(lines);
  if (chunks.length > MAX_CHUNKS) {
    throw new UserError('This video is too long to analyse in one go. Try a video under about two and a half hours.');
  }
  const all = [];
  for (let i = 0; i < chunks.length; i++) {
    onStage(chunks.length > 1 ? `Ranking moments (part ${i + 1} of ${chunks.length})` : 'Ranking moments');
    let raw;
    try {
      raw = await askChunk(chunks[i], meta, count, range);
    } catch (e) {
      if (e instanceof UserError) throw e;
      console.error('[clips] chunk failed:', e.message);
      throw new UserError('The AI returned an unreadable answer. Your credits were refunded. Please try again.', 502);
    }
    all.push(...normalise(raw, range, duration));
  }
  const best = pickBest(all, count);
  if (!best.length) throw new UserError('No strong clips were found in this video. Credits were refunded.');
  return { video: { ...meta, duration }, clips: best };
}

// ---- Job runner (in-process queue) ----
const queue = [];
let running = 0;
const CONCURRENCY = 2;

function enqueue(jobId) {
  queue.push(jobId);
  pump();
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const id = queue.shift();
    running++;
    runJob(id).catch((e) => console.error('[job] fatal', id, e)).finally(() => { running--; pump(); });
  }
}

async function setStage(id, stage) {
  await query('UPDATE jobs SET stage = ? WHERE id = ?', [stage, id]);
}

async function runJob(id) {
  const job = (await query('SELECT * FROM jobs WHERE id = ?', [id]))[0];
  if (!job || job.status !== 'queued') return;
  await query("UPDATE jobs SET status='processing', stage='Fetching video info' WHERE id = ?", [id]);
  try {
    const options = JSON.parse(job.options || '{}');
    const meta = await fetchMeta(job.video_id);
    await query('UPDATE jobs SET title = ? WHERE id = ?', [meta.title.slice(0, 300), id]);

    await setStage(id, 'Reading captions');
    const lines = options.transcript ? parsePastedTranscript(options.transcript) : await fetchTranscript(job.video_id);

    const result = await findClips(meta, lines, options, (s) => setStage(id, s));
    await query("UPDATE jobs SET status='done', stage=NULL, result=?, finished_at=NOW() WHERE id = ?", [JSON.stringify(result), id]);
  } catch (e) {
    const msg = e instanceof UserError ? e.message : 'Something went wrong while analysing this video. Credits were refunded.';
    if (!(e instanceof UserError)) console.error('[job] failed', id, e);
    await query("UPDATE jobs SET status='failed', stage=NULL, error=?, finished_at=NOW() WHERE id = ?", [msg.slice(0, 500), id]);
    if (job.credits_used) await grant(job.user_id, job.credits_used, 'refund', 'job:' + id);
  }
}

// Called on boot: anything left half-finished by a restart is failed and refunded.
async function recoverStale() {
  const stale = await query("SELECT id, user_id, credits_used FROM jobs WHERE status IN ('queued','processing')");
  for (const j of stale) {
    await query("UPDATE jobs SET status='failed', stage=NULL, error='Interrupted by a server restart. Credits were refunded.', finished_at=NOW() WHERE id = ?", [j.id]);
    if (j.credits_used) await grant(j.user_id, j.credits_used, 'refund', 'job:' + j.id);
  }
}

module.exports = { enqueue, recoverStale };
