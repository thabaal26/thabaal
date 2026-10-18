# Thabaal: handoff for the next session

Updated 18 Oct 2026, 20:05 IST. A new session (possibly on another Claude account) starts with **no memory** of
earlier work; this file is its memory. Read all of it before doing anything.
**Update this file after every task** (the owner's standing instruction): what changed, the commit, and what's left.

---

## 0. Quick start (paste this to the new session)

> Continue work on Thabaal (github.com/thabaal26/thabaal, branch `Madhu_changes`). First read
> `docs/qa/LIVE-TEST-HANDOFF.md` completely and follow its rules (section 2). Everything up to 18 Oct is done and
> live; the open items are in section 5. Wait for my next task.

---

## 1. The project

| | |
|---|---|
| Product | **Thabaal**, a WhatsApp ordering, payments and campaigns portal for small shops. The live client is **Thenan Oils** (Madurai, cold-pressed oils). |
| Owner | Stephan (GitHub `Rensog878`, email stephane17081999@gmail.com). WhatsApp number for tests: **+91 87786 13372** (customer "STEPHAN EZHUMALAI", area Sunami Nagar). |
| Repo | **github.com/thabaal26/thabaal**. Work on `Madhu_changes`; `main` deploys to production. Backup of the old main: `main-backup-2026-10-18`. |
| Local path (owner's Windows PC) | `C:\Users\step1\OneDrive\Desktop\cupnsaucer\whatsapp-portal` (remote `thabaal` = thabaal26/thabaal). Run `git pull thabaal Madhu_changes` before working there. |
| Stack | Next.js 16.4 (Turbopack, App Router, server actions), React 19, Prisma 6.19, Postgres, Tailwind v4. `src/app/dashboard/portal.css` is hand-edited (its generator in `scripts/portal-css` is out of date). Read `node_modules/next/dist/docs/` before writing Next code (AGENTS.md). |
| Live site | https://www.thabaal.in (also thabaal.in, thabaal.vercel.app) |
| Live account | Business login thenanoils@gmail.com. The owner signs in himself; **never type its password**. |
| Vercel | Project `prj_89U5Kwo3j38CwoE0lq2LpyeZ93lY` ("thabaal"), team `team_WugRuRff1CHm2SVoDrBFSW5u`, account thabaal26. Production builds from `main`, previews from `Madhu_changes`. Build: `node scripts/db-additive.mjs && prisma generate && next build` (db-additive runs the listed SQL on Vercel builds). |
| CI | GitHub Actions: **Checks** on every push; **Campaign scheduler** every 5 min. Both only run on thabaal26/thabaal (repository guard). Check: `gh run list -R thabaal26/thabaal --branch main -L 3`. Production deploy: `gh api "repos/thabaal26/thabaal/deployments?environment=Production&per_page=1"`, then its `/statuses`. |

### Working from a cloud session

- Attach the repo with push access (`add_repo` owner `thabaal26`, repo `thabaal`, access `push`) and clone it. In the
  cloud clone the remote is `origin` = thabaal26/thabaal.
- Install deps with `npm ci`. Playwright: `npm i playwright-core axe-core --prefix /home/claude/pw`; Chromium is at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- When running as root, embedded Postgres needs `mkdir -p .testdb .qadb && chown -R postgres .testdb .qadb`.
- The owner allowed all network domains (Prisma engines and Google Fonts download fine).

---

## 2. Rules (must follow)

1. **Push to thabaal26/thabaal only.** `Madhu_changes` first, then `Madhu_changes:main`. Fast-forward only, **never
   force-push**. Rensog878/campaign is no longer used: skip it.
2. **Commit as** `git -c user.name=Rensog878 -c user.email=stephane17081999@gmail.com commit …` (the Vercel Hobby
   plan checks the author; don't re-author as Claude). End the message with the attribution lines your session gives.
3. **Stage files by name**, never `git add -A`. **Never stage** `scripts/vercel_env_output.txt` (secrets),
   `scripts/check_*.mjs`, other untracked `scripts/*.mjs`, `scripts/inspect_templates.js`, `.tmp-ui/`, `public/uploads/`.
4. **Never print, log or commit `.env`** or any token.
5. **Database changes are additive only:** an SQL file in `prisma/sql/`, safe to run twice, listed in
   `scripts/db-additive.mjs`. **Never `prisma db push` against live.**
6. **Live tests:** only with +91 87786 13372; campaigns only to an audience with just him; name records "TEST" and
   delete them afterwards; restore any setting changed. **Never message real Thenan customers.**
7. **Don't change pricing rules:** ₹60 default shipping; loyalty 1 point per ₹100, +50 for a repeat order,
   100 points = ₹50, redeem from 50 points in ₹25 steps, max ₹250.
8. **Don't delete `.next`** (the owner's `next dev` uses `.next/dev`).
9. **Ask before destructive live actions** (deleting records, sending messages, payments). The owner prefers direct
   execution otherwise.
10. **Copy:** plain, specific words on screen (no slogans or filler); real data everywhere (no dummy values).
11. **After every task, update this file** (section 3) and push it with the task's commit.

---

## 3. State at handoff

- **`main` = `Madhu_changes`** = the latest commit (see `git log -1`), deployed to production. Working tree clean
  apart from the untracked scripts (rule 3).
- Full QA run (13-phase master prompt) done: reports in `docs/qa/` — `PROJECT_INVENTORY.md`, `TEST_PLAN.md`,
  `TEST_CASES.csv` (349/349 PASS), `RESPONSIVE_UI_AUDIT.md`, `BUG_REPORT.md` (BUG-01…16, CR-01, DEC-01…04, EXT-01/02),
  `INTEGRATION_REPORT.md`, `PERFORMANCE_REPORT.md`, `FINAL_QA_REPORT.md`, plus `tamil-gaps.tsv`.
- Live tests finished: order RG-1028 (paid ₹1 by UPI, confirmed in the chat, packed, dispatched, delivered); the TEST
  campaign and TEST audience were deleted.

### Done on 19 Oct (latest first)

01. **Payments › Payment settings rebuilt to the design (thabaal-portal.html), every element working.**
- Settings live in `Client.paySettings` (JSON) and `Order.paymentReminder2At`: SQL
  `prisma/sql/2026-10-19-payment-settings.sql` (listed in db-additive). Helpers: `src/lib/pay-settings.ts` (types,
  defaults, `upiLink`, `codBlocked`) and `src/lib/pay-settings-server.ts` (`paySettingsFor`). Actions:
  `src/app/dashboard/actions/pay-settings.ts`. Screen: `src/app/dashboard/revenue/pay-settings-form.tsx`.
- **Pay inside WhatsApp** switch (+ payment configuration name and template status). **UPI QR or payment link**:
  UPI ID, name, QR upload (`/api/upload`), "Send a test link" (₹1 link to Settings › Business phone, needs that
  number's 24-hour window; the link also shows on screen). Orders from chat (no catalogue) get the UPI link + QR
  when UPI is on; catalogue carts use Review and pay. UPI links go only inside the 24-hour window.
- **Cash on delivery** switch, highest COD amount, allowed areas: enforced in `createOrder`, `setPaymentMethod`, the
  order card buttons (hidden when off) and the webhook (a customer's "COD" outside the rules gets a polite no). The
  Cash / COD tab hides when COD is off.
- **Bank account** (managers only): bank, last 4 digits only, settlement. **Reminder rules**: 1-day reminder,
  last 3-day reminder, then the request is marked expired a day later ("Failed or expired"); receipt switch gates
  the thank-you message. Old 6-hour reminder replaced.
- Settings › How customers pay now shows the real on/off state (it had a hard-coded "On" for UPI).
- Webhook fix: a customer's message now matches the order last asked for payment (`nulls: "last"`); before, an order
  never asked for payment could win.
- Buttons: the Settings "Open payment settings" link is a primary (mango) button as in the design; every other
  filled button in the design was already filled in the app.
- Tests: `tests/qa/payments.mjs` checks 17 (COD rules on a customer's "COD") and 18 (reminder switches, expiry).
  payments 18/18, payments-ui 14/14, crud 12/12.
- Next (asked 19 Oct): Campaigns › Automations: one "Reorder reminders" row (no separate Refill), Win-back joined
  into the same list with a switch, and every switch there saved for real (it was screen-only).

### Done on 18 Oct (latest first)

00. **UPI reference (UTR) and payment history** (owner asked to save the UTR and every payment message):
- New: `Order.paymentUtr` (the bank's 12-digit UTR, apart from `paymentTxnId` so neither overwrites the other) and
  table `PaymentEvent` (every payment message: WhatsApp payment updates and UPI bubbles with Meta's full message in
  `raw`, a UTR or screenshot from the customer, staff entries). SQL: `prisma/sql/2026-10-18-payment-events.sql`
  (listed in db-additive); schema updated; `src/lib/payment-events.ts` (`findUtr`, `utrOf`, `logPaymentEvent`).
- Webhook (`src/app/api/webhook/route.ts`): logs every payment status (paid, failed, pending) and bubble; saves a UTR
  if Meta's message has one (gateway setups); UTR duplicates also checked on `paymentUtr`.
- `src/lib/payments.ts`: `confirmPayment` takes `utr`; claims with "UTR-…" fill `paymentUtr`; staff entries logged.
- Staff actions (`actions/payments.ts`, `actions/orders.ts`): a 12-digit reference is saved as the UTR; "Add UTR"
  fills `paymentUtr`; undo / "not found" clear it. New `paymentHistory(orderId)` server action.
- Screens: receipt shows "UPI reference (UTR)" and "Transaction ID" separately plus a "Payment history" list;
  payment line, Payments › Received / All transactions show both (`paymentRefs()` in `plain-error.ts`); order search
  finds a UTR.
- Tests: `tests/qa/payments.mjs` new checks 15 (paid webhook keeps txn id + UTR + full message) and 16 (customer's
  typed UTR saved and logged, order not marked paid); `payments-ui` check 26 now expects the UTR in `paymentUtr`.
  Results: payments 16/16, payments-ui 14/14, crud 12/12. Note: payments-ui check 3 needs the payments suite to run
  first (it sets QA-1012's claim), so don't run payments-ui alone.
- Live note: with UPI Intent Meta still sends no UTR; the UTR fills in when the customer types it, staff add it, or
  if a payment gateway is configured later. Every WhatsApp payment message is now kept in `PaymentEvent.raw`.

0. **Evening fixes (owner's screenshots), commits `f975be5`, `1ab4003`:**
   - New order dialog: field groups were drawn as boxes and squashed (the app-wide `.field` input class matched the
     label+input groups); now plain stacks (`portal.css`).
   - New order: the WhatsApp number comes first and is looked up as it's typed (`lookupOrderCustomer`): an existing
     customer's name and address fill in; a new number is saved as a customer with the order. +91 numbers accepted.
   - Product photos pointed at the old `campaign-seven-ruddy.vercel.app`: links are now made on `www.thabaal.in`
     (`src/lib/app-host.ts`); Meta catalogue photo links are moved in one batch after a catalogue read
     (`relinkOldPhotos` in `src/lib/catalog.ts`); saved logo/banner/template links fixed by
     `prisma/sql/2026-10-18-app-host-links.sql`. **Check:** Products › Edit any product shows a www.thabaal.in link.
   - Meta account alerts in plain words; routine ones (WEBHOOK_CONFIG_UPDATED) hidden (`src/lib/meta-balance.ts`).
   - Add customer: Area and Delivery region aligned (`Label` hint wraps under the label); dummy placeholders removed.
   - QA: payments 14/14, payments-ui 14/14, crud 12/12, crawl desktop 672 visits 0 issues.
1. **BUG-16, UPI references** (`8520817`):
   - Payments no longer shows WhatsApp message ids (`wamid…`) or `WA-UPI` as a reference (`paymentRef()` in
     `src/lib/plain-error.ts`).
   - **"Add UTR"** on Money in rows and receipts saves a UTR once (`savePaymentReference` in
     `src/app/dashboard/actions/payments.ts`).
   - The chat's "Payment received: confirm" opens Record payment with the UTR field.
   - The CSV export has a Reference column.
2. **Campaign delete** goes back to the list instead of a 404 (BUG-15).
3. **CR-01:** alerts moved from Home to Notifications; payment claims are shown in the chat with a confirm button.
4. QA fixes BUG-01…14 (security header on uploads, accessibility, contrast, dialogs, order filters, template
   placeholders, campaign defaults, reports ROI, Tamil phrases). Details in `BUG_REPORT.md`.

### Why payments don't confirm themselves

Thenan's WhatsApp payments run in **UPI Intent** mode: Meta sends no payment status webhook and no UTR. Only a
**Payment Gateway** configuration (Razorpay, PayU, Billdesk, Zaakpay) in WhatsApp Manager sends them, and Thabaal
already handles those events (14 replay tests). Until then:
- the customer's "paid" bubble or message marks the order "Customer says paid · check";
- staff confirm from the chat or the order card, which sends "Payment received" and a thank-you;
- a UTR the customer types in chat ("UTR 412345678901") is saved automatically.

---

## 4. QA how-to

```bash
npx tsc --noEmit && npx eslint .
node tests/run.mjs                      # unit + DB tests (84) and cross-business isolation (14)
export PW_CORE=/home/claude/pw/node_modules/playwright-core CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
node tests/qa/run-all.mjs --build       # or --only=payments,payments-ui,crud / --skip=visual,perf
node tests/qa/report.mjs --retest       # regenerates docs/qa/TEST_CASES.csv
```

- The QA app runs at http://localhost:3200: a production build with its own Postgres on 5434, seeded "QA Test Shop"
  and "QA Other Shop", and every real key blanked, so nothing reaches Meta.
- State and tokens are in `.git/qa-state.json`; logs are `.git/qa-<suite>.log`.
- On Windows, `CHROME_PATH` and `PW_CORE` default to the owner's PC paths.
- A full run takes about 45 minutes (crawls about 11 minutes each). Give background runs a long timeout.

---

## 5. Open items (no action unless the owner asks)

| Item | Who |
|---|---|
| Type the UTRs for RG-1019, RG-1020, RG-1028 with "Add UTR" (Payments › All transactions) | owner |
| "Confirmed sales" counted differently on Home vs Reports/loyalty (DEC-01; suggestion: count CONFIRMED only for COD/cash) | owner decision |
| Staff can refund/undo payments (DEC-03) | owner decision |
| Switch WhatsApp payment configuration to a gateway so payments confirm themselves | owner, WhatsApp Manager |
| Meta 130429 on sends to the Thenan number (EXT-01): check the number's limit and quality | owner, WhatsApp Manager |
| Live templates with an unmapped `{{2}}`+ now refuse to send until a value is set in Templates | owner |
| ~125 Tamil strings still in English (`docs/qa/tamil-gaps.tsv`) | next pass |
| Unpaid totals' scopes unlabelled (DEC-02); `portal.css` generator out of date (DEC-04) | next pass |
| Live data notes: Black Cumin oil 50ml priced ₹1; test customers "Test recipient", "Test recipient 2", "Stef"; RG-1001/1002/1010 delivered but unpaid; "Testing" campaign scheduled 22 Oct; a "(name unclear)" customer; 30 imported customers without phone | owner |
| Untested: Firefox/WebKit, physical devices, AI drafts, Google Sheets delivery, Google sign-in success, screen readers | — |
