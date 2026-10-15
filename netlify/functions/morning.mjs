// Netlify timer, every half hour. GitHub's own timer often starts hours late
// or not at all, so this kicks off the work on time:
//  - 5:00–9:30 AM Virginia time: if today's prices aren't in yet and no check
//    is running or just started, start the price check (it retries every half
//    hour, so a short Four Seasons outage doesn't cost the whole morning).
//  - 10:00 AM: if prices still aren't in, email a warning (once, since this
//    is the only run in that half hour).
import { sendMail } from '../lib/mail.mjs';

const DATABASE_URL = 'https://picksheet-8b2a0-default-rtdb.firebaseio.com';
const ORDER_EMAIL = 'highlandrootsmkt@gmail.com';
const SITE = 'https://deploy-preview-1--picksheet.netlify.app';   // the app's Setup page; switch when the new app goes live
const REPO = 'https://api.github.com/repos/bleefis/picksheet/actions/workflows/price-check.yml';

export const config = { schedule: '0,30 * * * *' };

const va = (t = Date.now()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(t)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
};
const when = t => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const github = (path, init = {}) => fetch(REPO + path, {
  ...init,
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'picksheet', ...(init.headers || {}) }
});

/** What to do at this moment: 'start', 'email' or a reason to do nothing. */
export function decide({ now, prices, recentRuns }) {
  const t = va(now);
  const checkedToday = prices && prices.checkedAt && va(prices.checkedAt).date === t.date;
  if (checkedToday) return 'prices already in';
  if (t.hour >= 5 && t.hour <= 9) {
    const r = prices && prices.running;
    if (r && r.startedAt && now - Date.parse(r.at || r.startedAt) < 10 * 60e3) return 'a check is running';
    if (recentRuns > 0) return 'a check started in the last 25 minutes';
    return 'start';
  }
  if (t.hour === 10 && t.minute < 30) return 'email';
  return 'outside the morning';
}

export default async () => {
  const now = Date.now();
  const get = path => fetch(`${DATABASE_URL}/prices/${path}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  const [checkedAt, running, failed] = await Promise.all([get('checkedAt'), get('running'), get('failed')]);
  const lite = { checkedAt, running, failed };
  let recentRuns = 0;
  const t = va(now);
  if (t.hour >= 5 && t.hour <= 9) {
    const since = new Date(now - 25 * 60e3).toISOString();
    const res = await github(`/runs?created=>=${since}&per_page=10`);
    recentRuns = res.ok ? (await res.json()).total_count : 0;
  }
  const action = decide({ now, prices: lite, recentRuns });
  console.log(`Morning timer ${t.date} ${t.hour}:${String(t.minute).padStart(2, '0')}: ${action}`);

  if (action === 'start') {
    const res = await github('/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { morning: 'true' } }) });
    console.log(`Started the price check: ${res.status}`);
  } else if (action === 'email') {
    const failedToday = failed && failed.at && va(failed.at).date === t.date;
    await sendMail({
      to: ORDER_EMAIL,
      subject: 'Four Seasons prices didn\'t refresh this morning',
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2a24;font-size:14px;max-width:560px">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">This morning's price check didn't finish</div>
        <p>${failedToday && failed.noResponse ? 'The Four Seasons website didn\'t respond this morning. ' : ''}The picksheet is still showing prices from <b>${checkedAt ? when(checkedAt) : 'an earlier check'}</b>, so some prices or items may be out of date.</p>
        <p>To refresh them, open Setup and tap <b>Refresh all prices</b>. It takes about 7 minutes.</p>
        <p style="margin:20px 0"><a href="${SITE}/#setup" style="background:#0f3d2e;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700">Open Setup</a></p>
        <p style="font-size:12px;color:#5d6a63">The check tries every half hour from 5 to 9:30 AM. This email is sent at most once a day.</p></div>`
    });
    console.log('Warning email sent');
  }
};
