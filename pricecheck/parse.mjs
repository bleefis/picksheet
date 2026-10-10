// Pure helpers for the price check: turning portal text into tidy rows.
// Kept separate from the browser code so they can be tested offline.

// One search-results row as the portal shows it, e.g.
//   "42994  OG Apples Gala WXFP 40 lb 72/88 ct  58.00 / 1.45  AD  0  Add to Cart  0"
const CODE_RE  = /\b(\d{3,7})\b/;
const PRICE_RE = /(\d[\d,]*\.\d{2})\s*\/\s*(\d[\d,]*\.\d{2})/;

const num = s => Number(String(s).replace(/,/g, ''));

/** Parse one row's text. Returns null when it isn't a product row. */
export function parseRow(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const price = t.match(PRICE_RE);
  const code  = t.match(CODE_RE);
  if (!price || !code || code.index > price.index) return null;
  const description = t.slice(code.index + code[0].length, price.index).trim();
  if (!description) return null;
  const after = t.slice(price.index + price[0].length);
  return {
    code: code[1],
    description,
    casePrice: num(price[1]),
    unitPrice: num(price[2]),
    onAd: /\bAD\b/.test(after)
  };
}

/**
 * Total pounds in a case, from the pack size in the description.
 *   "40 lb"      → 40     "12/3 lb Bag" → 36    "38 lb" → 38
 *   "12/1 pt"    → null (no weight given)
 */
export function caseWeightLb(description) {
  const d = String(description);
  const multi = d.match(/\b(\d+)\s*\/\s*(\d+(?:\.\d+)?)\s*(?:lb|#)\b/i);
  if (multi) return num(multi[1]) * num(multi[2]);
  const single = d.match(/\b(\d+(?:\.\d+)?)\s*(?:lb|#)\b/i);
  return single ? num(single[1]) : null;
}

/** $/lb rounded to cents, or null when the weight is unknown. */
export function pricePerLb(row) {
  const lb = caseWeightLb(row.description);
  return lb && row.casePrice > 0 ? Math.round((row.casePrice / lb) * 100) / 100 : null;
}

/** Split "Juice, pk" into ['juice', 'pk']. */
export function excludeWords(exclude) {
  return String(exclude || '').split(/[,;]/).map(w => w.trim().toLowerCase()).filter(Boolean);
}

/** Search words used when an item's "Look up as" box is blank. Must match the app. */
export function lookupFor(item) {
  return (item.lookup || '').trim() || ('OG ' + item.name.trim());
}

/**
 * Turn raw search rows into the options shown on the phone:
 * drop leave-out words and $0.00 rows, de-duplicate, cheapest first.
 */
export function buildOptions(rows, exclude) {
  const words = excludeWords(exclude);
  const seen = new Set();
  return rows
    .filter(r => r && r.casePrice > 0)
    .filter(r => !words.some(w => r.description.toLowerCase().includes(w)))
    .filter(r => !seen.has(r.code) && seen.add(r.code))
    .map(r => ({ ...r, perLb: pricePerLb(r) }))
    .sort((a, b) => sortKey(a) - sortKey(b));
}

// Cheapest per pound first; items with no weight fall back to the portal's
// unit price so they still sort sensibly among themselves.
function sortKey(o) {
  return o.perLb != null ? o.perLb : o.unitPrice;
}
