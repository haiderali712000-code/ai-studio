const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const { migrate } = require('./src/db');
const { loadUser } = require('./src/middleware/auth');
const { recoverStale } = require('./src/services/clips');

const app = express();
app.set('trust proxy', 1); // Hostinger sits behind a reverse proxy
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use(helmet({
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  hsts: false, // Temporary: enable after HTTPS setup
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc: ['https://fonts.gstatic.com'],
      mediaSrc: ["'self'", 'blob:', 'https://*.json2video.com'],
      imgSrc: ["'self'", 'data:', 'https://i.ytimg.com', 'https://*.googleusercontent.com'],
      frameSrc: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
}));

app.use(compression());
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: false, limit: '500kb' }));
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '7d' : 0 }));

app.use((req, res, next) => {
  res.locals.appName = config.appName;
  res.locals.downloaderEnabled = config.downloader.enabled;
  res.locals.ttsEnabled = config.tts.enabled;
  res.locals.videoEnabled = config.video.enabled;
  res.locals.handEnabled = config.hand.enabled;
  res.locals.features = require('./src/features');
  res.locals.active = '';
  next();
});
app.use(loadUser);

app.use('/', require('./src/routes/pages'));
app.use('/', require('./src/routes/auth'));
app.use('/api', require('./src/routes/api'));
app.use('/admin', require('./src/routes/admin'));

app.use((req, res) => res.status(404).render('404'));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: 'Something went wrong. Try again.' });
  res.status(500).render('error');
});

(async () => {
  console.log(`Connecting to MySQL at ${config.db.host}:${config.db.port} as "${config.db.user}", database "${config.db.database}"...`);
  await migrate();
  console.log('Database ready.');
  await recoverStale();
  const server = app.listen(config.port, () => console.log(`${config.appName} running on http://localhost:${config.port}`));
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Close the other app or set PORT=3001 in .env.` : err.message);
    process.exit(1);
  });
})().catch((e) => {
  if (e.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('Database login was refused for user "' + config.db.user + '". Check DB_USER and DB_PASSWORD. On Hostinger use the MySQL user created in hPanel > Databases (it usually looks like u123456789_name), never root.');
  } else if (e.code === 'ER_BAD_DB_ERROR') {
    console.error('Database "' + config.db.database + '" was not found. Check DB_NAME (Hostinger names look like u123456789_dbname).');
  } else if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
    console.error('Cannot reach MySQL at ' + config.db.host + ':' + config.db.port + '. On Hostinger Node.js hosting try DB_HOST=localhost, or 127.0.0.1.');
  } else {
    console.error('Startup failed:', e.message);
  }
  process.exit(1);
});
