// One-off read-only look at Four Seasons portal pages (no importing, no cart changes).
import { chromium } from 'playwright';
const PORTAL = 'https://customer.fsproduce.com';
const env = process.env;
const log = (...a) => console.log(...a);

async function dump(page, label) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const info = await page.evaluate(() => {
    const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const attrs = el => [...el.attributes].map(a => `${a.name}="${a.value.slice(0, 80)}"`).join(' ');
    return {
      url: location.href,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 2500),
      controls: [...document.querySelectorAll('input, select, textarea, button, form')]
        .map(el => `${vis(el) ? '' : '(hidden) '}<${el.tagName.toLowerCase()} ${attrs(el)}>${el.tagName === 'BUTTON' ? el.innerText.trim().slice(0, 40) : ''}${el.tagName === 'SELECT' ? ' options: ' + [...el.options].map(o => o.value + '=' + o.text).join(', ').slice(0, 200) : ''}`)
        .filter(s => !s.startsWith('(hidden)')).slice(0, 25),
      links: [...document.querySelectorAll('a[href]')].filter(a => /cart|import|replac|obsolete|product|item|clear|remove|delete/i.test(a.href + a.innerText))
        .map(a => `${a.innerText.trim().slice(0, 40)} -> ${a.getAttribute('href').slice(0, 120)}`).slice(0, 50),
      tables: [...document.querySelectorAll('table')].map(t => t.innerText.replace(/\s+/g, ' ').slice(0, 600))
    };
  });
  log(`\n===== ${label} =====\nURL: ${info.url}\nTEXT: ${info.text}\nCONTROLS:\n  ${info.controls.join('\n  ')}\nLINKS:\n  ${info.links.join('\n  ')}\nTABLES:\n  ${info.tables.join('\n  ')}`);
}

async function signIn(page) {
  await page.goto(`${PORTAL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('input[type="email"], input[name*="mail" i], input[id*="mail" i]').first().fill(env.FS_EMAIL);
  await page.locator('input[type="password"]').first().fill(env.FS_PASSWORD);
  await page.getByRole('button', { name: /next|sign in|log in/i }).first().click();
  await page.waitForURL(u => !/\/login\/?$/i.test(u.pathname), { timeout: 30000 });
  if (/UserAlreadyLoggedIn/i.test(page.url())) {
    await page.locator('a, button, input[type=submit]').filter({ hasText: /continue/i }).first().click();
    await page.waitForURL(u => !/login/i.test(u.pathname), { timeout: 30000 });
  }
  log('Signed in');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
try {
  await signIn(page);
  for (const code of ['43884', '231855', '231857', '231858', '236116']) {
    await page.goto(`${PORTAL}/catalogs/item-content/${code}/x/pr_${code}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const el = page.getByText(/check replacements/i).first();
    log(`\n## ${code}: obsolete link html: ` + (await el.evaluate(e => e.parentElement.outerHTML.slice(0, 600)).catch(() => 'none')));
    if (!(await el.count())) { await dump(page, `Item ${code} (no replacement link)`); continue; }
    const before = page.url();
    await el.click().catch(e => log('click failed ' + e.message));
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    log(`URL after click: ${page.url()} (was ${before})`);
    const modal = await page.locator('.modal:visible, [role=dialog]:visible').allInnerTexts().catch(() => []);
    log('Visible boxes: ' + modal.map(t => t.replace(/\s+/g, ' ').slice(0, 1200)).join(' || '));
    await dump(page, `After Check Replacements ${code}`);
  }
} catch (e) { log('Probe failed: ' + e.message); }
finally {
  await page.goto(`${PORTAL}/logout`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  log('Signed out');
  await browser.close();
}
