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
        .filter(s => !/type="hidden"/.test(s) || /import|order|cart|item/i.test(s)).slice(0, 60),
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
  for (const q of ['43884', '231855', 'OG Grapes Red']) {
    await page.goto(`${PORTAL}/catalogs/search-results/1/?searchMode=All&searchCriteria=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' });
    await dump(page, `Search ${q}`);
  }
  // Open the first product's own page from a search, to see how details/replacements look.
  await page.goto(`${PORTAL}/catalogs/search-results/1/?searchMode=All&searchCriteria=43884`, { waitUntil: 'domcontentloaded' });
  const prod = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href).find(h => /product|item|detail/i.test(h) && /\d{4,}/.test(h)));
  if (prod) { await page.goto(prod, { waitUntil: 'domcontentloaded' }); await dump(page, 'Product page'); }
  await page.goto(`${PORTAL}/secure/account/import-order`, { waitUntil: 'domcontentloaded' });
  await dump(page, 'Import Order page');
  const html = await page.locator('form').evaluateAll(fs => fs.map(f => f.outerHTML.replace(/\s+/g, ' ').slice(0, 3000)));
  log('\nIMPORT FORMS HTML:\n' + html.join('\n---\n'));
  const cartLinks = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /cart/i.test(h)));
  log('Cart links: ' + [...new Set(cartLinks)].join(' | '));
  const cartUrl = cartLinks.find(h => !/add/i.test(h));
  if (cartUrl) { await page.goto(new URL(cartUrl, PORTAL).href, { waitUntil: 'domcontentloaded' }); await dump(page, 'Cart page (Produce)'); }
} catch (e) { log('Probe failed: ' + e.message); }
finally {
  await page.goto(`${PORTAL}/logout`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  log('Signed out');
  await browser.close();
}
