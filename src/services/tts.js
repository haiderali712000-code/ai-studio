const config = require('../config');
const { UserError } = require('./errors');

const CHUNK = 600;          // chars per provider call (API max is 1950; 600 is reliable)
const CONCURRENCY = 6;      // parallel provider calls per request
let voiceCache = { at: 0, data: null };

function base() { return config.tts.apiUrl.replace(/\/$/, ''); }

// Split at sentence boundaries into chunks <= max chars.
function splitText(text, max = CHUNK) {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?؟۔。\n]+[.!?؟۔。]*\s*/g) || [text];
  const out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (let s of sentences) {
    while (s.length > max) { // very long sentence: break at a space
      let cut = s.lastIndexOf(' ', max);
      if (cut < max * 0.5) cut = max;
      if (cur) push();
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut);
    }
    if ((cur + s).length > max) push();
    cur += s;
  }
  push();
  return out.filter(Boolean);
}

async function getVoices() {
  if (voiceCache.data && Date.now() - voiceCache.at < 6 * 3600 * 1000) return voiceCache.data;
  try {
    const res = await fetch(base() + '/api/voices', { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('status ' + res.status);
    const j = await res.json();
    if (!j || !Array.isArray(j.voices)) throw new Error('bad payload');
    const voices = j.voices.map((v) => ({
      index: Number(v.index),
      name: String(v.name || '').slice(0, 80),
      gender: String(v.gender || '').slice(0, 20),
      language: String(v.language || 'Other').slice(0, 40),
      country: String(v.country || '').slice(0, 40),
    })).filter((v) => Number.isInteger(v.index) && v.index > 0 && v.name);
    voiceCache = { at: Date.now(), data: voices };
    return voices;
  } catch (e) {
    console.error('[tts] voices failed:', e.message);
    if (voiceCache.data) return voiceCache.data;
    throw new UserError('The voice service is not responding. Try again shortly.', 502);
  }
}

async function synthChunk(text, voiceIndex, pitch, rate) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(base() + '/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceIndex, text, pitch, rate }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error('status ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) throw new Error('empty audio');
      return buf;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Returns one merged MP3 Buffer. MP3 is a stream, so concatenating chunks works.
async function synthesize({ text, voiceIndex, pitch = 0, rate = 0 }) {
  const chunks = splitText(text);
  if (!chunks.length) throw new UserError('Type some text first.');
  const parts = new Array(chunks.length);
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = next++;
      parts[i] = await synthChunk(chunks[i], voiceIndex, pitch, rate);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
  } catch (e) {
    console.error('[tts] synth failed:', e.message);
    throw new UserError('The voice service failed. Your credits were refunded. Try again shortly.', 502);
  }
  return Buffer.concat(parts);
}

module.exports = { getVoices, synthesize, splitText };
