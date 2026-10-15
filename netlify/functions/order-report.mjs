// Called by the cart robot when it finishes: emails how each cart went.
// It only reports an order the robot finished in the last 10 minutes.
import { sendMail } from '../lib/mail.mjs';
import { readOrder, orderDate, json, ORDER_EMAIL, ACCOUNTS } from '../lib/order.mjs';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default async req => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { id } = await req.json().catch(() => ({}));
  const order = await readOrder(id);
  const robot = order && order.robot;
  if (!robot || !robot.finishedAt || Date.now() - new Date(robot.finishedAt) > 10 * 60e3) return json({ error: 'Nothing to report' }, 400);

  const list = items => `<ul style="margin:4px 0 0 18px;padding:0">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const block = acct => {
    const r = robot[acct] || {};
    const label = ACCOUNTS[acct].label;
    const lines = order[acct] || [];
    if (!lines.length) return `<p><b>${label}</b>: nothing ordered this week, cart left alone.</p>`;
    if (r.state === 'partial') return `<p style="color:#b3261e"><b>${label} (${ACCOUNTS[acct].number}): only ${r.added} of ${r.expected} items reached the cart.</b> Cart before: ${esc(r.before)}. Cart after: ${esc(r.after)}. Compare the cart with the order email and add the rest by hand.</p>`;
    if (r.state !== 'done') return `<p style="color:#b3261e"><b>${label}: cart NOT loaded.</b> ${esc(r.error || robot.error || 'Unknown problem')}. Import the CSV from the order email by hand.</p>`;
    let html = `<p><b>${label} (${ACCOUNTS[acct].number})</b>: ${r.added} item${r.added === 1 ? '' : 's'} added.`;
    if (r.before) html += ` Cart before: ${esc(r.before)}.`;
    if (r.after) html += ` Cart after: ${esc(r.after)}.`;
    html += '</p>';
    if (r.obsolete && r.obsolete.length) html += `<p style="color:#b3261e"><b>Obsolete, not added. Pick a replacement on Four Seasons:</b>${list(r.obsolete)}</p>`;
    if (r.already && r.already.length) html += `<p><b>Already in the cart before this order (left as is):</b>${list(r.already)}</p>`;
    if (r.overlaps && r.overlaps.length) html += `<p><b>Ordered again on top of what was already there:</b>${list(r.overlaps)}</p>`;
    return html;
  };
  const ok = ['produce', 'meat'].every(a => !(order[a] || []).length || (robot[a] || {}).state === 'done');
  try {
    await sendMail({
      to: ORDER_EMAIL,
      subject: `${ok ? 'Carts loaded' : 'Cart problem'} · Four Seasons order ${orderDate(order)}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2a24;font-size:14px">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">${ok ? 'Both carts are loaded' : 'Something needs a look'}</div>
        ${block('produce')}${block('meat')}
        <p style="font-size:12px;color:#5d6a63">Nothing was submitted. Review the carts on Four Seasons and check out when ready.</p></div>`
    });
    return json({ sent: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
