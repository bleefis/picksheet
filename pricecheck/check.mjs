// Daily Four Seasons price check.
//
// Reads the shared item list from Firebase, signs in to the Four Seasons
// portal, looks up this week's options and prices for every item, and
// saves the results to Firebase under /prices for the phone app to show.
//
// Needs these environment variables (GitHub secrets in the workflow):
//   FS_EMAIL, FS_PASSWORD   Four Seasons portal login
//   FIREBASE_KEY            Firebase service-account key (the whole JSON)
// Optional:
//   DRY_RUN=1               look up prices but don't save them
//   ONLY=Apples,Grapes      check just these item names (for testing; never saves)
//   KEYS=k1,k2              check just these product rows and save only them ("Check now")
//   SHOTS_DIR=shots         save a screenshot when something goes wrong

import { chromium } from 'playwright';
import { deleteApp, getApp } from 'firebase-admin/app';
import { buildOptions } from './parse.mjs';
import { saveSnapshot } from './history.mjs';
import { ACCOUNTS, log, shot, initFirebase, signIn, signOut, switchAccount, search, obsoleteInfo, findItem } from './portal.mjs';

const env = process.env;
const ONLY = (env.ONLY || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const KEYS = (env.KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
const DRY_RUN = !!env.DRY_RUN || ONLY.length > 0;   // a test check never saves

// ── Main ───────────────────────────────────────────────────
const isItemNo = s => /^\d+$/.test(String(s || '').trim());

async function main() {
  for (const k of ['FS_EMAIL', 'FS_PASSWORD', 'FIREBASE_KEY']) {
    if (!env[k]) throw new Error(`Missing ${k}. Add it under GitHub → Settings → Secrets → Actions.`);
  }
  const db = initFirebase();
  let table = (await db.ref('products').get()).val();
  if (!table || !Array.isArray(table.items)) {
    table = { items: buildFromOldList((await db.ref('order-config').get()).val()), updatedAt: new Date().toISOString() };
    if (!table.items.length) throw new Error('No product list in Firebase yet. Open the app once so it uploads its list.');
    log(`No product table yet; built ${table.items.length} rows from the old list`);
    if (!DRY_RUN) await db.ref('products').set(table);
  }

  const all = table.items.map((p, index) => p && ({ ...p, index })).filter(p => p && p.key && String(p.lookup || '').trim());
  const todo = all.filter(p => (!KEYS.length || KEYS.includes(p.key)) && (!ONLY.length || ONLY.includes(String(p.name).trim().toLowerCase())));
  const partial = KEYS.length > 0;
  log(`${todo.length} of ${all.length} products to check${partial ? ' (Check now)' : ''}`);
  if (!DRY_RUN) await db.ref('prices/running').set({ startedAt: new Date().toISOString(), keys: partial ? KEYS : 'all' });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const entries = {};
  const swaps = [];       // automatic replacements to save into the product table
  const problems = [];
  let done = 0;
  // A result that found nothing. When most of an account comes back like this,
  // Four Seasons wasn't showing that account's catalog (seen at 5 AM on Oct 16:
  // every Produce search was empty while Meat & Dairy was fine).
  const blank = e => !!e && (e.status === 'not-found' || (Array.isArray(e.options) && !e.found));
  const failedAccounts = [];

  try {
    await signIn(page);
    for (const account of ['produce', 'meat']) {
      const mine = todo.filter(p => (p.account === 'meat' ? 'meat' : 'produce') === account);
      if (!mine.length) continue;
      await switchAccount(page, ACCOUNTS[account]);
      const checkAll = async () => { for (const p of mine) {
        // Progress for the phone ("34 of 118"); not waited on, so it never slows the check.
        if (!DRY_RUN) db.ref('prices/running').update({ done: done++, total: todo.length, at: new Date().toISOString() }).catch(() => {});
        const lookup = String(p.lookup).trim();
        try {
          if (isItemNo(lookup)) {
            const hit = await findItem(page, lookup);
            if (hit) {
              entries[p.key] = { lookup, id: lookup, status: 'ok', description: hit.description, casePrice: hit.casePrice, onAd: hit.onAd };
              log(`${p.name || lookup} #${lookup}: ok`);
              continue;
            }
            const info = await obsoleteInfo(page, lookup);
            const entry = { lookup, id: lookup, status: info.obsolete ? 'obsolete' : 'not-found', description: info.name };
            // Take Four Seasons' first replacement that this account can order, unless it was undone before.
            if (info.obsolete && p.keepOld !== lookup) {
              for (const code of info.replacements) {
                const rep = await findItem(page, code);
                if (!rep) continue;
                swaps.push({ index: p.index, key: p.key, from: lookup, to: code });
                entries[p.key] = { lookup: code, id: code, status: 'ok', description: rep.description, casePrice: rep.casePrice, onAd: rep.onAd, replacedFrom: lookup };
                log(`${p.name || lookup}: replaced #${lookup} with #${code} (${rep.description})`);
                break;
              }
            }
            if (!entries[p.key]) {
              entries[p.key] = entry;
              log(`${p.name || lookup} #${lookup}: ${entry.status}`);
            }
          } else {
            const rows = await search(page, lookup);
            entries[p.key] = { lookup, found: rows.length, options: buildOptions(rows, p.exclude) };
            log(`${p.name}: ${entries[p.key].options.length} options (${rows.length} found for "${lookup}")`);
          }
        } catch (e) {
          problems.push(`${p.name || lookup}: ${e.message.slice(0, 200)}`);
          log(`${p.name || lookup}: ERROR ${e.message.slice(0, 200)}`);
          await shot(page, `error-${p.key}`);
        }
      } };
      await checkAll();
      const emptyCount = () => mine.filter(p => blank(entries[p.key])).length;
      const empty = () => mine.length >= 5 && emptyCount() / mine.length >= 0.6;
      if (empty()) {
        log(`${account}: ${emptyCount()} of ${mine.length} came back empty; signing in again and retrying once`);
        await signOut(page).catch(() => {});
        await signIn(page);
        await switchAccount(page, ACCOUNTS[account], true);
        done = Math.max(0, done - mine.length);
        for (let i = swaps.length - 1; i >= 0; i--) if (mine.some(p => p.key === swaps[i].key)) swaps.splice(i, 1);
        await checkAll();
      }
      if (empty()) {
        log(`${account}: still ${emptyCount()} of ${mine.length} empty; keeping the last good prices for these rows`);
        failedAccounts.push(account);
        for (const p of mine) delete entries[p.key];
        for (let i = swaps.length - 1; i >= 0; i--) if (mine.some(p => p.key === swaps[i].key)) swaps.splice(i, 1);
        problems.push(`${account === 'meat' ? 'Meat & Dairy' : 'Produce'} prices came back empty from Four Seasons`);
      }
    }
  } catch (e) {
    await shot(page, 'failed');
    // Tell the app the check failed, so the Setup page can say so.
    if (!DRY_RUN) await db.ref('prices').update({ running: null, failed: { at: new Date().toISOString(), noResponse: /timeout|net::|chrome-error/i.test(e.message) } }).catch(() => {});
    throw e;
  } finally {
    await signOut(page).catch(e => log(`Sign out failed: ${e.message}`));
    await browser.close();
  }

  const counted = Object.keys(entries).length;
  log(`Checked ${counted} products, ${swaps.length} replaced, ${problems.length} problems`);
  if (DRY_RUN) {
    console.log(JSON.stringify(entries, null, 1).slice(0, 20000));
    log('Dry run: not saving.');
  } else {
    // Save replacements into the product table, row by row, only if the row is unchanged since we read it.
    // Remember which account each row was checked under, so the app knows to re-check it after a switch.
    const acct = Object.fromEntries(todo.map(p => [p.key, p.account === 'meat' ? 'meat' : 'produce']));
    for (const [k, v] of Object.entries(entries)) v.account = acct[k];
    const at = new Date().toISOString();
    for (const s of swaps) {
      const ref = db.ref(`products/items/${s.index}`);
      const now = (await ref.get()).val();
      if (!now || now.key !== s.key || String(now.lookup).trim() !== s.from) { log(`Row ${s.key} changed meanwhile; not replacing`); delete entries[s.key]; continue; }
      await ref.update({ lookup: s.to, replaced: { from: s.from, at } });
    }
    const failed = failedAccounts.length ? { at: new Date(Date.now() + 1000).toISOString(), noResponse: false, accounts: failedAccounts } : null;
    if (partial) {
      const updates = {};
      for (const [k, v] of Object.entries(entries)) updates[`products/${k}`] = v;
      updates.running = null;
      updates.failed = failed;
      await db.ref('prices').update(updates);
    } else if (failed) {
      // Keep the last good prices for the empty account and leave checkedAt alone,
      // so the morning timer tries again in half an hour and the app says so.
      const old = (await db.ref('prices').get()).val() || {};
      const keep = Object.fromEntries(Object.entries(old.products || {}).filter(([k]) => !(k in entries)));
      await db.ref('prices').set({ checkedAt: old.checkedAt || null, products: { ...keep, ...entries }, problems, failed });
      log(`Saved what came back; kept ${Object.keys(keep).length} earlier prices for ${failedAccounts.join(', ')}`);
    } else {
      const saved = { checkedAt: new Date().toISOString(), products: entries, problems };
      await db.ref('prices').set(saved);
      // Keep a dated copy for the Monday price report.
      log(`Saved price history for ${await saveSnapshot(db, saved)}`);
    }
    log('Saved to Firebase /prices');
  }
  await deleteApp(getApp());
  if (counted === 0 && todo.length) throw new Error('Nothing was checked.');
  if (failedAccounts.length) throw new Error(`${failedAccounts.join(', ')} came back empty from Four Seasons; kept the earlier prices.`);
}

// ── Old three-page list → product table (same rules as the app) ──
function buildFromOldList(old) {
  const items = (old && old.items) || {};
  const out = [];
  let n = 0;
  [['seasonal', 'produce'], ['produce', 'produce'], ['meat', 'meat']].forEach(([sec, account]) => {
    (items[sec] || []).filter(i => i && i.name).forEach(i => {
      const weekly = typeof i.weekly === 'boolean' ? i.weekly : sec === 'seasonal';
      out.push({
        key: 'p' + Date.now().toString(36) + (n++).toString(36).padStart(3, '0'),
        name: i.name.trim(),
        lookup: weekly || !i.id ? (i.lookup || 'OG ' + i.name.trim()) : String(i.id).trim(),
        account,
        exclude: weekly ? (i.exclude || '') : '',
        hidden: false
      });
    });
  });
  return out;
}

main().catch(err => {
  console.error('Price check failed:', err.message);
  process.exit(1);
});
