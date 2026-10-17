# Design parity run — handoff notes

Read this first if you are picking this task up in a new session or another account.

## The task (owner's words, 17 Oct 2026)

> The sample `thabaal-portal (1).html` is the design we build thabaal.in from. Our pages should replicate exactly
> its look and functionality, except the new campaign features. We almost completed everything but missed minor
> things. Do a final run to check we replicate the HTML's look and functionality with live data connected,
> hardcoded and duplicate data removed and overlays removed. We added some features too (e.g. when several orders
> come in, a dropdown to view each one) — keep those. Check each route, click, interaction, every page and every
> page navigated to: all must work with live data, without errors.

## Ground rules (from the owner, still in force)

- Work only on branch **Madhu_changes**. Push to both remotes `thabaal` and `origin`. **Never push/merge to main.**
- Test only on the QA copy (below). Never touch production data, real WhatsApp numbers, payments, Meta templates or
  Google Sheets. No destructive database changes; additive SQL only, listed in `scripts/db-additive.mjs`.
- Never print or commit anything from `.env*`. Don't stage the untracked `scripts/*.mjs`, `.tmp-ui/`, `public/uploads/`.
- Pricing rules stay: ₹60 default shipping; loyalty 1 point per ₹100, 100 points = ₹50, redeem from 50 points in
  ₹25 steps, max ₹250.
- Commit as `Rensog878 <stephane17081999@gmail.com>`; message ends with the Co-Authored-By / Claude-Session lines.

## Where things are

- Project: `C:\Users\step1\OneDrive\Desktop\cupnsaucer\whatsapp-portal` (Windows; Next.js 16, React 19, Prisma 6).
- Sample design: `C:\Users\step1\Downloads\thabaal-portal (1).html` (copy in `.tmp-ui\sample.html`, not committed).
  Single-page app with hash routes: `#index #inbox #orders #payments #customers #products #campaigns #templates
  #reports #settings #guide`, plus sub-routes like `#orders/pack`, `#orders/new`.
- App routes: `/dashboard` (Home), `/dashboard/replies` (Chats), `/dashboard/orders` (+ `/packing`),
  `/dashboard/revenue` (Payments), `/dashboard/customers` (+ `?tab=groups|loyalty`, `/refills`, `/[id]`),
  `/dashboard/catalogue` (Products), `/dashboard/campaigns`, `/dashboard/templates`, `/dashboard/report`,
  `/dashboard/settings`, `/dashboard/guide`. Shared design classes: `src/app/dashboard/portal.css` + `portal-ui.tsx`.

## How to run the QA copy

```
npx next build                                   # don't delete .next: the owner's `next dev` uses .next/dev
powershell -File tests/qa/run-all.ps1 -NoBuild   # QA app on :3200 + payments, CRUD, crawls, visual matrix
node tests/qa/qa-login.mjs                       # QA logins get the password qa-test-123 (run after every restart)
```
App: http://localhost:3200 — `manager@qa.test` / `qa-test-123` (also staff@, viewer@, admin@qa.test).
`prisma generate` fails with EPERM while the QA app runs: stop `tests\qa\serve.mjs` and `next start -p 3200` first.

Parity tools (all QA-only):
- `node tests/qa/parity-shots.mjs` — full-page screenshots of every sample page/tab next to the app's, in
  `.qa-shots/parity/<page>/`.
- `node tests/qa/parity-controls.mjs` — headings and controls per page/tab on both sides, `.qa-shots/parity/controls.json`.
- `node tests/qa/sweep.mjs [pages=/a,/b]` — clicks every button on every page (fresh page per click), answers the
  app's own confirm dialogs, and records dialogs, toasts, navigation, dead buttons, script errors and 5xx responses
  in `.git/qa-sweep.json`. It changes QA data (confirms/cancels orders…); restart the QA app to reset.

## Progress

| Page | Look vs sample | Clicks / interactions | Live data, no sample/duplicates | Notes |
|---|---|---|---|---|
| Home | ✓ | ✓ | ✓ | Wallet card got the "Costs" link. Greeting shows the client name. |
| Chats | ✓ | ✓ | ✓ | Default filter is now "All" as in the sample; Priority rows no longer wrap "Done" alone. |
| Orders (+ pack, new) | ✓ | ✓ | ✓ | "Call" button and the sample's per-stage More actions added (see below). Multi-item dropdown kept. |
| Payments | ✓ | ✓ | ✓ | COD day close is from live collections (no rider/bank model): deliberate. |
| Customers (+ profile, loyalty, refills) | ✓ | ✓ | ✓ | Loyalty: reason, tell-on-WhatsApp, Redeem for a bill, Referral 100, Point history. Refills: Remind all overdue. |
| Products | ✓ | ✓ | ✓ | "Added, then dropped" filter; column order and "Send price list" as in sample. Add/Edit/Sync show only with a live Meta catalogue. |
| Campaigns | n/a (new features kept) | ✓ | ✓ | |
| Templates | ✓ | ✓ | ✓ | Per-card Preview dialog (with test send) and Duplicate added. |
| Reports | ✓ | ✓ | ✓ | "Open products" / "Run again" appear when the data calls for them. |
| Settings | ✓ | ✓ | ✓ | WhatsApp billing: See costs in Reports, Download Meta invoices, Catalogue on Meta. |
| Guide | ✓ | ✓ | ✓ | |
| Sign-in / root | ✓ | ✓ | ✓ | thabaal.in shows sign-in with legal links. |

## Findings and fixes (17 Oct)

Click sweep (29 pages, every button): no script errors, no server errors, no broken links. Every "Problem" toast was
the QA shop's intended refusal (no WhatsApp number connected, 24-hour window closed). "No visible effect" items were
already-selected chips/tabs and an empty password form (browser validation). Refill day buttons are the chart's
screen-reader list; clicking the bars filters the list as designed.

Gaps against the sample, now fixed:
1. Order card main row: "Call" (WhatsApp call through the call widget when calling is set up, else the phone's dialler)
   instead of a wa.me link.
2. Order card More actions per stage, as in the sample:
   - ready: Add or change address, Edit delivery charge;
   - packed: Add tracking number, Choose delivery method, Print label;
   - out for delivery: Update tracking, Send delivery update, Contact customer, Not delivered (back to ready to dispatch);
   - delivered: Send thank-you message, Create repeat order;
   - cancelled: Duplicate order, Why was it cancelled?
   Repeat/duplicate add a new order with the same items and send nothing to the customer.
   Removed what didn't belong: "Cancel order" once out for delivery or delivered, "Send payment link", "Edit order"
   and "Print invoice" on cancelled orders, "Edit order" on delivered ones, "Not packed yet" after dispatch, and the
   second "Restore order" (the main button already restores). "Send thank-you message" says plainly when nothing
   could be sent.
3. Page header order: page action, bell, தமிழ், light/dark (was தமிழ் before the bell).
4. Home wallet card: "Costs" link to Reports.
5. Settings › WhatsApp billing: "See costs in Reports", "Download Meta invoices", "Catalogue on Meta".
6. Products › How products sell: "Added, then dropped" filter (orders cancelled after adding the item) and a red
   "Dropped" part in Sales by category. Product table columns in the sample's order; "Send price list".
7. Templates: Preview dialog (message, kind, price band, use, rejection reason, test send to your own number, Use in
   campaign) and Duplicate (opens the editor with a copy).
8. Customers › Loyalty: reason select, "Tell the customer on WhatsApp", "Redeem for a bill" (50-point steps, max 500),
   "Referral 100" chip, per-customer History, and a "Point history" view with filters and CSV export. Hand changes are
   saved in a new `LoyaltyEntry` table (additive SQL `prisma/sql/2026-10-17-loyalty-entries.sql`, listed in
   `scripts/db-additive.mjs`); points earned/used on orders come from the orders.
9. Refills: "Remind all overdue" (confirm, then each overdue customer not yet reminded gets the refill reminder).
10. Chats: "All" is the default filter (old `show=all` links still work; Home's "Chats waiting" opens `show=open`).
11. Priority: the wait time and buttons stay together on narrow cards.
12. Dialogs (template preview, payments' Mark paid / receipt) open centred; before they sat in the top-left corner.

## Deliberate differences (keep)

- DM Sans font, stat icons, the floating panel shell, the "Combo ideas" tab, the "Payments to look at" callout, AI Ask
  on the daily brief, Create campaign / Reorder buttons, the multi-item dropdown on order cards.
- Extra row actions the live app needs: Pay link / Catalogue / Done on Priority rows; Mark paid, refunds, undo payment,
  print slip/invoice on orders.
- Payments › COD day close and settings follow the live data (collections by person, CSV summary) instead of the
  sample's rider and bank fields.
