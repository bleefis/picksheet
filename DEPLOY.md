# Deployment Guide — Netlify Continuous Deployment

The app auto-deploys from GitHub. Every push to `main` goes live, and every
pull request gets its own preview URL for testing. No manual uploads.

---

## One-time setup

### 1. Push the project to GitHub (if not done yet)

```powershell
git add index.html sw.js manifest.json icon-192.png icon-512.png netlify.toml
git commit -m "Update app"
git push origin main
```

Required files in the repo root: `index.html`, `sw.js`, `manifest.json`,
`icon-192.png`, `icon-512.png`, `netlify.toml`.

### 2. Connect Netlify to the repo

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. **Connect to Git provider → GitHub** (authorize Netlify once), pick `bleefis/picksheet`
3. Build settings:
   - **Build command:** *(leave empty — no build step)*
   - **Publish directory:** `.`
4. Click **Deploy**. Netlify reads `netlify.toml` for cache headers automatically.
5. Your live URL: `https://<your-site-name>.netlify.app`

### 3. Add to Android home screen

1. Open the Netlify URL in Chrome on the phone
2. **⋮ menu → Add to Home screen → Add**

---

## Turn on the shared item list (one time, about 10 minutes)

The item list is saved in a free Google Firebase database so every phone
sees the same list. Until this is done, each phone keeps its own list.

1. Go to [console.firebase.google.com](https://console.firebase.google.com),
   sign in with the store's Google account, click **Create a project**, and
   name it `picksheet`. Google Analytics can be turned off.
2. In the left menu open **Build → Realtime Database → Create Database**.
   Pick the United States location and **Start in locked mode**.
3. Open the **Rules** tab, replace everything with the contents of
   `database.rules.json` from this repo, and click **Publish**.
4. Click the gear → **Project settings** → **Your apps** → the web icon
   (`</>`). Name it `picksheet` and click **Register app**.
5. Copy the `firebaseConfig` block it shows and send it to Claude (or paste
   it over `FIREBASE_CONFIG` in `index.html`). These values are meant to be
   public, so they are safe to put in the app.

The first phone that opens the updated app uploads its list. After that,
saving in ⚙ settings on any phone updates every phone.

---

## Everyday workflow (automatic)

```
edit files → git commit → git push → Netlify builds → live in ~30-60s
```

- **Production:** pushes to `main` deploy to the main URL automatically.
- **Testing:** open a pull request — Netlify posts a **Deploy Preview** link
  (e.g. `https://deploy-preview-3--<site>.netlify.app`) in the PR. Open that
  on the phone to test before merging.
- **Rollback:** Netlify dashboard → **Deploys** → pick any previous deploy →
  **Publish deploy**. Instant revert, no git needed.

---

## Migrating the old drag-and-drop site

If you previously deployed via manual drag-and-drop (`lucky-kashata-....netlify.app`):

1. Do the "Connect Netlify to the repo" steps above (creates a new site).
2. Optional: **Site settings → Domain management → Add custom domain** to reuse
   a memorable name, or just switch the phone's home-screen icon to the new URL.
3. On the phone: remove the old icon, add the new URL to the home screen.
4. **Important:** quantities/config live in browser localStorage per domain.
   Export a config backup (gear → Backup config) from the old app first, then
   Restore it in the new one.

---

## Troubleshooting

**"Page not found" on deploy**
→ Check Publish directory is `.` and `index.html` is in the repo root.

**"Phones still show the old version"**
→ `netlify.toml` already sets `sw.js`/`index.html` to no-cache. On the phone:
close the app fully and reopen; service worker `order-pwa-v3` replaces itself
on next load.

**"Preview works but production doesn't"**
→ Make sure you merged the PR into `main` — previews deploy the PR branch only.

**"Build failed" emails from Netlify**
→ There's no build command, so failures are rare. Check the deploy log —
usually a missing file (e.g. icons not committed).
