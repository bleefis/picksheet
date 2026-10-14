// Cart robot: loads a sent order into both Four Seasons carts.
//
// For each account with items (Produce 94273, then Meat & Dairy 94274):
//   switch account → note what's already in the cart → Import Order with a CSV
//   → note obsolete items (the yellow bar) → Add All to Cart → note the cart
//   afterwards. The import table lasts for the whole sign-in, so the robot signs
//   out and back in before the second account.
// Nothing is ever submitted. Progress goes to Firebase /orders/{id}/robot,
// which the phone shows live, and a summary email is sent at the end.
//
// Needs FS_EMAIL, FS_PASSWORD, FIREBASE_KEY and ORDER_ID.
// DRY_RUN=1 signs in and reads the carts and import page without importing.

import { chromium } from 'playwright';
import { deleteApp, getApp } from 'firebase-admin/app';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PORTAL, ACCOUNTS, log, shot, initFirebase, signIn, signOut, switchAccount } from './portal.mjs';

const env = process.env;
const ID = env.ORDER_ID;
const DRY_RUN = !!env.DRY_RUN;
const LABEL = { produce: 'Produce', meat: 'Meat & Dairy' };
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

/** Cart count and total from the "ORDER: … 3 312.50" box at the top of every page. */
async function cartHeader(page) {
  const text = clean(await page.locator('body').innerText().catch(() => ''));
  const m = text.match(/ORDER:\s.*?\s(\d+)\s([\d,]+\.\d{2})\s/);
  return m ? { count: Number(m[1]), total: '$' + m[2] } : null;
}

/** What's in the cart right now: [{ code, name, qty }]. */
async function cartItems(page) {
  await page.goto(`${PORTAL}/shopping-cart`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const items = await page.evaluate(() => {
    const out = new Map();
    for (const a of document.querySelectorAll('a[href*="/item-content/"]')) {
      if (a.closest('.modal')) continue;                 // skip the "ad items you haven't ordered" box
      const m = a.href.match(/item-content\/(\d+)\//);
      if (!m || out.has(m[1])) continue;
      const row = a.closest('tr, li, .row, [class*="item"]') || a.parentElement;
      const input = row && row.querySelector('input[type=number], input[type=text], input[name*="Quantity" i]');
      out.set(m[1], { code: m[1], name: (a.innerText || '').trim(), qty: input ? Number(input.value) || null : null, row: (row ? row.innerText : '').replace(/\s+/g, ' ').slice(0, 160) });
    }
    return [...out.values()];
  });
  const head = await cartHeader(page);
  log(`Cart: ${head ? `${head.count} items, ${head.total}` : 'header not found'}; ${items.length} rows read`);
  items.slice(0, 5).forEach(i => log(`  ${i.row}`));
  return { head, items };
}

/** The import template's header row, so our CSV matches what Four Seasons expects. */
async function templateColumns(page) {
  try {
    const res = await page.request.get(`${PORTAL}/secure/account/import-order/ImportOrder-DownloadImportTemplate/`);
    const text = await res.text();
    log(`Import template: ${clean(text).slice(0, 200)}`);
    const first = text.split(/\r?\n/)[0];
    if (!first || /<html/i.test(text)) return null;
    return first.split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, ''));
  } catch (e) { log(`Template download failed: ${e.message}`); return null; }
}

function buildCsv(lines, columns) {
  const cols = columns && columns.length ? columns : ['ItemID', 'Quantity', 'ItemName'];
  const pick = (col, l) => /qty|quant/i.test(col) ? l.q : /item|product|code|sku|number/i.test(col) && !/desc|name/i.test(col) ? l.id : /desc|name/i.test(col) ? String(l.name).replace(/[,;]/g, ' ') : '';
  return [cols.join(',')].concat(lines.map(l => cols.map(c => pick(c, l)).join(','))).join('\r\n') + '\r\n';
}

/**
 * Take test lines back out of the carts: REMOVE="produce:43878;meat:43878,231851"
 * removes one cart line per item # in each account.
 */
async function removeItems(page, spec) {
  for (const part of spec.split(';')) {
    const [acct, codes] = part.split(':');
    if (!ACCOUNTS[acct] || !codes) continue;
    await switchAccount(page, ACCOUNTS[acct]);
    for (const code of codes.split(',').map(c => c.trim()).filter(Boolean)) {
      await page.goto(`${PORTAL}/shopping-cart`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      // Walk up from the item's link to the nearest box that holds exactly one
      // remove button, and mark that button so it can be clicked.
      const found = await page.evaluate((code) => {
        document.querySelectorAll('[data-robot-remove]').forEach(b => b.removeAttribute('data-robot-remove'));
        const all = document.querySelectorAll('button.btn-remove-shopping-cart, [class*="remove" i]');
        for (const a of document.querySelectorAll(`a[href*="/item-content/${code}/"]`)) {
          if (a.closest('.modal')) continue;
          for (let el = a.parentElement; el && el !== document.body; el = el.parentElement) {
            const btns = [...el.querySelectorAll('button.btn-remove-shopping-cart, button[class*="remove" i], a[class*="remove" i]')];
            if (btns.length === 1) { btns[0].setAttribute('data-robot-remove', '1'); return { ok: true }; }
            if (btns.length > 1) break;
          }
        }
        const link = document.querySelector(`a[href*="/item-content/${code}/"]`);
        return { ok: false, removeButtons: all.length, links: document.querySelectorAll(`a[href*="/item-content/${code}/"]`).length,
          around: link ? (link.closest('tr, li, div')?.parentElement?.outerHTML || '').replace(/\s+/g, ' ').slice(0, 1500) : '' };
      }, code);
      if (!found.ok) {
        log(`${LABEL[acct]}: #${code} remove button not found (links ${found.links}, remove buttons on page ${found.removeButtons})`);
        if (found.around) log(`  HTML near it: ${found.around}`);
        continue;
      }
      await page.locator('[data-robot-remove]').first().click();
      await page.waitForTimeout(1500);
      const yes = page.locator('.modal:visible button, [role=dialog]:visible button').filter({ hasText: /^\s*(yes|ok|remove|delete|confirm|continue)\s*$/i });
      if (await yes.count()) await yes.first().click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      const left = await cartItems(page);
      if (left.items.some(i => i.code === code)) { log(`${LABEL[acct]}: #${code} STILL in cart after remove`); continue; }
      log(`${LABEL[acct]}: removed #${code}`);
    }
    await cartItems(page);
  }
}

/** Import one account's CSV and add everything to its cart. */
async function importAndAdd(page, csv, acct, expected) {
  await page.goto(`${PORTAL}/secure/account/import-order`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const file = path.join(os.tmpdir(), `order-${acct}.csv`);
  fs.writeFileSync(file, csv);
  await page.locator('form[name=importOrderForm] input[type=file]').setInputFiles(file);
  await page.locator('select[name=delimiterCharacter]').selectOption({ label: 'Comma' }).catch(() => {});
  if (DRY_RUN) { log('Dry run: file chosen, not importing'); return { obsolete: [], dry: true }; }

  await page.locator('form[name=importOrderForm] button[type=submit]').click();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const text = await page.locator('body').innerText().catch(() => '');
  log(`After import: ${clean(text).slice(0, 1500)}`);
  await shot(page, `imported-${acct}`);
  // The import table belongs to the sign-in, not the account. If it holds more lines than
  // this account's order, stop before anything reaches the wrong cart.
  const imported = Number((clean(text).match(/IMPORTED ITEMS \((\d+)\)/i) || [])[1]);
  if (imported > expected) throw new Error(`The import table held ${imported} lines but this order has ${expected}. Stopped before adding anything to the cart.`);

  // The yellow bar names each obsolete line, e.g. "OG Grapes Red MEX|43884 Obsolete item #. Check Replacements"
  const obsolete = [...new Set([...text.matchAll(/([^\n|]*\|\s*\d+)\s*Obsolete item/gi)].map(m => clean(m[1]).replace(/\s*\|\s*/, ' #')))];
  if (/obsolete/i.test(text) && !obsolete.length) obsolete.push(clean((text.match(/[^\n]*obsolete[^\n]*/i) || [''])[0]).slice(0, 160));

  const addAll = page.locator('button:visible, a:visible, input[type=button]:visible, input[type=submit]:visible').filter({ hasText: /add all to cart/i });
  if (!(await addAll.count())) {
    await shot(page, `no-add-all-${acct}`);
    throw new Error('The import page had no "Add All to Cart" button. The CSV may not have been accepted.');
  }
  await addAll.first().click();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  log(`After Add All: ${clean(await page.locator('body').innerText().catch(() => '')).slice(0, 800)}`);
  return { obsolete };
}

async function main() {
  if (env.REMOVE) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    try { await signIn(page); await removeItems(page, env.REMOVE); }
    finally { await signOut(page).catch(() => {}); await browser.close(); }
    return;
  }
  for (const k of ['FS_EMAIL', 'FS_PASSWORD', 'FIREBASE_KEY', 'ORDER_ID']) if (!env[k]) throw new Error(`Missing ${k}.`);
  const db = initFirebase();
  const ref = db.ref(`orders/${ID}`);
  let order = (await ref.get()).val();
  // A test order (look-only, or a real 1-case test run by hand) when no real order is given.
  const SAMPLE = { createdAt: new Date().toISOString(), test: true,
    produce: [{ id: '43878', q: 1, name: 'OG Grapes Red Seedless PREM 19 lb' }], meat: [{ id: '231851', q: 1, name: 'OG Kefir Plain 6/32 oz' }] };
  if (!order && (DRY_RUN || env.TEST_ORDER)) {
    order = SAMPLE;
    if (!DRY_RUN) await ref.set(order);
  }
  if (!order) throw new Error(`Order ${ID} not found.`);
  if (order.robot && order.robot.state === 'done' && !DRY_RUN) { log('Already loaded; not loading twice.'); return; }
  const set = (p, v) => DRY_RUN ? Promise.resolve(log(`(dry run) robot/${p} =`, JSON.stringify(v))) : ref.child('robot/' + p).set(v);
  await set('state', 'running');
  await set('startedAt', new Date().toISOString());

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  let failed = false;
  let imported = false;
  try {
    await signIn(page);
    const columns = await templateColumns(page);
    for (const acct of ['produce', 'meat']) {
      const lines = order[acct] || [];
      if (!lines.length) { log(`${LABEL[acct]}: nothing ordered`); continue; }
      await set(acct, { state: 'running' });
      try {
        if (imported) {
          // Signing out and back in is what empties the import table.
          await signOut(page);
          await signIn(page);
        }
        imported = true;
        await switchAccount(page, ACCOUNTS[acct]);
        const before = await cartItems(page);
        const { obsolete } = await importAndAdd(page, buildCsv(lines, columns), acct, lines.length);
        const after = await cartItems(page);
        const had = new Map(before.items.map(i => [i.code, i]));
        const overlaps = lines.filter(l => had.has(String(l.id)))
          .map(l => `${l.name} #${l.id}: ${had.get(String(l.id)).qty || 'some'} already in cart + ${l.q} ordered`);
        const result = {
          state: 'done',
          added: Math.max(0, lines.length - obsolete.length),
          obsolete,
          overlaps,
          alreadyCount: before.items.length,
          already: before.items.map(i => `${i.name} #${i.code}${i.qty ? ' × ' + i.qty : ''}`),
          before: before.head ? `${before.head.count} items, ${before.head.total}` : '',
          after: after.head ? `${after.head.count} items, ${after.head.total}` : '',
          cartTotal: after.head ? after.head.total : ''
        };
        await set(acct, result);
        log(`${LABEL[acct]}: done`, JSON.stringify(result));
      } catch (e) {
        failed = true;
        log(`${LABEL[acct]}: FAILED ${e.message}`);
        await shot(page, `failed-${acct}`);
        await set(acct, { state: 'failed', error: e.message.slice(0, 300) });
      }
    }
  } catch (e) {
    failed = true;
    await set('error', e.message.slice(0, 300));
    throw e;
  } finally {
    await signOut(page).catch(e => log(`Sign out failed: ${e.message}`));
    await browser.close();
    await set('state', failed ? 'failed' : 'done');
    await set('finishedAt', new Date().toISOString());
    // Ask the app's site to email the summary (it holds the Gmail password).
    const site = /^https:\/\/[\w.-]+\.netlify\.app$/.test(order.site || '') ? order.site : '';
    if (site && !DRY_RUN) {
      const res = await fetch(`${site}/.netlify/functions/order-report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ID }) }).catch(e => ({ status: e.message }));
      log(`Summary email: ${res.status}`);
    }
    await deleteApp(getApp());
  }
}

main().catch(err => {
  console.error('Cart robot failed:', err.message);
  process.exit(1);
});
