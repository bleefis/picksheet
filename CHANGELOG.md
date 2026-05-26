# Changelog

All notable changes to the Four Seasons Order app.

---

## [1.0.0] - 2026-05-25

### Initial Release

**Order Flow**
- 3-page wizard: Seasonal Produce → Produce List → Meat & Dairy
- Tap-to-increment quantity circles (tap = +1, hold 1s = reset to 0)
- Progress bar shows current step
- Back button to revise previous pages
- Email order via mailto: link (opens Gmail app on Android)

**CSV Export**
- Format: `ItemID,Quantity,ItemName`
- Two blocks: Seasonal+Produce (combined), Meat & Dairy (separate)
- Both pasted into Gmail body as plain text
- Automatic quantity reset after export

**Configuration**
- Gear icon opens item editor
- Inline editing: item name and distributor ID
- Drag ≡ handle to reorder items
- Add/delete items per section
- Optional IDs for Seasonal section
- Save/Cancel buttons

**Data Management**
- localStorage persistence (device-specific)
- Backup Config → downloads JSON file
- Restore Backup → imports JSON file
- Storage keys: `order_items_v3`, `order_qty_v2`

**UI/UX**
- Mobile-first design (optimized for Android Chrome)
- Only quantity badge is tappable — rest of row scrolls freely
- Passive touch events eliminate 300ms tap delay
- Haptic feedback (vibration) on quantity reset
- Toast notifications for confirmations
- Bottom sheet modals for dialogs

**PWA Features**
- Service worker for offline support
- Installable to home screen
- `display: standalone` (no browser chrome)
- 192×192 and 512×512 icons

**Pre-Populated Defaults**
- 32 Seasonal items (IDs optional)
- 30 Produce items (all IDs filled)
- 48 Meat & Dairy items (all IDs filled)
- Sourced from Four Seasons distributor portal (May 2026)

**Technical**
- Single-file architecture (all CSS/JS inline)
- Zero dependencies (vanilla HTML/CSS/JS)
- No build step, no framework
- Fully documented code with inline comments
