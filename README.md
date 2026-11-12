# FS Weekly Order

The weekly ordering app for **Highland Roots Market**. Walk the store with a phone, tap how many cases you want, and tap **Send**. The app emails the order and loads it into both Four Seasons carts for you.

**App:** [picksheet.netlify.app](https://picksheet.netlify.app) · **Setup:** [picksheet.netlify.app/#setup](https://picksheet.netlify.app/#setup)

---

## What it does

| Part | What happens |
|---|---|
| **Order screen** | One list in the order you walk the store, with this week's Four Seasons prices. Products like *OG Apples* open to show every variety, cheapest first. |
| **Send** | Emails the order (with the two CSV files) to highlandrootsmkt@gmail.com and starts the cart robot. |
| **Cart robot** | Loads Produce (94815) and Meat & Dairy (94818) into the carts in about 2 minutes, then emails "Carts loaded" or "Cart problem". **It never submits.** You review and submit on Four Seasons. |
| **Morning prices** | Every morning from 6:30 AM, prices are pulled from Four Seasons. If they still haven't come in by 10 AM, an email says so. |
| **Monday email** | "Four Seasons Price Check" lists only the prices that changed since last week, so you can update register prices. |
| **Setup** | The shared product list. Changes save by themselves and reach every phone. |

---

## Weekly order

1. Open **FS Order** from the home screen.
2. Tap each circle to set cases (1 → 2 → 3 → 4 → back to empty). Hold a circle for about a second to clear it.
3. Tap **Review & send**, check the list, then tap **Send order**.
4. Watch the carts fill, or close the app. The emails arrive either way.
5. Open the **Carts loaded** email, tap **Open Four Seasons to submit**, and submit Produce first, then switch to Meat & Dairy and submit.

Want last week's order again? On an empty order screen, tap **Reload it**.

Items customers ordered midweek can stay in the cart. The robot adds the weekly order alongside them, and the email points out any overlaps.

---

## Setup page

| Column | What it's for |
|---|---|
| **Name on picksheet** | What your team sees |
| **Look up by** | Search words (like *OG Apples*) to see every option each week, or an item # (digits only) for one fixed product |
| **Found on Four Seasons** | What the last check found |
| **Account** | Produce or Meat & Dairy |
| **Leave out words** | Hides options you never want (e.g. *Fuji*) |
| **On phone** | Turn off to hide a row without deleting it |

Drag **⠿** to move a row. After changing **Look up by**, an item #, or the account, tap **Check N changed rows** to get prices now (a few minutes). If Four Seasons replaced an item, the row shows the new one with **Confirm** and **Undo**.

**Download a backup** / **Restore from a backup** sit at the bottom of the page.

---

## When something goes wrong

| You see | What to do |
|---|---|
| **Cart problem** email | Four Seasons' website wasn't answering (the robot tried for 30 minutes). Ask Claude to rerun it, or import the CSVs from the order email by hand. |
| **Prices didn't refresh** email | Usually Four Seasons is slow in the morning. Tap the button to open Setup and try **Refresh all prices**. |
| "You're already logged in" on Four Seasons | The robot was signed in. Wait a minute and try again. Only one sign-in per login works at a time. |
| Phone shows an old version | Close the app fully and reopen it. |

---

## For developers

How it's built, how to run the tests, and how the parts connect: see [CLAUDE.md](CLAUDE.md).
