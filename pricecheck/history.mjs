// A dated copy of every price the check found, so the Monday report can say
// what changed. Stored in Firebase under /price-history/{YYYY-MM-DD} as
// { at, codes: { itemNumber: { p: casePrice, d: description } } }.

const KEEP_DAYS = 70;

/** The Virginia calendar date (YYYY-MM-DD) of a moment. */
export function vaDate(when = new Date()) {
  return new Date(when).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Every item number and case price in a /prices record. */
export function snapshotFromPrices(prices) {
  const codes = {};
  for (const e of Object.values((prices && prices.products) || {})) {
    if (!e) continue;
    if (e.status === 'ok' && e.id && e.casePrice > 0) codes[e.id] = { p: e.casePrice, d: e.description || '' };
    for (const o of e.options || []) if (o && o.code && o.casePrice > 0) codes[o.code] = { p: o.casePrice, d: o.description || '' };
  }
  return { at: (prices && prices.checkedAt) || new Date().toISOString(), codes };
}

/** Save the snapshot for the day the prices were checked, and drop old days. */
export async function saveSnapshot(db, prices, { onlyIfMissing = false } = {}) {
  if (!prices || !prices.checkedAt) return null;
  const date = vaDate(prices.checkedAt);
  const ref = db.ref(`price-history/${date}`);
  if (onlyIfMissing && (await ref.get()).exists()) return date;
  await ref.set(snapshotFromPrices(prices));
  const cutoff = vaDate(Date.now() - KEEP_DAYS * 86400e3);
  const old = (await db.ref('price-history').orderByKey().endAt(cutoff).get()).val() || {};
  for (const d of Object.keys(old)) if (d < cutoff) await db.ref(`price-history/${d}`).remove();
  return date;
}
