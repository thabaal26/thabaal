# Thabaal: bug report (QA run, 18 Oct 2026)

Every defect below was reproduced on the QA app (production build, private Postgres, seeded QA shops) or on the live
site, fixed at its cause, and retested by the suite named in **Regression test**. Severity: P0 critical · P1 high ·
P2 medium · P3 low. Owner decisions and outside issues are in §2 and §3.

## 1. Defects found and fixed

### BUG-01 · P2 · Security · Uploaded files lost their sandbox security policy
- **Route:** `GET /api/upload/[id]` (template header images and reply attachments, served on thabaal.in itself)
- **Reproduce:** upload a PNG as a manager; request its URL; read `Content-Security-Policy`.
- **Expected:** `default-src 'none'; sandbox` (what the route sets), so nothing inside an uploaded file can ever run.
- **Actual:** `frame-ancestors 'self'; base-uri 'self'; object-src 'none'`: the site-wide header rule in
  `next.config.ts` matches every path and overwrote the route's own header.
- **Root cause:** Next.js applies `headers()` rules after the route; the `/:path*` rule replaced the stricter value.
- **Fix:** a later, more specific rule for `/api/upload/:id` with the sandbox policy (`next.config.ts`).
- **Impact before the fix:** limited: uploads are already restricted to JPG/PNG/WebP/PDF by magic bytes and served
  with `nosniff`, so no exploit was found; the fix restores the intended second layer.
- **Regression test:** API-26 (`tests/qa/api.mjs`). **Retest:** see `TEST_CASES.csv`.

### BUG-02 · P1 · Accessibility (critical) · Link tabs and link chips used ARIA attributes links can't have
- **Routes:** 16 pages: Payments tabs, Customers tabs, Catalogue tabs, Templates category chips, Replies and
  Payments filter chips.
- **Reproduce:** axe rule `aria-allowed-attr` on `/dashboard/revenue`, `/dashboard/customers`, `/dashboard/templates` …
- **Expected:** a link marks the current tab or filter with `aria-current`.
- **Actual:** `<a aria-selected>` (only valid on `role="tab"`) and `<a aria-pressed>` (only valid on buttons); screen
  readers ignore or misreport them, so the selected tab/filter isn't announced.
- **Root cause:** `LinkTabs` in `portal-ui.tsx` added `aria-selected` beside `aria-current`; link chips copied the
  button chips' `aria-pressed`.
- **Fix:** links use `aria-current` only (`portal-ui.tsx`, `replies/page.tsx`, `revenue/page.tsx`,
  `templates/page.tsx`); `portal.css` styles `a.chip[aria-current]` and `.tabs a[aria-current]` exactly like the
  old selected state, so nothing looks different.
- **Regression test:** `tests/qa/a11y.mjs` (rule `aria-allowed-attr`).

### BUG-03 · P2 · Accessibility · Text below the 4.5:1 contrast minimum
| Where | Was | Now |
|---|---|---|
| Sign-in "Sign up" link | #E0900A on white, 2.6:1 | #A35F00, 5.0:1 |
| WhatsApp bubble times and ticks (chats, customer page, sign-in demo) | #667781 on #D9FDD3, 4.2:1 | #54656F, 5.5:1 |
| Green "up" figures (Reports, app-wide `--ok`) | #0E8A5B, 4.4:1 at 13px | #086842, 6.8:1 (the portal's own value) |
| Counts in filter tabs and chips | muted text at 70–75% opacity, 3.0–3.3:1 | full muted, 5.5:1 |
| "+ N more" on order cards | muted at 85%, 4.0:1 | full muted, 5.5:1 |
| Selected-option hints (campaign form, filters) | brand-deep at 80% on cream, 3.6:1 | full brand-deep |
| "Tapped a button" in chats | emerald-600, 3.7:1 | emerald-700, 5.5:1 |
- **Root cause:** opacity used to soften already-muted text, and two hard-coded brand/WhatsApp colours.
- **Regression test:** `tests/qa/a11y.mjs` (rule `color-contrast`).

### BUG-04 · P2 · Accessibility · Picker buttons' spoken name left out the visible choice
- **Routes:** template language, campaign template, message-log filters (`Picker`, `src/components/picker.tsx`).
- **Actual:** the button showed "Thenan brand intro" but was announced only as "Template" (WCAG 2.5.3 Label in Name),
  so a voice-control user saying the visible text couldn't activate it.
- **Fix:** the accessible name is "Template: Thenan brand intro" (label + visible text) for the default trigger.
- **Regression test:** `tests/qa/a11y.mjs` (rule `label-content-name-mismatch`).

### BUG-05 · P3 · Accessibility · Sideways-scrolling tables couldn't be reached by keyboard
- **Routes:** sign-in page rates table, Guide tables.
- **Fix:** `tabIndex={0}`, `role="region"` and a name on the scroll wrappers.
- **Regression test:** `tests/qa/a11y.mjs` (rule `scrollable-region-focusable`).

### BUG-06 · P2 · Functional · Orders "From" filter: "chat" and "catalogue" showed the same orders
- **Route:** `/dashboard/orders`, "From:" select.
- **Reproduce:** choose From: catalogue, then From: chat: identical lists. From: catalogue also included orders the
  card labels "Campaign".
- **Root cause:** both options tested only `waMessageId`; there is no separate "chat" source in the data (orders are
  catalogue carts, campaign-attributed carts, or entered by hand, the three labels the card shows).
- **Fix:** the filter uses the card's rule (`orders-view.tsx`): catalogue = WhatsApp cart not from a campaign;
  campaign = cart after a campaign message; manual = no cart. The duplicate "chat" option is removed; old
  `?src=chat` links show everything instead of a wrong subset.
- **Regression test:** crawl (filters are followed on every role) + live check after deploy.

### BUG-07 · P2 · Functional / data · Order templates previewed (and would campaign) as "Hello Priya … #A1B2C"
- **Routes:** Templates list and detail, campaign preview; seen live on Thenan's `order_delivered`,
  `order_dispatched`, `order_confirmation` and `thenan_order_delivered`.
- **Root cause:** `createOrderTemplates` saved `{{1}}` as the fixed sample word "Priya" (Meta's review example)
  instead of "customer's first name". Order updates themselves were never affected: they pass the customer's
  name and order number when sending. But previews used the saved value, and so would any campaign built on one
  of these templates.
- **Fix:** new order templates save `{{1}}` as the first name (`actions/orders.ts`); existing rows are corrected by
  `prisma/sql/2026-10-18-order-template-names.sql` (runs on the next Vercel build; changes only rows whose `{{1}}`
  is still the static "Priya"; safe to run again). Meta still receives the same review example.
- **Regression test:** templates unit tests; live Templates page after deploy.

### BUG-08 · P2 · Functional · New campaigns started on the "order cancelled" utility template, with raw names
- **Route:** `/dashboard/campaigns/new`.
- **Root cause:** the default was the first approved template of any category; the picker showed Meta names
  (`order_cancelled`).
- **Fix:** default is the first approved **Marketing** template (falls back to any approved one); the picker lists
  Marketing first and shows friendly names (`templateLabel`).
- **Regression test:** CRUD suite (campaign create) + crawl.

### BUG-11 · P2 · Functional / data · Reports invented a "return per ₹1" when no message cost was recorded
- **Routes:** `/dashboard/report` (verdict card, "Return per ₹1" tile, Spend tab, campaign table), Campaigns cards,
  the Reports text export.
- **Reproduce:** a period with paid orders but ₹0 recorded message cost (for example a week with only free replies,
  or a business whose message costs aren't recorded yet). Live Thenan this month has ₹30 recorded, so its ₹95 is a
  real ratio. Seen in the QA screenshots: "You spent ₹0 on messages and received ₹9,200 in paid orders.
  Every ₹1 spent brought back ₹9,200", headed "WhatsApp is working well this month."
- **Root cause:** `reports-data.ts` used the sales total as the ratio when cost was 0 (`cost > 0 ? sales / cost :
  sales`), in three places; the verdict was then judged on that number. The campaign summary divided by zero.
- **Fix:** no cost → ratio 0 and shown as "—" with "No message cost recorded"; the verdict reads "Sales came in this
  month; no message cost recorded." with a neutral border; campaigns that haven't sent show "Not sent yet"; the
  export says "not worked out". Real ratios are unchanged when a cost exists.
- **Found by:** reviewing the visual-matrix screenshots by eye (no automated rule catches a wrong number that
  looks valid). **Regression test:** visual + crawl on the rebuilt app; Reports checked on live after deploy.

### BUG-12 · P3 · Tamil · Interface text left in English in Tamil mode (partly fixed, rest listed)
- **Found by:** a new scan that opens 15 pages in Tamil at 390×844 and lists every on-screen phrase of two or more
  English words (the visual suite only checks headings and buttons). First scan: 262 phrases, most of them real data
  (names, addresses, chat text, order items), which correctly stays as written.
- **Fixed:** 63 tile, filter and note phrases added to `src/lib/i18n/phrases-ta.ts` (tiles look phrases up there), and
  the Templates explainer paragraph. Second scan: 232 phrases, with every tile label translated.
- **Still open (P3):** about 125 strings written directly into page code, which don't go through the phrase lookup:
  Templates filter options and default-image card, the Customers "how tiers work" note, Reports suggestions, Settings
  order-step choices, Home assistant questions, Message log labels, English dates on Notifications. Each needs a
  `<T ta="…">` or `L()` at its source. Full list: [`tamil-gaps.tsv`](tamil-gaps.tsv).

### BUG-09 · P3 · Code quality · Lint warning
- Unused `eslint-disable` in `src/app/app-icon.tsx`, removed. `eslint .` is now 0 errors, 0 warnings.

### BUG-10 · P3 · Test tooling · QA suites only ran on the owner's Windows PC
- Hard-coded `C:/Program Files/…/chrome.exe` in 9 scripts and a PowerShell-only runner.
- **Fix:** `CHROME_PATH` (Windows path stays the default), `tests/qa/run-all.mjs` for any OS.

## 2. Found, not changed: needs the owner's decision

| ID | Sev | What | Why not changed |
|---|---|---|---|
| DEC-01 | P2 | "Confirmed sales" differs: Home counts paid/dispatched/delivered; Reports and loyalty also count confirmed-but-unpaid orders (e.g. RG-1028 waiting for its ₹61 counts as a sale in Reports and earns points). | Changing either side moves reported sales and customers' points. Suggested rule: count CONFIRMED only for cash-on-delivery. |
| DEC-02 | P3 | Three "unpaid" totals with different scopes and no scope label: Home "Unpaid carts" (the Home period), Payments "Money to collect" (all), Reports "Money waiting" (orders after a message). | Wording needs the Home period passed to the tile; low impact. |
| DEC-03 | P2 | Staff (not only managers) can record refunds and undo staff-recorded payments (from the 17 Oct run). | Changes how shops work. |
| DEC-04 | P3 | `portal.css` is no longer reproducible from `scripts/portal-css/` (≈45 hand edits since the last generation). | Regenerating would undo those edits; the README should say the file is now edited by hand, or the edits be moved into `bottom.css`. |

## 3. Outside Thabaal

| ID | What | Evidence |
|---|---|---|
| EXT-01 | Meta failed three sends to the owner's number today with error **130429** ("Rate limit hit", the number's throughput) after accepting them: 08:03 flyer, 08:38 and 10:05 TEST campaign. Thabaal records the code and the right explanation; the failure comes from Meta's status webhook, not from the send. | Message log, campaign Send history. Check WhatsApp Manager → the number's quality and messaging limit. |
| EXT-02 | Live data to know about (not bugs): Black Cumin oil 50ml priced ₹1 in the catalogue; test customers "Test recipient", "Test recipient 2", "Stef"; RG-1001/1002/1010 delivered with no payment record (₹720); stale scheduled campaign "Testing" (Thu 22 Oct); a customer named "(name unclear)"; 30 sheet customers without a phone. | `LIVE-TEST-HANDOFF.md` §4 |

## 4. Test defects (ours, not the app's)

- API-26 first failed because the test posted a multipart form; the upload route takes the raw file as the body
  (as the template editor sends it). The test was corrected; with the correct request the route works and the real
  defect (BUG-01) showed up.
