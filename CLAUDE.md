# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"FS Weekly Order": the weekly ordering app for Highland Roots Market (Virginia). Staff walk the store on a phone, pick case counts from a shared product list, and tap Send. The order is emailed and a robot loads it into the store's two Four Seasons Produce carts (customer.fsproduce.com). A daily robot also pulls current prices into the app, and a Monday email lists price changes so the store can update its register prices.

Live site: https://picksheet.netlify.app (Setup page at `#setup`). Netlify auto-deploys `main` to production and gives each PR a preview URL. **Pushing to `main` changes what the store uses that week**, so ship changes through a PR the owner has approved.

README.md, QUICK-REFERENCE.md, CONTRIBUTING.md and DEPLOY.md mostly describe the old single-file app (Gmail CSV paste, 3 pages). Trust the code over them.

## Commands

There is no build step and no linter. The app is plain HTML/JS served as-is.

```bash
cd pricecheck && npm install                    # firebase-admin + playwright (only needed for the robots)
cd pricecheck && node --test                    # unit tests (pure, offline, no install needed)
cd pricecheck && node --test parse.test.mjs     # one test file
cd pricecheck && node --test --test-name-pattern="<test name>" parse.test.mjs   # one test
```

To view the app locally, serve the repo root (e.g. `python3 -m http.server`) and open `index.html`. It talks to the real Firebase database, so saving on Setup changes the live product list.

The robots (`check.mjs`, `robot.mjs`) need `FS_EMAIL`, `FS_PASSWORD`, `FIREBASE_KEY` and sign in to the real portal; they normally run only in GitHub Actions. Useful env switches: `DRY_RUN=1` (look, don't save/import), `ONLY=Apples,Grapes` (test a few items, never saves), `KEYS=` (check only these rows and save them), `SHOTS_DIR=shots` (screenshots on problems).

## Architecture

Three parts share one Firebase Realtime Database (project `picksheet-8b2a0`; rules in `database.rules.json`, deployed by the `db-rules.yml` workflow on push to main).

1. **Phone app** (`index.html`, `sw.js`, `manifest.json`). One file, vanilla JS, Firebase compat SDK from gstatic. Views: `order`, `setup`, `sent`. Reads/writes `products` (the shared product list), reads `prices` (written only by the price check), writes new `orders/{id}` (write-once). **Bump `CACHE` in `sw.js` when you change the app**, or phones keep the old version.

2. **Netlify functions** (`netlify/functions`, shared code in `netlify/lib`). Need `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GITHUB_TOKEN` in Netlify's environment.
   - `send-order`: phone calls it after saving an order. Emails it (tables + two CSVs) and starts the `cart-robot.yml` workflow.
   - `check-now`: Setup's "Check now". Starts `price-check.yml` for changed rows.
   - `order-report`: the cart robot calls it at the end. Sends the "Carts loaded" / "Cart problem" email.
   - `price-report`: `report.mjs` calls it on Mondays. Sends the price-changes email.
   - `morning`: Netlify timer every 30 min. 6:30–9:30 AM Virginia time it starts the price check if today's prices aren't in; at 10 AM it emails a warning if they still aren't. (GitHub's cron is unreliable, so this is the real trigger; the workflow's own cron is a backup.)
   Functions only act on fresh records (recent `createdAt`/report time) so they can't be replayed.

3. **Portal robots** (`pricecheck/`, Node + Playwright, run by GitHub Actions; both workflows share the `four-seasons-portal` concurrency group because the portal allows **only one sign-in per login**).
   - `portal.mjs`: shared sign-in/out, account switching, search, item pages. Sign-out must click the real Sign Out link and confirm the login page, or the owner gets "already logged in".
   - `check.mjs` (`price-check.yml`): looks up every product's options and prices, writes `/prices`, saves a dated snapshot via `history.mjs` to `/price-history`. If most of an account comes back empty it re-signs-in and retries, then keeps the last good prices and marks the refresh failed (Four Seasons often hides Produce before ~6:30 AM).
   - `robot.mjs` (`cart-robot.yml`): for each account, Import Order CSV → Add All to Cart, waiting for every line; signs out and back in between accounts (the import table persists per sign-in). Writes progress to `orders/{id}/robot` (the phone shows it live). Retries every 5 min for up to 30 min if the portal doesn't answer. **Never submits carts** and never treats items already in the cart as duplicates.
   - `parse.mjs` / `report-data.mjs`: pure logic (row parsing, $/lb from pack size, Monday report data), covered by the `*.test.mjs` files. Keep portal-independent logic here so it stays testable.

## Domain facts the code relies on

- Accounts: Produce = 94273, Meat & Dairy = 94274. Meat & Dairy prices show $0.00 unless that account is selected.
- The portal's unit price is per piece in the case, not per pound; $/lb is computed from the pack size in the description.
- All times are Virginia time (`America/New_York`).

## Working with the owner

The owner (andrew) is not a coder: write user-facing text, emails and commit/PR descriptions in plain language. He wants changes read back and confirmed (often with a mockup) before they are built.
