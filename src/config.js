require('dotenv').config();
const e = process.env;

const config = {
  appName: e.APP_NAME || 'Cliporra',
  isProd: e.NODE_ENV === 'production',
  port: parseInt(e.PORT, 10) || 3000,
  baseUrl: (e.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  jwtSecret: e.JWT_SECRET || '',
  adminEmails: (e.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  signupCredits: parseInt(e.SIGNUP_CREDITS, 10) || 10,
  db: {
    host: e.DB_HOST || 'localhost',
    port: parseInt(e.DB_PORT, 10) || 3306,
    user: e.DB_USER || '',
    password: e.DB_PASSWORD || '',
    database: e.DB_NAME || '',
  },
  google: { clientId: e.GOOGLE_CLIENT_ID || '', clientSecret: e.GOOGLE_CLIENT_SECRET || '' },
  ai: {
    provider: (e.AI_PROVIDER || 'anthropic').toLowerCase(),
    anthropicKey: e.ANTHROPIC_API_KEY || '',
    anthropicModel: e.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    openaiKey: e.OPENAI_API_KEY || '',
    openaiModel: e.OPENAI_MODEL || 'gpt-4o-mini',
  },
  costs: {
    clips: 1,
    video: e.VIDEO_COST !== undefined && e.VIDEO_COST !== '' ? Math.max(0, parseInt(e.VIDEO_COST, 10) || 0) : 5,
    hand: e.HAND_COST !== undefined && e.HAND_COST !== '' ? Math.max(0, parseInt(e.HAND_COST, 10) || 0) : 1,
    voice: e.TTS_COST !== undefined && e.TTS_COST !== '' ? Math.max(0, parseInt(e.TTS_COST, 10) || 0) : 1,
    download: e.DOWNLOAD_COST !== undefined && e.DOWNLOAD_COST !== '' ? Math.max(0, parseInt(e.DOWNLOAD_COST, 10) || 0) : 1,
  },
  mail: {
    host: e.SMTP_HOST || '',
    port: parseInt(e.SMTP_PORT, 10) || 465,
    secure: e.SMTP_SECURE ? e.SMTP_SECURE !== 'false' : (parseInt(e.SMTP_PORT, 10) || 465) === 465,
    user: e.SMTP_USER || '',
    pass: e.SMTP_PASS || '',
    from: e.MAIL_FROM || ((e.APP_NAME || 'Cliporra') + ' <' + (e.SMTP_USER || 'no-reply@localhost') + '>'),
    enabled: Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS),
  },
  video: {
    apiKey: e.J2V_API_KEY || '',
    templateId: e.J2V_TEMPLATE_ID || 'H9bhMdrmHQ9ccvbBfbI7',
    enabled: e.VIDEO_ENABLED !== 'false' && Boolean(e.J2V_API_KEY),
  },
  hand: {
    enabled: e.HAND_ENABLED !== 'false',
    apiUrl: e.HAND_API_URL || 'https://freeapi.pro',
    maxChars: parseInt(e.HAND_MAX_CHARS, 10) || 6000,
    brand: e.HAND_BRAND !== 'false', // false hides the provider's footer on each page
  },
  tts: {
    enabled: e.TTS_ENABLED !== 'false',
    apiUrl: e.TTS_API_URL || 'https://freeapi.pro',
    maxChars: parseInt(e.TTS_MAX_CHARS, 10) || 5000,
  },
  downloader: {
    enabled: e.DOWNLOADER_ENABLED !== 'false',
    apiUrl: e.DOWNLOAD_API_URL || 'https://freeapi.pro/api/alldl',
  },
};

if (!config.jwtSecret || config.jwtSecret === 'change-me') {
  if (config.isProd) throw new Error('Set a strong JWT_SECRET in your environment variables.');
  config.jwtSecret = 'dev-only-secret';
}

const missingDb = ['DB_USER', 'DB_NAME'].filter((k) => !e[k]);
if (missingDb.length) {
  throw new Error(
    'Missing database settings: ' + missingDb.join(', ') +
    '. Add them to your .env (local) or the Environment variables of your Hostinger Node.js app. ' +
    'Use the MySQL user and database created in hPanel > Databases, not root.'
  );
}

module.exports = config;
