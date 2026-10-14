// Builds the Monday price report from Firebase data. Pure, so it can be tested
// offline. The Netlify site turns the result into the email.

import { snapshotFromPrices, vaDate } from './history.mjs';

const isItemNo = s => /^\d+$/.test(String(s || '').trim());
const round = n => Math.round(n * 100) / 100;

/** The saved day to compare with: the latest one a week or more ago, else the oldest before today. */
export function pickBaseline(history, today) {
  const days = Object.keys(history || {}).filter(d => d < today).sort();
  if (!days.length) return null;
  const weekAgo = vaDate(new Date(today + 'T12:00:00Z').getTime() - 7 * 86400e3);
  const old = days.filter(d => d <= weekAgo);
  return old.length ? old[old.length - 1] : days[0];
}

/** The most recent order sent in the last 10 days. */
export function lastOrder(orders, now) {
  const list = Object.entries(orders || {})
    .map(([id, o]) => ({ id, ...o }))
    .filter(o => o.createdAt && now - new Date(o.createdAt) < 10 * 86400e3 && now >= new Date(o.createdAt))
    .filter(o => (o.produce || []).length || (o.meat || []).length)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list[0] || null;
}

const change = (was, now) => (was > 0 && now > 0 ? round(now - was) : null);

export function buildReport({ prices, products, history, orders, now = Date.now() }) {
  const today = vaDate(now);
  const current = snapshotFromPrices(prices).codes;
  const baselineDate = pickBaseline(history, today);
  const base = (baselineDate && history[baselineDate] && history[baselineDate].codes) || {};

  const order = lastOrder(orders, now);
  const ordered = [];
  if (order) for (const account of ['produce', 'meat']) {
    for (const l of order[account] || []) {
      const cur = current[l.id];
      ordered.push({ account, id: String(l.id), name: l.name || (cur && cur.d) || '#' + l.id, q: l.q, was: l.casePrice || null, now: cur ? cur.p : null, desc: (cur && cur.d) || l.name || '', change: change(l.casePrice, cur && cur.p) });
    }
  }

  const items = [];
  for (const p of (products && products.items) || []) {
    if (!p || !isItemNo(p.lookup)) continue;
    const e = prices && prices.products && prices.products[p.key];
    const id = String((e && e.id) || p.lookup).trim();
    const now_ = e && e.status === 'ok' ? e.casePrice : null;
    const old = base[id] || (e && e.replacedFrom && base[e.replacedFrom]) || null;
    items.push({
      account: p.account === 'meat' ? 'meat' : 'produce', id, name: p.name || (e && e.description) || '#' + id,
      desc: (e && e.description) || (old && old.d) || '', was: old ? old.p : null, now: now_,
      status: e ? e.status || 'ok' : 'unchecked', replacedFrom: (e && e.replacedFrom) || null, change: change(old && old.p, now_)
    });
  }
  // Changes first (biggest jumps at the top), then the rest by name.
  const weight = r => (r.change ? 0 : r.now == null ? 1 : 2);
  items.sort((a, b) => weight(a) - weight(b) || (b.change || 0) - (a.change || 0) || a.name.localeCompare(b.name));

  const all = ordered.concat(items);
  return {
    createdAt: new Date(now).toISOString(), date: today, pricesAt: (prices && prices.checkedAt) || null,
    baselineDate, order: order ? { id: order.id, createdAt: order.createdAt } : null,
    ordered, items,
    up: items.filter(r => r.change > 0).length, down: items.filter(r => r.change < 0).length,
    orderedUp: ordered.filter(r => r.change > 0).length, orderedDown: ordered.filter(r => r.change < 0).length,
    missing: all.filter(r => r.now == null).length
  };
}
