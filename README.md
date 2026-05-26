# 🛒 Four Seasons Order

A mobile-first Progressive Web App for weekly grocery ordering. Walk the aisles, tap to count cases, email the order. Built for Four Seasons grocery store.

**Live Demo:** https://lucky-kashata-294072.netlify.app  
**Platform:** Android (Chrome) · Desktop compatible  
**Tech Stack:** Vanilla HTML/CSS/JS — no framework, no build step, no backend

---

## ✨ Features

- **📱 Mobile-optimized** — designed for one-handed use while walking store aisles
- **✅ Tap-to-count** — increment quantities with single taps, hold to reset
- **📧 Email export** — order data sent via Gmail (CSV format, plain text)
- **⚙️ Full config editor** — add/edit/reorder items, inline editing, drag handles
- **💾 Backup/restore** — export config as JSON, import on new devices
- **📴 Works offline** — service worker caches all files after first load
- **🏠 Home screen install** — runs full-screen like a native app

---

## 🚀 Quick Start

### Deploy to GitHub Pages (Free)

1. **Fork this repository** (click "Fork" button above)
2. **Enable GitHub Pages:**
   - Go to Settings → Pages
   - Source: **main** branch, **/ (root)** folder
   - Click Save
3. **Wait 2 minutes** — your app will be live at:
   ```
   https://YOUR_USERNAME.github.io/four-seasons-order/
   ```
4. **Install on Android:**
   - Open the URL in Chrome
   - Menu (⋮) → Add to Home screen

Full deployment guide: [DEPLOY.md](DEPLOY.md)

---

## 📖 How It Works

### Weekly Workflow

```
1. Open app from home screen
2. Page 1 → Seasonal Produce → tap circles to set quantities → Next
3. Page 2 → Produce List → same → Next  
4. Page 3 → Meat & Dairy → same → Email Order
5. Gmail opens with CSV data in body
6. Copy to .csv files and upload to distributor portal
7. Quantities auto-reset to zero
```

### Interaction Model

- **Tap** the quantity circle (right side) → +1
- **Hold 1 second** on the circle → reset to 0 (vibration confirms)
- **Tap anywhere else** → scrolls the list (no accidental taps)

### Email Format

Two CSV blocks in one Gmail draft:

```
=== SEASONAL + PRODUCE ===
ItemID,Quantity,ItemName
236006,3,Avocados
8104,2,Bananas

=== MEAT & DAIRY ===
ItemID,Quantity,ItemName
69174,1,Bacon Sunday
```

- Sent to: `highlandrootsmkt@gmail.com` (configurable)
- Seasonal + Produce → uploaded together in portal
- Meat & Dairy → uploaded separately in portal

---

## ⚙️ Configuration

Tap the **⚙ gear icon** (top-right) to edit items.

| Action | How |
|---|---|
| Edit name or ID | Tap field and type |
| Reorder | Drag the **≡** handle |
| Add item | **+ Add item** button |
| Delete item | Trash icon |
| Save changes | **Save config** |
| Backup config | **Backup config** → downloads JSON |
| Restore backup | **Restore backup** → pick JSON file |

**Item IDs** are distributor SKU codes. Seasonal items don't always have them
(distributor assigns new IDs each season) — leave blank and fill in as needed.

---

## 💾 Data Storage

All data lives in **browser localStorage** on the device — nothing is stored
on GitHub or any server.

| Key | Contents |
|---|---|
| `order_items_v3` | Item names + IDs (persists across weeks) |
| `order_qty_v2` | This week's quantities (reset after export) |

⚠️ **localStorage is device-specific.** Clearing browser data or switching devices
will erase your config. Use the **Backup Config** feature regularly.

---

## 🏗️ Architecture

### Single-File Design
Entire app is `index.html` — CSS and JS are inlined for simplicity. No build step,
no bundler, no npm dependencies. Just open the file in a browser and it works.

### Why Vanilla JS?
- Zero dependencies = zero supply-chain risk
- Instant loading (53KB total)
- Any developer can read the code top-to-bottom in 30 minutes
- No framework churn — this works the same in 2030 as it does today

### Touch-First Interaction
- **Passive touch events** on the badge eliminate the 300ms tap delay without
  blocking scroll on the row
- **Pointer-based drag** (not HTML5 Drag API) — works reliably on Android Chrome
- **Only the badge is tappable** — the rest of the row scrolls freely

### PWA Features
- `manifest.json` → home screen install, standalone display mode
- `sw.js` → offline caching, cache-first strategy
- Works fully offline after first load

---

## 📂 Project Structure

```
four-seasons-order/
├── index.html          # Entire app (HTML + CSS + JS)
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
├── icon-192.png       # Home screen icon (192×192)
├── icon-512.png       # Home screen icon (512×512)
├── README.md          # This file
├── DEPLOY.md          # GitHub Pages deployment guide
├── CHANGELOG.md       # Version history
├── CONTRIBUTING.md    # How to contribute
└── LICENSE            # MIT License
```

---

## 🔧 Development

### Local Testing

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/four-seasons-order.git
cd four-seasons-order

# Option 1: Open directly in browser
open index.html

# Option 2: Run local server (for PWA features)
python3 -m http.server 8000
# Then open: http://localhost:8000
```

### Testing on Android

Push to GitHub, enable Pages, open the URL on your phone.  
Or run a local server and access via `http://YOUR_IP:8000` from your phone.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup.

---

## 🐛 Known Limitations

- **No file attachments in email** — `mailto:` links can't attach files. The CSV
  data is pasted as plain text instead. You copy it into `.csv` files at your desktop.
- **localStorage is local** — not synced across devices. Use Backup/Restore to migrate.
- **Single-user** — no multi-user accounts, no cloud sync, no collaboration features.
  This is intentional — simplicity over features.

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Ideas for future versions:**
- Export directly to CSV files (via File System Access API)
- Barcode scanning for item lookup
- Historical order tracking
- Multiple store profiles

Open an issue to discuss before starting major work.

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built for **Four Seasons Grocery** in Monterey, Virginia.

**Stack:**
- No framework — vanilla HTML/CSS/JavaScript
- Fonts: [DM Serif Display + DM Sans](https://fonts.google.com/specimen/DM+Sans) via Google Fonts
- Icons: Hand-coded SVG (no icon library)
- Hosting: GitHub Pages (free, fast, reliable)

---

## 📞 Support

- **Bug reports:** Open a GitHub issue
- **Feature requests:** Open a GitHub discussion
- **Questions:** Contact highlandrootsmkt@gmail.com
