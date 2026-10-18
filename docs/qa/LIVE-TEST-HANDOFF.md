# Thabaal: handoff for the next session

Updated 18 Oct 2026, 18:35 IST. A new session (possibly on another Claude account) starts with **no memory** of
earlier work; this file is its memory. Read all of it before doing anything.

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

---

## 3. State at handoff

- **`main` = `Madhu_changes` = `624710e`**, deployed to production and verified; GitHub Checks green. Working tree clean.
- Full QA run (13-phase master prompt) done: reports in `docs/qa/` — `PROJECT_INVENTORY.md`, `TEST_PLAN.md`,
  `TEST_CASES.csv` (349/349 PASS), `RESPONSIVE_UI_AUDIT.md`, `BUG_REPORT.md` (BUG-01…16, CR-01, DEC-01…04, EXT-01/02),
  `INTEGRATION_REPORT.md`, `PERFORMANCE_REPORT.md`, `FINAL_QA_REPORT.md`, plus `tamil-gaps.tsv`.
- Live tests finished: order RG-1028 (paid ₹1 by UPI, confirmed in the chat, packed, dispatched, delivered); the TEST
  campaign and TEST audience were deleted.

### Done on 18 Oct (latest first)

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
