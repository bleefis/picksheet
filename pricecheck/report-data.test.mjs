import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, pickBaseline } from './report-data.mjs';

test('baseline is the latest saved day a week or more ago', () => {
  const h = { '2026-10-08': {}, '2026-10-12': {}, '2026-10-15': {} };
  assert.equal(pickBaseline(h, '2026-10-19'), '2026-10-12');
  assert.equal(pickBaseline({ '2026-10-15': {}, '2026-10-16': {} }, '2026-10-19'), '2026-10-15');
  assert.equal(pickBaseline({}, '2026-10-19'), null);
});

test('report compares last order and item # products', () => {
  const now = new Date('2026-10-19T10:30:00Z').getTime();
  const prices = { checkedAt: '2026-10-19T10:05:00Z', products: {
    a: { lookup: '231851', id: '231851', status: 'ok', description: 'OG Kefir Plain 6/32 oz', casePrice: 32.4 },
    b: { lookup: 'OG Blackberries', options: [{ code: '43652', description: '12/6 oz Driscolls', casePrice: 38 }] },
    c: { lookup: '249898', id: '249898', status: 'ok', description: 'Sour Cream 12/16 oz', casePrice: 41.1 }
  } };
  const products = { items: [
    { key: 'a', name: 'Kefir', lookup: '231851', account: 'meat' },
    { key: 'b', name: 'Blackberries', lookup: 'OG Blackberries', account: 'produce' },
    { key: 'c', name: 'Sour Cream', lookup: '249898', account: 'meat' }
  ] };
  const history = { '2026-10-12': { codes: { 231851: { p: 30.73 }, 249898: { p: 41.1 } } } };
  const orders = { x: { createdAt: '2026-10-13T20:00:00Z', produce: [{ id: '43652', q: 2, name: 'Blackberries 12/6 oz', casePrice: 36.5 }], meat: [{ id: '99999', q: 1, name: 'Gone item', casePrice: 10 }] } };
  const r = buildReport({ prices, products, history, orders, now });
  assert.equal(r.baselineDate, '2026-10-12');
  assert.deepEqual(r.ordered.map(o => [o.id, o.change, o.now]), [['43652', 1.5, 38], ['99999', null, null]]);
  assert.deepEqual(r.items.map(i => [i.id, i.change]), [['231851', 1.67], ['249898', 0]]);
  assert.equal(r.up, 1);
});
