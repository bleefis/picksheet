// Sends one email through Gmail (smtp.gmail.com, port 465) with an app password.
// Needs GMAIL_USER and GMAIL_APP_PASSWORD in Netlify's environment settings.
import tls from 'node:tls';

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const wrap = s => s.replace(/.{1,76}/g, '$&\r\n');

export async function sendMail({ to, subject, html, attachments = [] }) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) throw new Error('Email is not set up yet (GMAIL_USER / GMAIL_APP_PASSWORD missing).');

  const boundary = 'ps' + Date.now().toString(36);
  const parts = [
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(html))}`,
    ...attachments.map(a =>
      `--${boundary}\r\nContent-Type: ${a.type || 'text/csv'}; name="${a.name}"\r\nContent-Disposition: attachment; filename="${a.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(a.content))}`)
  ];
  const message = [
    `From: Picksheet <${user}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    parts.join('\r\n') + `\r\n--${boundary}--`
  ].join('\r\n').replace(/^\./gm, '..');

  const socket = tls.connect({ host: 'smtp.gmail.com', port: 465, servername: 'smtp.gmail.com' });
  socket.setEncoding('utf8');
  let buffer = '';
  const waiting = [];
  socket.on('data', chunk => {
    buffer += chunk;
    let m;
    // A reply ends with a line like "250 OK" (a dash after the code means more lines follow).
    while ((m = buffer.match(/^(?:\d{3}-.*\r\n)*(\d{3}) .*\r\n/))) {
      buffer = buffer.slice(m[0].length);
      const w = waiting.shift();
      if (w) w(m[0]);
    }
  });
  const reply = () => new Promise((resolve, reject) => {
    waiting.push(resolve);
    socket.once('error', reject);
  });
  const step = async (line, expect) => {
    if (line != null) socket.write(line + '\r\n');
    const r = await reply();
    if (!r.startsWith(expect)) throw new Error(`Gmail said: ${r.trim().slice(0, 200)}`);
    return r;
  };
  try {
    await step(null, '220');
    await step('EHLO picksheet', '250');
    await step('AUTH PLAIN ' + b64(`\0${user}\0${pass}`), '235');
    await step(`MAIL FROM:<${user}>`, '250');
    for (const r of to.split(',')) await step(`RCPT TO:<${r.trim()}>`, '250');
    await step('DATA', '354');
    await step(message + '\r\n.', '250');
    await step('QUIT', '221').catch(() => {});
  } finally {
    socket.end();
  }
}
