// Upload database.rules.json to Firebase using the service-account key.
// Run by the "Update database rules" step when the rules file changes.
import { cert } from 'firebase-admin/app';
import fs from 'node:fs';

const DATABASE_URL = 'https://picksheet-8b2a0-default-rtdb.firebaseio.com';
const rules = fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
JSON.parse(rules);   // stop on a typo before uploading
const { access_token } = await cert(JSON.parse(process.env.FIREBASE_KEY)).getAccessToken();
const res = await fetch(`${DATABASE_URL}/.settings/rules.json`, {
  method: 'PUT', headers: { Authorization: `Bearer ${access_token}` }, body: rules
});
console.log('Rules upload:', res.status, await res.text());
if (!res.ok) process.exit(1);
