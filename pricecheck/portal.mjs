// Four Seasons portal steps shared by the price check and the cart robot:
// signing in and out, switching account, searching, and reading item pages.

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import fs from 'node:fs';
import { parseRow } from './parse.mjs';

export const PORTAL       = 'https://customer.fsproduce.com';
export const DATABASE_URL = 'https://picksheet-8b2a0-default-rtdb.firebaseio.com';
export const ACCOUNTS     = { produce: '94273', meat: '94274' };   // Produce / Meat & Dairy
// The portal sometimes names the account without its number; Meat & Dairy ends in "M/D".
const isOn = (text, number) => text.includes(number) ||
  (number === ACCOUNTS.meat ? /M\/D/.test(text) : /Highland Roots/i.test(text) && !/M\/D/.test(text));
const MAX_PAGES    = 8;
const env = process.env;
const SHOTS_DIR = env.SHOTS_DIR || '';

export function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

export async function shot(page, name) {
  if (!SHOTS_DIR) return;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage: true }).catch(() => {});
}

// ── Firebase ───────────────────────────────────────────────
export function initFirebase() {
  const key = JSON.parse(env.FIREBASE_KEY);
  const app = initializeApp({ credential: cert(key), databaseURL: DATABASE_URL });
  return getDatabase(app);
}

// ── Portal ─────────────────────────────────────────────────
export async function signIn(page) {
  // The portal is sometimes slow to answer, or shows something other than the
  // login form right after a sign-out; give it a few tries.
  const emailBox = page.locator('input[type="email"], input[name*="mail" i], input[id*="mail" i]').first();
  for (let tries = 1; ; tries++) {
    try {
      await page.goto(`${PORTAL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await emailBox.waitFor({ timeout: 20000 });
      break;
    } catch (e) {
      const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
      log(`Login form not showing (try ${tries}) at ${page.url()}: ${text.slice(0, 300)}`);
      if (tries >= 3) { await shot(page, 'login-form-missing'); throw e; }
      await page.context().clearCookies();
      await page.waitForTimeout(10000);
    }
  }
  await emailBox.fill(env.FS_EMAIL);
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
export async function signOut(page) {
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .filter(a => /log.?out|sign.?out|log.?off/i.test(a.href + ' ' + a.textContent))
    .map(a => a.href)).catch(() => []);
  log(`Sign out links: ${links.join(' | ') || 'none found'}`);
  await page.goto(links[0] || `${PORTAL}/logout`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  log(`Signed out (now at ${new URL(page.url()).pathname})`);
}

/** The "You are working on behalf of" box text, used to confirm the account. */
export async function currentAccountText(page) {
  return page.locator('text=/working on behalf of/i').first()
    .locator('xpath=ancestor-or-self::*[self::div or self::section][1]')
    .innerText({ timeout: 5000 }).catch(() => '');
}

/** Switch to a customer number using the Ship To list. */
export async function switchAccount(page, number) {
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
export async function readRows(page) {
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
export async function search(page, words) {
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

/**
 * An item # that search can't find: open its own page. Four Seasons shows
 * "This item is obsolete! Check Replacements" there, and the replacements
 * page lists suggested item #s in Four Seasons' order.
 */
export async function obsoleteInfo(page, code) {
  await page.goto(`${PORTAL}/catalogs/item-content/${code}/x/pr_${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const name = (text.match(new RegExp(`SAVED CARTS (.+?) ${code}\\b`)) || [])[1] || '';
  if (!/obsolete/i.test(text)) return { obsolete: false, name };
  // Load the replacements page fresh: clicking the link can show a previous item's list.
  await page.goto(`${PORTAL}/catalogs/item-content/Replacements/1/${code}/x/pr_${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const forThis = new RegExp(`Replacements for: .*\\b${code}\\b`).test(body);
  const codes = forThis ? await page.evaluate(own => {
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href*="/item-content/"]')) {
      const m = a.href.match(/item-content\/(\d+)\//);
      if (m && m[1] !== own) seen.add(m[1]);
    }
    return [...seen];
  }, code) : [];
  log(`  #${code} is obsolete (${name}). Replacements: ${codes.join(', ') || 'none'}${forThis ? '' : ' (page did not load)'}`);
  return { obsolete: true, name, replacements: codes };
}

/** Look up one item # in the account that's switched on. */
export async function findItem(page, code) {
  const rows = await search(page, code);
  return rows.find(r => r.code === String(code).trim()) || null;
}

