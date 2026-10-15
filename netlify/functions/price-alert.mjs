// Called by the late-prices alert: emails a warning when the morning price
// check hasn't refreshed the prices by 10 AM. Only for an alert the check
// saved in the last 30 minutes, and only if the prices are still stale.
import { sendMail } from '../lib/mail.mjs';
import { DATABASE_URL, ORDER_EMAIL, json } from '../lib/order.mjs';

const vaDate = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const when = t => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default async req => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { date } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return json({ error: 'Bad date' }, 400);
  const get = async path => { const r = await fetch(`${DATABASE_URL}/${path}.json`); return r.ok ? r.json() : null; };
  const alert = await get(`price-alerts/${date}`);
  if (!alert || !alert.createdAt || Date.now() - new Date(alert.createdAt) > 30 * 60e3) return json({ error: 'Nothing to send' }, 400);
  const checkedAt = await get('prices/checkedAt');
  if (checkedAt && vaDate(checkedAt) === date) return json({ ok: true, skipped: 'Prices were refreshed' });

  const site = new URL(req.url).origin;
  try {
    await sendMail({
      to: ORDER_EMAIL,
      subject: 'Four Seasons prices didn\'t refresh this morning',
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2a24;font-size:14px;max-width:560px">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">This morning's price check didn't run</div>
        <p>The picksheet is still showing prices from <b>${checkedAt ? when(checkedAt) : 'an earlier check'}</b>, so some prices or items may be out of date.</p>
        <p>To refresh them, open Setup and tap <b>Refresh all prices</b>. It takes about 7 minutes.</p>
        <p style="margin:20px 0"><a href="${site}/#setup" style="background:#0f3d2e;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700">Open Setup</a></p>
        <p style="font-size:12px;color:#5d6a63">The check tries every half hour from 5 to 9 AM. This email is sent at most once a day.</p></div>`
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
  return json({ ok: true });
};
