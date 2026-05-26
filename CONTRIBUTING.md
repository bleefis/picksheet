# Contributing Guide

Thank you for considering improvements to the Four Seasons Order app!

---

## Reporting Bugs

Open an issue on GitHub with:
- Steps to reproduce
- Expected vs actual behavior
- Device/browser (e.g., "Android 14, Chrome 122")
- Screenshots if helpful

---

## Suggesting Features

Open an issue with:
- Use case: what problem does this solve?
- Proposed solution
- Any UI/workflow sketches if relevant

---

## Code Changes

### Setup
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/four-seasons-order.git
cd four-seasons-order

# No npm install needed — it's vanilla HTML/CSS/JS
# Just open index.html in a browser to test
```

### Making Changes

1. **Create a branch:**
   ```bash
   git checkout -b fix-drag-bug
   ```

2. **Edit `index.html`** (or other files)
   - Follow existing code style
   - Keep comments clear and concise
   - Test on both desktop and Android Chrome

3. **Test thoroughly:**
   - Desktop browser: open `index.html` directly
   - Android: run a local server (see below) and test via phone

4. **Commit with a clear message:**
   ```bash
   git add .
   git commit -m "Fix drag-to-reorder on Samsung devices"
   ```

5. **Push and open a Pull Request:**
   ```bash
   git push origin fix-drag-bug
   ```
   Then go to GitHub and click "Compare & pull request"

---

## Testing on Android

Since this is a PWA, you should test on a real Android device:

### Option A — GitHub Pages (recommended)
1. Push your branch to GitHub
2. Enable Pages for that branch (Settings → Pages → select your branch)
3. Open the URL on your phone
4. Test the feature

### Option B — Local server
```bash
# In the project folder, run:
python3 -m http.server 8000

# On your phone (same WiFi network):
# Find your computer's IP address
# Open: http://YOUR_IP:8000

# Example: http://192.168.1.5:8000
```

---

## Code Style

- **Vanilla JS only** — no frameworks, no build tools
- **Inline CSS/JS** — keep the single-file architecture for simplicity
- **Comments:** explain *why*, not *what*
  - Good: `// Passive touch allows scroll; preventDefault would block it`
  - Bad: `// Add event listener`
- **Naming:**
  - Functions: `camelCase` (e.g., `renderOrderPage`)
  - Constants: `UPPER_SNAKE` (e.g., `SECTION_KEYS`)
  - CSS classes: `kebab-case` (e.g., `.item-row`)

---

## Common Tasks

### Adding a new item to defaults
Edit the `DEFAULTS` constant in `index.html`, then bump `KEY_ITEMS` version:
```javascript
const KEY_ITEMS = 'order_items_v4'; // was v3
```

### Changing the email recipient
Change the `ORDER_EMAIL` constant:
```javascript
const ORDER_EMAIL = 'newaddress@example.com';
```

### Modifying CSS
All styles are in the `<style>` block. Search for the class name (e.g., `.qty-badge`)
and edit directly.

### Debugging localStorage
Open Chrome DevTools → Application tab → Local Storage → select your domain.
You'll see `order_items_v3` and `order_qty_v2` with their JSON contents.

---

## Questions?

Open a GitHub issue or discussion — happy to help!
