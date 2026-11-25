const config = require('../config');
const { UserError } = require('./errors');

function httpUrl(u) {
  if (typeof u !== 'string') return null;
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
}

// The provider's quality entries may be plain URLs or objects; accept both and keep only safe http(s) links.
function normaliseQuality(q) {
  if (typeof q === 'string') {
    const url = httpUrl(q);
    return url ? { label: 'Download', url, size: '' } : null;
  }
  if (q && typeof q === 'object') {
    const url = httpUrl(q.url || q.videoUrl || q.link || q.downloadUrl || q.src);
    if (!url) return null;
    return {
      label: String(q.quality || q.label || q.resolution || q.name || q.format || 'Download').slice(0, 40),
      size: q.size ? String(q.size).slice(0, 20) : '',
      url,
    };
  }
  return null;
}

async function resolve(videoUrl) {
  const api = `${config.downloader.apiUrl}?url=${encodeURIComponent(videoUrl)}`;
  let data;
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('status ' + res.status);
    data = await res.json();
  } catch (e) {
    console.error('[download] provider failed:', e.message);
    throw new UserError('The download service is not responding. Your credit was refunded. Try again shortly.', 502);
  }

  if (!data || data.success !== true || !data.mediaInfo) {
    throw new UserError('This link could not be prepared. It may be private, too long or from an unsupported site. Your credit was refunded.');
  }

  const m = data.mediaInfo;
  const out = {
    platform: String(m.platform || '').slice(0, 40),
    title: typeof m.title === 'string' ? m.title.slice(0, 200) : '',
    videoUrl: httpUrl(m.videoUrl),
    audioUrl: httpUrl(m.audioUrl),
    qualities: (Array.isArray(m.qualities) ? m.qualities : []).map(normaliseQuality).filter(Boolean).slice(0, 20),
  };
  if (!out.videoUrl && !out.audioUrl && !out.qualities.length) {
    throw new UserError('No download links came back for this link. Your credit was refunded.');
  }
  return out;
}

module.exports = { resolve };
