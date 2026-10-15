// Late-prices alert: if the morning check hasn't refreshed the prices by
// 10 AM Virginia time, ask the app's site to email a warning (once a day).
//
// Needs FIREBASE_KEY. REPORT_SITE is the Netlify site with the email function.

import { deleteApp, getApp } from 'firebase-admin/app';
import { initFirebase, log } from './portal.mjs';
import { vaDate } from './history.mjs';

const SITE = process.env.REPORT_SITE || 'https://deploy-preview-1--picksheet.netlify.app';

async function main() {
  const db = initFirebase();
  const today = vaDate();
  const checkedAt = (await db.ref('prices/checkedAt').get()).val();
  const sent = (await db.ref(`price-alerts/${today}`).get()).exists();
  if (checkedAt && vaDate(checkedAt) === today) log(`Prices were checked today (${checkedAt}). No alert.`);
  else if (sent) log('Alert already sent today.');
  else {
    await db.ref(`price-alerts/${today}`).set({ createdAt: new Date().toISOString(), lastChecked: checkedAt || null });
    await deleteApp(getApp());
    const res = await fetch(`${SITE}/.netlify/functions/price-alert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: today })
    });
    log(`Alert email: ${res.status} ${(await res.text()).slice(0, 200)}`);
    if (!res.ok) throw new Error('The alert email was not sent.');
    return;
  }
  await deleteApp(getApp());
}

main().catch(err => {
  console.error('Price alert failed:', err.message);
  process.exit(1);
});
