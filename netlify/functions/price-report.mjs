// Called by the Monday price report: emails what changed since last week.
// It only sends a report the price check saved in the last 30 minutes.
import { sendMail } from '../lib/mail.mjs';
import { DATABASE_URL, ORDER_EMAIL, ACCOUNTS, json } from '../lib/order.mjs';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Number(n).toFixed(2);
const day = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const when = t => new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });

// Per piece or per pound, worked out from the pack size (same rules as the app).
function unitText(desc, price) {
  const d = String(desc || '');
  if (!(price > 0)) return '';
  const multi = d.match(/\b(\d+)\s*\/\s*(\d+(?:\.\d+)?)\s*(?:lb|#)\b/i);
  const single = d.match(/\b(\d+(?:\.\d+)?)\s*(?:lb|#)\b/i);
  const lb = multi ? multi[1] * multi[2] : single ? +single[1] : 0;
  if (lb) return money(price / lb) + '/lb';
  const range = d.match(/\b(\d+)\s*\/\s*(\d+)\s*ct\b/i);
  if (range && +range[2] > +range[1]) return money(price / range[2]) + '–' + money(price / range[1]).slice(1) + ' each';
  const m = d.match(/\b(\d+)\s*\/\s*\d/) || d.match(/\b(\d+)\s*ct\b/i);
  return m && +m[1] > 1 ? money(price / m[1]) + ' each' : '';
}

const RED = '#b3261e', GREEN = '#1e7d46', MUTED = '#5d6a63', LINE = '#e6ebe8';
const HEAD = `color:${MUTED};font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;`;

function changeCell(r) {
  if (r.now == null) return `<td align="right" style="color:${RED}">${r.status === 'obsolete' ? 'Obsolete' : 'Not available'}</td>`;
  if (r.was == null) return `<td align="right" style="color:${MUTED}">no earlier price</td>`;
  if (!r.change) return `<td align="right" style="color:${MUTED}">same</td>`;
  const pct = Math.round(Math.abs(r.change) / r.was * 100);
  return r.change > 0
    ? `<td align="right" style="color:${RED};font-weight:700;white-space:nowrap">▲ ${money(r.change)} (${pct}%)</td>`
    : `<td align="right" style="color:${GREEN};font-weight:700;white-space:nowrap">▼ ${money(-r.change)} (${pct}%)</td>`;
}
function row(r, sub) {
  const bg = r.change > 0 ? '#fdf1f0' : r.change < 0 ? '#eef8f1' : '';
  const strong = r.change ? 'font-weight:700;' : '';
  return `<tr style="border-top:1px solid ${LINE};${bg ? 'background:' + bg : ''}">
    <td style="padding:8px 6px 8px 0;${strong}">${esc(r.name)}<br><span style="color:${MUTED};font-size:12px;font-weight:400">${sub}</span></td>
    <td align="right" style="white-space:nowrap">${r.was != null ? money(r.was) : '—'}</td>
    <td align="right" style="white-space:nowrap;${strong}">${r.now != null ? money(r.now) : '—'}</td>
    ${changeCell(r)}</tr>`;
}
const table = (wasLabel, rows) => `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px">
  <tr><td style="${HEAD}">Item</td><td align="right" style="${HEAD}">${wasLabel}</td><td align="right" style="${HEAD}">Today</td><td align="right" style="${HEAD}">Change</td></tr>${rows}</table>`;

export function reportHtml(r) {
  const sub = x => [ACCOUNTS[x.account].label, x.q ? `${x.q} case${x.q === 1 ? '' : 's'}` : '', unitText(x.desc, x.now) ? unitText(x.desc, x.now) + ' today' : '', x.replacedFrom ? `replaced #${x.replacedFrom}` : ''].filter(Boolean).map(esc).join(' · ');
  const ordered = r.order
    ? (r.ordered.length ? table('Last week', r.ordered.map(x => row(x, sub(x))).join('')) : `<p style="color:${MUTED}">That order had no items.</p>`)
    : `<p style="color:${MUTED};font-size:13px;margin:0">No order was sent from the new picksheet in the last 10 days.</p>`;
  const items = r.items.length ? table(r.baselineDate ? day(r.baselineDate).replace(/^\w+, /, '') : 'Before', r.items.map(x => row(x, sub(x))).join('')) : `<p style="color:${MUTED}">No products are set up by item #.</p>`;
  const all = r.ordered.concat(r.items);
  const up = all.filter(x => x.change > 0).length, down = all.filter(x => x.change < 0).length, same = all.filter(x => x.change === 0).length;
  return `<div style="background:#f1f3f2;padding:20px 8px;font-family:Arial,Helvetica,sans-serif;color:#1f2a24">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #dde3df">
  <div style="background:#0f3d2e;color:#fff;padding:18px 22px">
    <div style="font-size:20px;font-weight:700">Weekly price check · ${day(r.date)}</div>
    <div style="font-size:13px;opacity:.85;margin-top:4px">${r.baselineDate ? `Compared with ${day(r.baselineDate)}` : 'No earlier prices saved yet, so this week only shows today\'s prices'} · ${up} went up · ${down} went down · ${same} unchanged</div>
  </div>
  <div style="padding:18px 22px">
    <div style="font-size:15px;font-weight:700;margin-bottom:2px">What you ordered last week</div>
    <div style="font-size:12px;color:${MUTED};margin-bottom:8px">${r.order ? `The exact items from your order sent ${when(r.order.createdAt)}, priced again today` : ''}</div>
    ${ordered}
    <div style="font-size:15px;font-weight:700;margin:24px 0 2px">All item # products</div>
    <div style="font-size:12px;color:${MUTED};margin-bottom:8px">Every item set up by item # on the picksheet, changes first</div>
    ${items}
    <p style="font-size:11px;color:#8a958f;margin-top:18px">Prices are per case from Four Seasons${r.pricesAt ? `, checked ${new Date(r.pricesAt).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}.</p>
  </div></div></div>`;
}

export default async req => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { date } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return json({ error: 'Bad date' }, 400);
  const res = await fetch(`${DATABASE_URL}/price-reports/${date}.json`);
  const r = res.ok ? await res.json() : null;
  if (!r || !r.createdAt || Date.now() - new Date(r.createdAt) > 30 * 60e3) return json({ error: 'Nothing to report' }, 400);
  r.ordered = r.ordered || []; r.items = r.items || [];
  const all = r.ordered.concat(r.items);
  const ups = all.filter(x => x.change > 0).length, downs = all.filter(x => x.change < 0).length;
  try {
    await sendMail({
      to: ORDER_EMAIL,
      subject: `Price check ${day(r.date)}: ${ups} up, ${downs} down` + (r.missing ? `, ${r.missing} not available` : ''),
      html: reportHtml(r)
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
  return json({ ok: true, ups, downs });
};
