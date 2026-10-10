import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRow, caseWeightLb, pricePerLb, buildOptions, lookupFor } from './parse.mjs';

// Rows copied from andrew's "og apples" search screenshot (Oct 10 2026).
const ROWS = [
  '▸ 42994 OG Apples Gala WXFP 40 lb 72/88 ct 58.00 / 1.45 AD 0 Add to Cart 0',
  '▸ 252095 OG Apples Cosmic Crisp USXF 12/3 lb Bag 72.00 / 6.00 0 Add to Cart 0',
  '▸ 226624 OG Apples Cosmic Crisp WXFP 27 lb 40/60 ct 69.00 / 2.56 0 Add to Cart 2',
  '▸ 49684 OG Apples Fuji 6/4 pk Spring Leaf 29.00 / 4.83 0 Add to Cart 0',
  '▸ 43155 OG Apples Fuji Juice Grade 38 lb 54.00 / 1.42 0 Add to Cart 0',
  '▸ 69174 CV Bacon Sunday Natural 12/8 oz Applegate Farms 0.00 / 0.00 1 Add to Cart 0'
];

test('parses a product row', () => {
  assert.deepEqual(parseRow(ROWS[0]), {
    code: '42994', description: 'OG Apples Gala WXFP 40 lb 72/88 ct',
    casePrice: 58, unitPrice: 1.45, onAd: true
  });
  assert.equal(parseRow(ROWS[1]).onAd, false);
});

test('ignores header and junk lines', () => {
  assert.equal(parseRow('Product Code Description Case / Unit Price AD Quantity'), null);
  assert.equal(parseRow(''), null);
});

test('works out case weight and $/lb', () => {
  assert.equal(caseWeightLb('OG Apples Gala WXFP 40 lb 72/88 ct'), 40);
  assert.equal(caseWeightLb('OG Apples Cosmic Crisp USXF 12/3 lb Bag'), 36);
  assert.equal(caseWeightLb('OG Blueberries 12/1 pt'), null);
  assert.equal(pricePerLb(parseRow(ROWS[1])), 2);
  assert.equal(pricePerLb(parseRow(ROWS[0])), 1.45);
});

test('builds options: leave-out words, $0 rows dropped, cheapest per lb first', () => {
  const opts = buildOptions(ROWS.map(parseRow), 'Juice, pk');
  assert.deepEqual(opts.map(o => o.code), ['42994', '252095', '226624']);
});

test('default lookup words match the app', () => {
  assert.equal(lookupFor({ name: ' Apples ', lookup: '' }), 'OG Apples');
  assert.equal(lookupFor({ name: 'Grapes', lookup: 'OG Grapes Red' }), 'OG Grapes Red');
});
