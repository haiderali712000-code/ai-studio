const nodemailer = require('nodemailer');
const config = require('../config');

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure, // true for port 465, false for 587 (STARTTLS)
      auth: { user: config.mail.user, pass: config.mail.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transport;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sends the 6-digit sign-up code. Throws if the email could not be sent.
async function sendVerificationCode({ to, name, code, minutes }) {
  const subject = `${code} is your ${config.appName} verification code`;
  const text = `Hi ${name},\n\nYour ${config.appName} verification code is: ${code}\n\nIt expires in ${minutes} minutes. If you did not try to sign up, ignore this email.\n`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;padding:24px;color:#12163a">
  <h2 style="margin:0 0 12px">Verify your email</h2>
  <p>Hi ${esc(name)}, enter this code to finish creating your ${esc(config.appName)} account:</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f1f2f7;border-radius:10px;padding:16px;text-align:center;margin:18px 0">${esc(code)}</p>
  <p style="color:#5c6285;font-size:14px">The code expires in ${minutes} minutes. If you did not try to sign up, you can ignore this email.</p></div>`;

  if (!config.mail.enabled) {
    if (config.isProd) throw new Error('SMTP is not configured');
    console.log(`\n[mail:dev] SMTP not configured. Verification code for ${to}: ${code}\n`);
    return;
  }
  await getTransport().sendMail({ from: config.mail.from, to, subject, text, html });
}

module.exports = { sendVerificationCode };
