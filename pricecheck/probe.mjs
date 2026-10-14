// One-off read-only look at the Import Order table and cart controls (clicks nothing that changes data).
import { chromium } from 'playwright';
import { PORTAL, log, signIn, signOut, switchAccount, ACCOUNTS } from './portal.mjs';

async function look(page, label) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const info = await page.evaluate(() => {
    const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const main = document.querySelector('[class*="import"], main, #main') || document.body;
    const ctrls = [...document.querySelectorAll('button, a, input, select, li[ng-click], [ng-click]')]
      .filter(el => !el.closest('header, footer, nav') && /remove|delete|clear|cancel|action|select|add all|update|empty/i.test((el.innerText || el.value || '') + ' ' + (el.getAttribute('ng-click') || '') + ' ' + el.className))
      .map(el => `${vis(el) ? '' : '(hidden) '}<${el.tagName.toLowerCase()} class="${(el.className || '').toString().slice(0, 80)}" ng-click="${(el.getAttribute('ng-click') || '').slice(0, 120)}" href="${(el.getAttribute('href') || '').slice(0, 80)}">${(el.innerText || el.value || '').trim().slice(0, 50)}`);
    return { url: location.href, ctrls: [...new Set(ctrls)].slice(0, 80) };
  });
  log(`\n===== ${label} =====\nURL: ${info.url}\n  ${info.ctrls.join('\n  ')}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
try {
  await signIn(page);
  for (const acct of ['produce', 'meat']) {
    await switchAccount(page, ACCOUNTS[acct]);
    await page.goto(`${PORTAL}/secure/account/import-order`, { waitUntil: 'domcontentloaded' });
    await look(page, `Import page ${acct}`);
    // Open the Actions menus (no choice is clicked) to read their options.
    const menus = page.locator('button.dropdown-toggle:visible, button:visible:has-text("Actions")');
    for (let i = 0; i < Math.min(await menus.count(), 3); i++) {
      await menus.nth(i).click().catch(() => {});
      await page.waitForTimeout(500);
      log(`Menu ${i}: ` + (await page.locator('.dropdown-menu:visible').allInnerTexts().catch(() => [])).map(t => t.replace(/\s+/g, ' ')).join(' || '));
      await page.keyboard.press('Escape');
    }
    await page.goto(`${PORTAL}/shopping-cart`, { waitUntil: 'domcontentloaded' });
    await look(page, `Cart ${acct}`);
  }
} catch (e) { log('Probe failed: ' + e.message); }
finally { await signOut(page).catch(() => {}); await browser.close(); }
