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
//   SHOTS_DIR=shots         save a screenshot when something goes wrong

import { chromium } from 'playwright';
import { initializeApp, cert, deleteApp, getApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import fs from 'node:fs';
import { parseRow, buildOptions, lookupFor } from './parse.mjs';

const PORTAL       = 'https://customer.fsproduce.com';
const DATABASE_URL = 'https://picksheet-8b2a0-default-rtdb.firebaseio.com';
const ACCOUNTS     = { produce: '94273', meat: '94274' };   // Produce / Meat & Dairy
// The portal sometimes names the account without its number; Meat & Dairy ends in "M/D".
const isOn = (text, number) => text.includes(number) ||
  (number === ACCOUNTS.meat ? /M\/D/.test(text) : /Highland Roots/i.test(text) && !/M\/D/.test(text));
const SECTION_ACCOUNT = { seasonal: 'produce', produce: 'produce', meat: 'meat' };
const MAX_PAGES    = 8;

const env = process.env;
const ONLY = (env.ONLY || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const DRY_RUN = !!env.DRY_RUN || ONLY.length > 0;   // a partial check must never replace the full price list
const SHOTS_DIR = env.SHOTS_DIR || '';

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

async function shot(page, name) {
  if (!SHOTS_DIR) return;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage: true }).catch(() => {});
}

// ── Firebase ───────────────────────────────────────────────
function initFirebase() {
  const key = JSON.parse(env.FIREBASE_KEY);
  const app = initializeApp({ credential: cert(key), databaseURL: DATABASE_URL });
  return getDatabase(app);
}

// ── Portal ─────────────────────────────────────────────────
async function signIn(page) {
  await page.goto(`${PORTAL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="mail" i], input[id*="mail" i]').first().fill(env.FS_EMAIL);
  await page.locator('input[type="password"]').first().fill(env.FS_PASSWORD);
  await page.getByRole('button', { name: /next|sign in|log in/i }).first().click();
  await page.waitForURL(u => !/\/login\/?$/i.test(u.pathname), { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // The portal allows one session per login. If one is still open it asks first.
  if (/UserAlreadyLoggedIn/i.test(page.url())) {
    const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
    log(`Portal says already signed in: ${text.slice(0, 400)}`);
    const go = page.locator('a, button, input[type=submit], input[type=button]')
      .filter({ hasText: /continue|yes|proceed|log ?in|sign ?in|ok/i });
    log(`Buttons on that page: ${(await page.locator('a, button, input[type=submit]').allInnerTexts().catch(() => [])).map(t => t.trim()).filter(Boolean).join(' | ').slice(0, 400)}`);
    if (await go.count()) {
      await go.first().click();
      await page.waitForURL(u => !/login/i.test(u.pathname), { timeout: 30000 });
    } else {
      await shot(page, 'already-signed-in');
      throw new Error('Portal says this login is already signed in somewhere else.');
    }
  }
  log('Signed in');
}

/** Sign out so the next run (or andrew) isn't blocked by an open session. */
async function signOut(page) {
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .filter(a => /log.?out|sign.?out|log.?off/i.test(a.href + ' ' + a.textContent))
    .map(a => a.href));
  log(`Sign out links: ${links.join(' | ') || 'none found'}`);
  await page.goto(links[0] || `${PORTAL}/logout`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  log(`Signed out (now at ${new URL(page.url()).pathname})`);
}

/** The "You are working on behalf of" box text, used to confirm the account. */
async function currentAccountText(page) {
  return page.locator('text=/working on behalf of/i').first()
    .locator('xpath=ancestor-or-self::*[self::div or self::section][1]')
    .innerText({ timeout: 5000 }).catch(() => '');
}

/** Switch to a customer number using the Ship To list. */
async function switchAccount(page, number) {
  const listUrl = `${PORTAL}/secure/account/sales-person`;
  await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (isOn(await currentAccountText(page), number)) { log(`Already on ${number}`); return; }

  // Each row in the Ship To table opens a "Change Ship To" box when clicked.
  const row = page.locator('tr', { has: page.locator(`td:text-is("${number}")`) }).first();
  log(`Ship To row for ${number}: ${(await row.innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 120)}`);
  await row.click();
  const box = page.locator('.modal:visible, [role=dialog]:visible').last();
  await box.waitFor({ timeout: 15000 }).catch(() => {});
  const boxText = (await box.innerText().catch(() => '')).replace(/\s+/g, ' ');
  const boxButtons = box.locator('a, button, input[type=submit], input[type=button]');
  log(`Change Ship To box: ${boxText.slice(0, 400)}`);
  log(`Its buttons: ${(await boxButtons.allInnerTexts().catch(() => [])).map(t => t.trim()).filter(Boolean).join(' | ')}`);
  // Never merge carts between the two accounts: make sure "Merge your current items" is off.
  const merge = box.locator('input[type=checkbox]');
  for (let i = 0; i < await merge.count(); i++) {
    if (await merge.nth(i).isChecked().catch(() => false)) await merge.nth(i).uncheck({ force: true });
  }
  log(`Merge box ticked: ${await merge.first().isChecked().catch(() => 'no box')}`);
  const go = boxButtons.filter({ hasText: /^\s*continue\s*$/i });
  if (!(await go.count())) throw new Error(`No Continue button in the Change Ship To box.`);
  await Promise.all([
    page.waitForNavigation({ timeout: 20000 }).catch(() => {}),
    go.first().click()
  ]);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  log(`After Continue: ${new URL(page.url()).pathname}`);

  await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
  const now = await currentAccountText(page);
  if (!isOn(now, number)) {
    await shot(page, `switch-${number}`);
    throw new Error(`Could not switch to customer ${number}. The page says: ${now.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  log(`Switched to ${number}`);
}

/** Read every product row on the current results page. */
async function readRows(page) {
  const texts = await page.evaluate(() => {
    const out = [];
    const buttons = [...document.querySelectorAll('button, a, input[type=button], input[type=submit]')]
      .filter(b => /add to cart/i.test(b.innerText || b.value || ''));
    for (const b of buttons) {
      // Walk up to the element that holds the whole row (code + price).
      let el = b;
      while (el && el.parentElement) {
        el = el.parentElement;
        const t = el.innerText || '';
        if (/\b\d{3,7}\b/.test(t) && /\d\.\d{2}\s*\/\s*\d/.test(t)) break;
      }
      const isAd = !!el.querySelector('img[alt="AD" i], [title="AD" i]');
      out.push((el.innerText || '') + (isAd ? ' AD' : ''));
    }
    return out;
  });
  return texts.map(parseRow).filter(Boolean);
}

/** All results for a search, following pages until no new items appear. */
async function search(page, words) {
  const all = new Map();
  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = `${PORTAL}/catalogs/search-results/${p}/?searchMode=All&searchCriteria=${encodeURIComponent(words)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const rows = await readRows(page);
    const fresh = rows.filter(r => !all.has(r.code));
    fresh.forEach(r => all.set(r.code, r));
    if (fresh.length === 0) break;
  }
  return [...all.values()];
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  for (const k of ['FS_EMAIL', 'FS_PASSWORD', 'FIREBASE_KEY']) {
    if (!env[k]) throw new Error(`Missing ${k}. Add it under GitHub → Settings → Secrets → Actions.`);
  }
  const db = initFirebase();
  const config = (await db.ref('order-config').get()).val();
  if (!config || !config.items) throw new Error('No item list in Firebase yet. Open the app once so it uploads its list.');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const result = { checkedAt: new Date().toISOString(), sections: {}, problems: [] };

  try {
    await signIn(page);
    for (const account of ['produce', 'meat']) {
      const sections = Object.keys(SECTION_ACCOUNT).filter(s => SECTION_ACCOUNT[s] === account);
      const items = sections.flatMap(sec => (config.items[sec] || []).map((it, i) => ({ sec, i, it })))
        .filter(({ it }) => it && it.name && (!ONLY.length || ONLY.includes(it.name.trim().toLowerCase())));
      if (!items.length) continue;

      await switchAccount(page, ACCOUNTS[account]);
      for (const { sec, i, it } of items) {
        result.sections[sec] = result.sections[sec] || [];
        const entry = { name: it.name, weekly: !!it.weekly };
        try {
          if (it.weekly) {
            const words = lookupFor(it);
            const rows = await search(page, words);
            entry.lookup  = words;
            entry.found   = rows.length;
            entry.options = buildOptions(rows, it.exclude);
            log(`${it.name}: ${entry.options.length} options (${rows.length} found for "${words}")`);
          } else if (it.id) {
            const rows = await search(page, it.id);
            const match = rows.find(r => r.code === String(it.id).trim());
            entry.id = it.id;
            entry.status = match ? 'ok' : 'not-found';
            if (match) Object.assign(entry, { description: match.description, casePrice: match.casePrice, onAd: match.onAd });
            log(`${it.name} #${it.id}: ${entry.status}`);
          }
        } catch (e) {
          entry.error = e.message.slice(0, 200);
          result.problems.push(`${it.name}: ${entry.error}`);
          log(`${it.name}: ERROR ${entry.error}`);
          await shot(page, `error-${sec}-${i}`);
        }
        result.sections[sec][i] = entry;
      }
    }
  } catch (e) {
    await shot(page, 'failed');
    throw e;
  } finally {
    await signOut(page).catch(e => log(`Sign out failed: ${e.message}`));
    await browser.close();
  }

  // Firebase can't store sparse arrays cleanly; fill gaps left by ONLY.
  for (const sec of Object.keys(result.sections)) {
    result.sections[sec] = Array.from(result.sections[sec], e => e || null);
  }

  const counted = Object.values(result.sections).flat().filter(Boolean).length;
  log(`Checked ${counted} items, ${result.problems.length} problems`);
  if (DRY_RUN) {
    console.log(JSON.stringify(result.sections, null, 1).slice(0, 20000));
    log('Dry run: not saving.');
  } else {
    await db.ref('prices').set(result);
    log('Saved to Firebase /prices');
  }
  await deleteApp(getApp());
  if (counted === 0) throw new Error('Nothing was checked.');
}

main().catch(err => {
  console.error('Price check failed:', err.message);
  process.exit(1);
});
