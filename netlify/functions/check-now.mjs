// "Check Four Seasons now" on the setup page: starts the price check for the
// rows that changed (or every row when none did).
import { startWorkflow, json } from '../lib/order.mjs';

export default async req => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { keys } = await req.json().catch(() => ({}));
  const list = (Array.isArray(keys) ? keys : []).filter(k => /^[\w-]{1,40}$/.test(k)).slice(0, 300);
  try {
    await startWorkflow('price-check.yml', { keys: list.join(',') });
    return json({ started: true, rows: list.length || 'all' });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
