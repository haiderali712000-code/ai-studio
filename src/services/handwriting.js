const config = require('../config');
const { UserError } = require('./errors');

const MAX_PAGES = 6;
let optCache = { at: 0, data: null };

// Used when the provider's list endpoint cannot be read. Only keys the provider documents.
const FALLBACK = {
  fonts: [{ key: 'neat', label: 'Neat', rtl: false }],
  colors: [{ name: 'blue', hex: '#1a3fa8' }, { name: 'black', hex: '#111111' }, { name: 'red', hex: '#c0262d' }, { name: 'green', hex: '#1f7a3d' }],
  defaults: { font: 'neat', color: 'blue' },
};

const base = () => config.hand.apiUrl.replace(/\/$/, '');
const KEY_RE = /^[\w-]{1,40}$/;

// The list response shape is not documented in detail, so accept arrays or key->value maps.
function normaliseFonts(raw) {
  const out = [];
  const add = (key, v) => {
    if (!KEY_RE.test(String(key))) return;
    const o = v && typeof v === 'object' ? v : {};
    out.push({ key: String(key), label: String(o.label || o.name || (typeof v === 'string' ? v : key)).slice(0, 60), rtl: Boolean(o.rtl) });
  };
  if (Array.isArray(raw)) raw.forEach((f) => (typeof f === 'string' ? add(f, f) : f && add(f.key || f.id || f.name, f)));
  else if (raw && typeof raw === 'object') Object.keys(raw).forEach((k) => add(k, raw[k]));
  return out;
}
function normaliseColors(raw) {
  const out = [];
  const add = (name, hex) => {
    if (!/^[A-Za-z][\w -]{0,24}$/.test(String(name)) || !/^#[0-9a-f]{6}$/i.test(String(hex))) return;
    out.push({ name: String(name), hex: String(hex) });
  };
  if (Array.isArray(raw)) raw.forEach((c) => c && add(c.name || c.key, c.hex || c.value));
  else if (raw && typeof raw === 'object') Object.keys(raw).forEach((k) => add(k, typeof raw[k] === 'object' ? raw[k].hex : raw[k]));
  return out;
}

async function getOptions() {
  if (optCache.data && Date.now() - optCache.at < 6 * 3600 * 1000) return optCache.data;
  let data = FALLBACK;
  try {
    const res = await fetch(base() + '/api/hand?list=all', { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
    if (!res.ok || !/json/i.test(res.headers.get('content-type') || '')) throw new Error('status ' + res.status);
    const j = await res.json();
    const fonts = normaliseFonts(j.fonts);
    const colors = normaliseColors(j.colors);
    if (fonts.length) {
      data = {
        fonts,
        colors: colors.length ? colors : FALLBACK.colors,
        defaults: { font: (j.defaults && j.defaults.font) || (j.default && j.default.font) || j.defaultFont || fonts[0].key, color: (j.defaults && j.defaults.color) || (j.default && j.default.color) || j.defaultColor || 'blue' },
      };
    }
  } catch (e) {
    console.error('[hand] options failed, using fallback:', e.message);
  }
  optCache = { at: Date.now(), data };
  return data;
}

async function renderPage(payload, page) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(base() + '/api/hand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, page }),
        signal: AbortSignal.timeout(60000),
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !/^image\//i.test(type)) throw new Error('status ' + res.status + ' ' + type);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) throw new Error('empty image');
      return { buf, type: type.split(';')[0], pages: parseInt(res.headers.get('x-pages'), 10) || 1 };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

async function validate(body) {
  const text = String(body.text == null ? '' : body.text).replace(/\r\n/g, '\n').trim();
  if (!text) throw new UserError('Type some text first.');
  if (text.length > config.hand.maxChars) throw new UserError('Text is too long. The limit is ' + config.hand.maxChars + ' characters.');

  const opts = await getOptions();
  const lang = body.lang === 'urdu' ? 'urdu' : '';
  const font = KEY_RE.test(String(body.font || '')) && opts.fonts.some((f) => f.key === body.font) ? String(body.font) : '';
  const c = String(body.color || '');
  const color = /^#[0-9a-f]{6}$/i.test(c) || opts.colors.some((x) => x.name === c) ? c : 'blue';
  const size = Math.max(16, Math.min(80, parseInt(body.size, 10) || 34));
  return {
    text, color, size,
    ...(font ? { font } : {}),
    ...(lang ? { lang } : {}),
    paper: body.paper === 'plain' ? 'plain' : 'ruled',
    style: body.style === 'rough' ? 'rough' : 'neat',
    format: body.format === 'jpeg' ? 'jpeg' : 'png',
    brand: config.hand.brand ? 1 : 0,
  };
}

// Renders every page (up to MAX_PAGES) and returns them as data URLs.
async function render(body) {
  const payload = await validate(body);
  try {
    const first = await renderPage(payload, 1);
    const total = Math.min(first.pages, MAX_PAGES);
    const rest = [];
    for (let p = 2; p <= total; p++) rest.push(p);
    const others = await Promise.all(rest.map((p) => renderPage(payload, p)));
    const toUrl = (r) => `data:${r.type};base64,${r.buf.toString('base64')}`;
    return { pages: [first, ...others].map(toUrl), totalPages: first.pages, truncated: first.pages > MAX_PAGES, format: payload.format };
  } catch (e) {
    console.error('[hand] render failed:', e.message);
    throw new UserError('The handwriting service failed. Your credit was refunded. Try again shortly.', 502);
  }
}

module.exports = { getOptions, render, MAX_PAGES };
