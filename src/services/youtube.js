const { UserError } = require('./errors');

const ID_RE = /^[\w-]{11}$/;

function parseVideoId(input) {
  const raw = String(input || '').trim();
  if (ID_RE.test(raw)) return raw;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) id = m[2];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

async function fetchMeta(videoId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 401 || res.status === 404) throw new UserError('This video is private, removed or not embeddable.');
    if (!res.ok) throw new Error('oEmbed ' + res.status);
    const j = await res.json();
    return { id: videoId, title: j.title, author: j.author_name, thumbnail: j.thumbnail_url };
  } catch (e) {
    if (e instanceof UserError) throw e;
    // Metadata is nice to have; do not fail the job over it.
    return { id: videoId, title: 'YouTube video', author: '', thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}

// Returns [{ start, end, text }] in seconds.
async function fetchTranscript(videoId) {
  const { YoutubeTranscript } = require('youtube-transcript');
  let items;
  try {
    items = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (e) {
    throw new UserError('Captions could not be fetched for this video. It may have none, or YouTube blocked the request. Paste the transcript manually and try again.');
  }
  if (!items || !items.length) throw new UserError('This video has no captions. Paste a transcript manually and try again.');

  // Some versions of the library return milliseconds, others seconds. Caption lines last a few seconds,
  // so a large median duration means the values are milliseconds.
  const durs = items.map((i) => Number(i.duration) || 0).sort((a, b) => a - b);
  const median = durs[Math.floor(durs.length / 2)] || 0;
  const k = median > 100 ? 1000 : 1;

  return items
    .map((i) => ({
      start: (Number(i.offset) || 0) / k,
      end: ((Number(i.offset) || 0) + (Number(i.duration) || 0)) / k,
      text: decodeEntities(i.text),
    }))
    .filter((l) => l.text);
}

// Accepts lines like "12:03 text", "[1:02:10] text" or "0:45 - text".
function parsePastedTranscript(text) {
  const re = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–:]?\s*(.+)$/;
  const lines = [];
  for (const row of String(text || '').split(/\r?\n/)) {
    const m = row.trim().match(re);
    if (!m) continue;
    const parts = m[1].split(':').map(Number);
    const start = parts.reduce((a, p) => a * 60 + p, 0);
    lines.push({ start, end: start + 5, text: m[2].trim() });
  }
  if (lines.length < 3) {
    throw new UserError('Could not read that transcript. Put one timestamp per line, like "02:15 text here".');
  }
  for (let i = 0; i < lines.length - 1; i++) lines[i].end = Math.max(lines[i].start + 1, lines[i + 1].start);
  return lines;
}

module.exports = { parseVideoId, fetchMeta, fetchTranscript, parsePastedTranscript };
