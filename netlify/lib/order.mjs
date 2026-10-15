// Shared helpers for the order functions.
export const DATABASE_URL = 'https://picksheet-8b2a0-default-rtdb.firebaseio.com';
export const ORDER_EMAIL = 'highlandrootsmkt@gmail.com';
export const ACCOUNTS = { produce: { label: 'Produce', number: '94273' }, meat: { label: 'Meat & Dairy', number: '94274' } };

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Read one order from Firebase (orders are readable without a key). */
export async function readOrder(id) {
  if (!/^[\w-]{6,60}$/.test(String(id || ''))) return null;
  const res = await fetch(`${DATABASE_URL}/orders/${id}.json`);
  return res.ok ? res.json() : null;
}

/** Start a GitHub Actions workflow on main. Needs GITHUB_TOKEN in Netlify's environment settings. */
export async function startWorkflow(file, inputs) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GitHub key is not set up yet (GITHUB_TOKEN missing).');
  const res = await fetch(`https://api.github.com/repos/bleefis/picksheet/actions/workflows/${file}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'picksheet' },
    body: JSON.stringify({ ref: 'main', inputs })
  });
  if (!res.ok) throw new Error(`GitHub said ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => n ? '$' + Number(n).toFixed(2) : '';
const dollars = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function orderDate(order) {
  return new Date(order.createdAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
}
export function fileDate(order) {
  return new Date(order.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function csvFor(lines) {
  return ['ItemID,Quantity,ItemName'].concat((lines || []).map(l => `${l.id},${l.q},${String(l.name).replace(/,/g, ' ')}`)).join('\r\n') + '\r\n';
}

const TH = 'background:#0f3d2e;color:#fff;text-align:left;font-size:12px;padding:7px 9px;';
const TD = 'padding:7px 9px;border-bottom:1px solid #edf0ee;font-size:13px;';

/** The order email: one table per account, with item #, name, quantity, case price and estimate. */
export function orderEmailHtml(order) {
  const section = acct => {
    const lines = order[acct] || [];
    const head = `<h3 style="margin:22px 0 8px;font-size:15px;color:#14201a">${ACCOUNTS[acct].label} · Customer ${ACCOUNTS[acct].number}</h3>`;
    if (!lines.length) return head + `<p style="color:#5d6a63;font-size:13px;margin:0">No ${ACCOUNTS[acct].label} items this week.</p>`;
    let cases = 0, est = 0;
    const rows = lines.map(l => {
      cases += l.q; est += (l.casePrice || 0) * l.q;
      return `<tr><td style="${TD}">${esc(l.id)}</td><td style="${TD}">${esc(l.name)}</td><td style="${TD}text-align:right">${l.q}</td><td style="${TD}text-align:right">${money(l.casePrice)}</td><td style="${TD}text-align:right">${l.casePrice ? money(l.casePrice * l.q) : ''}</td></tr>`;
    }).join('');
    return head + `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:640px">
      <tr><th style="${TH}">Item #</th><th style="${TH}">Item</th><th style="${TH}text-align:right">Qty</th><th style="${TH}text-align:right">Case</th><th style="${TH}text-align:right">Est.</th></tr>
      ${rows}
      <tr><td style="${TD}font-weight:700;border:0"></td><td style="${TD}font-weight:700;border:0">${lines.length} item${lines.length === 1 ? '' : 's'}</td><td style="${TD}font-weight:700;border:0;text-align:right">${cases}</td><td style="${TD}border:0"></td><td style="${TD}font-weight:700;border:0;text-align:right">${est ? dollars(est) : ''}</td></tr>
    </table>`;
  };
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2a24">
    <div style="font-size:18px;font-weight:700">Four Seasons order · ${esc(orderDate(order))}</div>
    <div style="font-size:12px;color:#5d6a63;margin-top:4px">Sent from the picksheet. The cart robot is loading both carts now; a second email will report how it went.</div>
    ${section('produce')}${section('meat')}
    <p style="font-size:12px;color:#5d6a63;margin-top:18px">The two CSV files attached can be re-imported on Four Seasons (Profile › Import Order) if the carts didn't load.</p>
  </div>`;
}
