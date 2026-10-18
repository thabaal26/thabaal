# Thabaal: responsive UI audit (18 Oct 2026)

All results are from Chromium 141 (Playwright) on the QA app, production build, signed in as the QA shop manager
unless noted. These are browser viewports, not physical devices; no real phone or tablet was used.

## 1. Coverage

| Suite | Routes | Viewports | Variants | Screens | Findings (fixed build) |
|---|---|---|---|---|---|
| Layout (`layout.mjs`) | 28 (every dashboard route with data, incl. a customer profile, a template and a campaign) | 17: the 14 required + 820×1180, 1536×864, 2560×1440 | light, English | **476** | **0** |
| Visual matrix (`visual.mjs`) | 24 | 360×740, 390×844, 768×1024, 1366×860, 1920×1080 | light/dark × English/Tamil | **480** | 10, all one data item (below) |
| Crawl (`crawl.mjs`) | every page reachable by 5 roles, every internal link, tab and filter | 1366×860 and 390×844 | 5 roles | **651 + 651** page visits | **0** |
| Accessibility (`a11y.mjs`) | 25 | 1366×768 and 390×844 | — | 51 | **0** axe violations |
| Button sweep (`sweep.mjs`) | every page | 390×844 and 1366×900 | — | see `TEST_CASES.csv` | see §4 |

Required viewports, all covered by the layout suite: 320×568, 360×800, 375×812, 390×844, 414×896, 430×932, 600×960,
768×1024, 1024×768, 1280×720, 1366×768, 1440×900, 1600×900, 1920×1080.

Not covered: browser zoom levels, live orientation changes (portrait and landscape were tested as separate
viewports), Firefox and WebKit (not installed here), physical devices, `/dashboard/clients` and `/dashboard/wallet`
in the layout suite (admin-only and money-admin pages; both are in the crawl).

## 2. What the layout checks look for

Per screen, inside the page (`tests/qa/layout-check.mjs`):
- sideways scrolling of the page;
- overlapping text or controls (per text line, ignoring clipped or scrolled-away parts and pinned bars);
- squeezed text (12+ characters in a column under 60px that is more than 4 lines tall);
- content within 6px of a card's edge;
- stat tiles in one row with different heights;
- dialogs wider than the screen.

The crawl adds: page errors, console errors, failed requests, `NaN`/`undefined`/`Invalid Date` on screen, sample
data, another business's data, controls under 32px on phones. The visual suite adds: anything off-screen or clipped,
English headings/buttons left in Tamil mode.

## 3. Results

**Layout: 476 screens, 0 findings** on the fixed build. The 17 Oct run's last findings (phone date cells breaking
into four lines, the Redeem/Send-offer overlap at 1024px, the Priority chats button touching the card edge, the
template editor squeezing at 1024–1279px, the phone top bar hiding the shop name) were fixed before this run and
stay fixed at every width.

**Visual: 480 screens, 10 findings, not a defect.** All ten are the same item: the QA template's name "Qa diwali
offer" in the campaign template picker in Tamil mode. A template name is the business's own data and is shown as
written.

**Crawls: 1,302 page visits, 0 findings** across admin, manager, staff, viewer and the other business's manager.

## 4. Fixed in this run (layout, interaction and visual)

| ID | Problem | Fix |
|---|---|---|
| BUG-02 | Link tabs and chips marked selected with attributes links can't have | `aria-current`, same look |
| BUG-03 | Seven low-contrast text colours (bubble times, sign-up link, counts, hints, green figures) | darker tokens, 4.5:1 or better |
| BUG-05 | Sideways-scrolling tables unreachable by keyboard | focusable, named regions |
| BUG-11 | Reports headline "Every ₹1 spent brought back ₹9,200" with ₹0 spent (seen in screenshots) | "—" and an honest sentence |
| BUG-12 | Tamil mode: 63 tile/filter phrases in English | translated; the rest listed in `tamil-gaps.tsv` |
| BUG-13 | New order, Dispatch and Receipt overlays: no dialog role, Escape didn't close, focus stayed behind | dialog role, Escape, focus in and back |

## 5. Reviewed by eye

Phone (390×844) and laptop (1366×860) screenshots of Home, Orders, Payments, Customers, Templates, Campaigns, Chats,
Reports, Settings, Products and the Message log, plus Tamil at 360×740, were read page by page. Findings were the
Reports return figure (BUG-11) and the Tamil gaps (BUG-12). Layout, spacing and alignment looked consistent:
same page header, tile grid and card spacing on every page; tabs that don't fit on a phone scroll sideways inside
their own strip (Payments, Products) rather than squeezing.

## 6. Remaining (low)

- Tamil: about 125 interface strings written directly into pages still show in English (`tamil-gaps.tsv`).
- Dates on Notifications show English month and day names in Tamil mode.
