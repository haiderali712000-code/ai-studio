# AI Studio (Node.js SaaS starter)

Live now: **YouTube URL → best clips** (timestamps, titles, hooks, score, in-page preview, CSV export).
Included: email + Google login, credits system, user dashboard, history, billing page (checkout placeholder), admin panel.

Stack: Node.js 18+, Express, EJS, MySQL (mysql2), JWT cookie auth. No build step.

## Run locally
1. Create a MySQL database.
2. `cp .env.example .env` and fill in DB, `JWT_SECRET`, `ADMIN_EMAILS`, and one AI key.
3. `npm install && npm start` then open http://localhost:3000 (tables are created automatically).

## Deploy on Hostinger
Node.js apps need a Hostinger plan that includes Node.js web apps (Business or Cloud). Check your plan in hPanel.
1. hPanel > Databases > MySQL: create a database and user. Use `DB_HOST=localhost`.
2. hPanel > Websites > Add website > Node.js Apps. Upload this folder as a zip (or connect Git).
3. Set Node version 18 or 20, entry file `server.js`, install command `npm install`, start command `npm start`.
4. Add every variable from `.env.example` in the app's Environment variables (set `BASE_URL` to your https domain, `NODE_ENV=production`).
5. Enable SSL for your domain. Deploy.
Your first admin: put your email in `ADMIN_EMAILS`, then sign up with it.

### Troubleshooting: "Access denied for user root"
The app is not seeing your database settings. Set `DB_USER`, `DB_PASSWORD` and `DB_NAME` to the MySQL user and database you created in hPanel (names look like `u123456789_name`), never `root`. On Hostinger add them under the Node.js app's Environment variables, then redeploy/restart. Locally, make sure the file is named `.env` (not `.env.example`) and sits next to `server.js`.

## Email sign-up with verification code
Signing up with email stores a pending record (name, hashed password, hashed 6-digit code) and emails the code through SMTP (`src/services/mailer.js`). The account is created only after the code is entered on `/verify`. Codes expire after 10 minutes, allow 5 wrong tries, can be re-sent once a minute and at most 5 times an hour.
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. On Hostinger create a mailbox in hPanel > Emails and use `smtp.hostinger.com`, port 465. Locally, with no SMTP set, the code is printed in the terminal. In production, email sign-up is refused until SMTP is configured (Google still works).
Accounts created before this update were never verified; they keep working.

## Google login
Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web). Add the redirect URI
`https://yourdomain.com/auth/google/callback` (and `http://localhost:3000/auth/google/callback` for local testing).
Put the ID and secret in `.env`. The button appears automatically once both are set.

## How the clip finder works
`src/services/youtube.js` fetches captions (or parses a transcript the user pastes) → `src/services/clips.js` splits it into chunks, asks the AI (`src/services/ai.js`, Anthropic or OpenAI) for ranked clips, validates and de-overlaps them → result stored on the job. Credits are charged up front and refunded automatically if a job fails.

Notes:
- YouTube sometimes blocks caption requests from hosting IPs. The "paste transcript" fallback covers that. For a more reliable route later, use a transcript API or Whisper on the audio.
- Jobs run in-process. Fine for early traffic; move to a queue (BullMQ + Redis) when you scale.
- This version gives timestamps and a preview player. Cutting real video files needs ffmpeg and yt-dlp on a VPS, which shared Node hosting usually does not allow.

## Downloader
`src/services/downloader.js` calls the endpoint in `DOWNLOAD_API_URL` and returns the direct video, audio and quality links to the browser (files are not routed through your server). Costs `DOWNLOAD_COST` credits and refunds on failure. It depends on a third-party service that can change or disappear, so keep `DOWNLOADER_ENABLED` switchable. Downloading content you do not own or have permission to use can break the source site's terms (YouTube's included) and copyright law, so decide your policy before you take payments.

## AI video maker
`src/services/video.js` writes a scene-by-scene script with the AI provider, then sends the scenes to a JSON2Video template (`J2V_TEMPLATE_ID`) and polls until the render is done (up to 20 minutes). The finished MP4 link is stored on the job and shown on `/jobs/:id`, with a server-side download button. The API key lives only in `.env` (`J2V_API_KEY`); without it the tool stays off. Costs `VIDEO_COST` credits (default 5), refunded automatically if the render fails, the server restarts, or the service is out of quota. Users can run 2 videos at a time.
The template must be in the same JSON2Video account as the API key, and it must accept the variables `scenes`, `voice1`, `subtitles`, `music`, `logo` and `imageSettings`.

## Text to handwriting
`src/services/handwriting.js` calls the free HandSter API (`POST {HAND_API_URL}/api/hand`) from your server: it renders every page of the text (up to 6 A4 pages) and returns them as images with per-page and Download all buttons. Options: handwriting style, ink colour (swatches or any hex), ink size, ruled or plain paper, neat or rough, English or Urdu, PNG or JPEG. Costs `HAND_COST` credits per generation and refunds on failure. Style and colour lists are read from the provider (cached 6h) with a safe fallback. `HAND_BRAND=false` hides the provider's footer line on the pages. Provider terms: personal and lawful use; students should follow their school's academic-honesty rules.

## Voiceover
`src/services/tts.js` proxies the free SpeechSter API at `TTS_API_URL` (freeapi.pro): it lists voices (cached 6h), splits text at sentence boundaries into ~600-char chunks, synthesizes them in parallel and returns one merged MP3. Costs `TTS_COST` credits per voiceover and refunds on failure. Switch off with `TTS_ENABLED=false`; text limit is `TTS_MAX_CHARS`.

## Adding the next tools
1. Add an entry in `src/features.js` (set `status: 'live'`, `href`).
2. Add a view and a route in `src/routes/pages.js` and `src/routes/api.js`, reusing `credits.spend()` and the `jobs` table (`type` column).
3. Call the provider API from a new file in `src/services/`.

## Payments (next step)
`credit_ledger` and `src/plans.js` are ready. Add a checkout route and a webhook that calls `grant(userId, credits, 'purchase', orderId)`. Confirm which gateway can pay out to your country before choosing one.

## Security notes
Passwords hashed with bcrypt, httpOnly SameSite cookies, rate limits on auth and job creation, Helmet CSP. Add email verification and password reset (e.g. Nodemailer with your Hostinger mailbox) before launch.
