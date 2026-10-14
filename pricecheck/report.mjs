// Monday price report: compares today's prices with last week's and asks the
// app's site to email the result (the site holds the Gmail password).
//
// Needs FIREBASE_KEY. REPORT_SITE is the Netlify site with the email function.

import { deleteApp, getApp } from 'firebase-admin/app';
import { initFirebase, log } from './portal.mjs';
import { saveSnapshot } from './history.mjs';
import { buildReport } from './report-data.mjs';

const env = process.env;
const SITE = env.REPORT_SITE || 'https://deploy-preview-1--picksheet.netlify.app';

async function main() {
  const db = initFirebase();
  const read = async path => (await db.ref(path).get()).val();
  const prices = await read('prices');
  if (!prices || !prices.products) throw new Error('No prices saved yet.');
  // Make sure today's prices are in the history too (covers prices from "Check now").
  await saveSnapshot(db, prices, { onlyIfMissing: true });

  const report = buildReport({ prices, products: await read('products'), history: await read('price-history'), orders: await read('orders') });
  log(`Report ${report.date}: compared with ${report.baselineDate || 'nothing yet'}; ${report.items.length} item # products (${report.up} up, ${report.down} down); ${report.ordered.length} ordered lines; ${report.missing} not available`);
  await db.ref(`price-reports/${report.date}`).set(report);
  await deleteApp(getApp());

  const res = await fetch(`${SITE}/.netlify/functions/price-report`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: report.date })
  });
  log(`Report email: ${res.status} ${(await res.text()).slice(0, 200)}`);
  if (!res.ok) throw new Error('The report email was not sent.');
}

main().catch(err => {
  console.error('Price report failed:', err.message);
  process.exit(1);
});
