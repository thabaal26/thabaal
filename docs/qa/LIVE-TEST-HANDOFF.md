# Thabaal: live testing handoff (detailed)

Written 18 Oct 2026, 08:45 IST, at the end of a long session. A new session (possibly on another Claude account)
starts with **no memory** of that session; this file is its full memory. Read all of it before doing anything.

---

## 0. Quick start (paste this to the new session)

> Continue the Thabaal live testing work. First read
> `C:\Users\step1\OneDrive\Desktop\cupnsaucer\whatsapp-portal\docs\qa\LIVE-TEST-HANDOFF.md` completely and follow
> its rules (section 2) and "What to do next" (section 9) in order. Start by rebuilding, running QA and committing
> the uncommitted work on Madhu_changes, then push to thabaal26/thabaal (`thabaal` remote) and to main. Then finish the live order RG-1028
> and campaign tests with my number +918778613372 only, and delete the TEST records at the end.

---

## 1. The project

| | |
|---|---|
| Product | **Thabaal**, a WhatsApp ordering, payments and campaigns portal for small shops. The live client is **Thenan Oils** (Madurai, cold-pressed oils). |
| Owner | Stephan (GitHub `Rensog878`, email stephane17081999@gmail.com). His WhatsApp number for tests is **+91 87786 13372** (customer "STEPHAN EZHUMALAI", area Sunami Nagar). |
| Local path (Windows) | `C:\Users\step1\OneDrive\Desktop\cupnsaucer\whatsapp-portal` |
| Stack | Next.js 16 (Turbopack), React 19, Prisma 6, Postgres, Tailwind v4 (`@custom-variant dark (&:where(.dark, .dark *))`), Vercel Hobby. |
| Live site | https://www.thabaal.in (also thabaal.in, thabaal.vercel.app) |
| Live account | Business login thenanoils@gmail.com. The owner signs in himself; **never type its password**. He posted it in chat earlier: recommend he changes it. |
| Branches | Work on **`Madhu_changes`**. `main` deploys to production. Backup of the old main: `main-backup-2026-10-18`, on both remotes. |
| Remotes | **Work only on `thabaal` = github.com/thabaal26/thabaal** (Vercel builds from it). `origin` = github.com/Rensog878/campaign is no longer used (owner, 18 Oct): don't push there. |
| Vercel | Project `prj_89U5Kwo3j38CwoE0lq2LpyeZ93lY` ("thabaal"), team `team_WugRuRff1CHm2SVoDrBFSW5u`, account **thabaal26** (username thabaal26-4140). With the Vercel connector, `list_deployments`, `get_deployment` and `create_deployment` work without a teamId. Build logs and runtime errors return 403. |
| Build command | `node scripts/db-additive.mjs && prisma generate && next build`. db-additive runs the listed SQL files against the live database on Vercel builds only. |

### How the tools reach the computer

- **Running commands.** Use the Desktop Commander tools on the linked computer (`start_process`, `read_file`, `write_file`, `edit_block`). The shell is PowerShell, so use `git grep -F` or put patterns in single quotes. Double quotes inside `-E` patterns break PowerShell parsing.
- **Live site.** Use the **built-in browser** (`mcp__remote-devices__Claude_Browser__*`). Tab id **`seed`** is signed in to thabaal.in as Thenan Oils. If it signed out, ask the owner to sign in again in the browser pane.
  - The pane always shows a "microphone requested" note. It is a sticky pane notice, not the app: the app asks for the microphone only when someone taps Call or Answer.
- **Playwright for QA.** It lives at `C:/Users/step1/pwtmp/node_modules/playwright-core`, with Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`.

---

## 2. Rules (must follow)

1. **Push to thabaal26/thabaal only** (the `thabaal` remote). Never push to `origin` (Rensog878/campaign).
   - `git push thabaal Madhu_changes`, then main: `git push thabaal Madhu_changes:main`. Fast-forward only, **never force-push**.
2. **Commit identity and message.** Commit as `git -c user.name="Rensog878" -c user.email="stephane17081999@gmail.com" commit -m "..."`. End every message with:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01RKceJsb2iBeY7bqbAzkcnb
   ```
3. **Stage only our own files.** **Never stage:**
   - `scripts/check_*.mjs` and the other untracked `scripts/*.mjs`;
   - `scripts/inspect_templates.js`;
   - **`scripts/vercel_env_output.txt`** (may contain secrets);
   - `.tmp-ui/`;
   - `public/uploads/`.
   Stage files by name; never use `git add -A`.
4. **Never print, log or commit `.env`** or any token.
5. **Database changes must be additive.** Each one is an SQL file in `prisma/sql/`, safe to run twice, listed in `scripts/db-additive.mjs`. **Never `prisma db push` against live.**
6. **Live tests:**
   - Only with the owner's number +91 87786 13372.
   - Campaigns only to an audience that contains just him.
   - Name records "TEST" and delete them afterwards.
   - Put any settings you change back as they were.
   - **Never message real Thenan customers.**
7. **Pricing rules (don't change):**
   - ₹60 default shipping.
   - Loyalty: 1 point per ₹100; +50 for a repeat order; 100 points = ₹50; redeem from 50 points in ₹25 steps, max ₹250.
8. **Don't delete `.next`.** The owner's `next dev` uses `.next/dev`. Build with `npx next build` and use `run-all.ps1 -NoBuild`.
9. **The owner prefers** plain, specific words on screen (no slogans or filler), and real data everywhere (no dummy values).

---

## 3. What was done earlier (already committed and live)

Commits on main up to `9dbf76a`, live and READY on Vercel:

- **Parity run** against the sample `thabaal-portal (1).html`: look and function, live data, no duplicates. Extras kept, such as the multi-order dropdown. Notes are in `docs/qa/PARITY-HANDOFF.md`.
- **Reports** follow the app's light/dark switch.
- **Brand wordmark:** the drawn "thabaal" logo images (`/brands/thabaal/w-day.png`, `w-night.png`).
- **Type levels:** Baloo Thambi 2 for page titles and section headings (`--title`); DM Sans for the rest.
- **Sign-in page:** the legal links appear once, in a single footer line.
- **Packing list turned off.** It is commented out, not deleted, and `/dashboard/orders/packing` redirects to `/dashboard/orders?show=topack`.
- **Smooth scrolling:** 60 fps on every page; the chart library loads while the page is idle.
- **Public pages:** tap targets at least 40px on phones.

---

## 4. Live test results so far (18 Oct, 07:30–08:40)

### Webhooks: working
- **Incoming orders arrive.** RG-1028 came in at 07:32 today from the owner's catalogue cart.
- **Payment updates arrive.** RG-1019 (₹61) and RG-1020 (₹2) were marked paid by Meta on 11 Oct.
- **Message statuses update.** The Message log shows 91 Read, 24 Delivered and 20 Failed, with real reasons.
- **Calls are logged.** The Calls page lists calls from +91 87786 13372.

### Order flow: in progress, RG-1028
- ₹61, 1 × Black Cumin oil 50ml (the catalogue price is ₹1, plus ₹60 shipping).
- **Confirmed** from Orders. The toast said "Order updated on STEPHAN EZHUMALAI's WhatsApp order card". The payment link had already gone out at 07:32.
- **Waiting for the owner to pay ₹61 on his phone.** At 08:40 it was still "₹61 not received yet".
- **Next:**
  - Check that it turns Paid by itself (payment webhook).
  - Then Packed, Dispatched, Delivered from the order card.
  - At each step, check the WhatsApp message he receives, the Timeline, Payments ("Received today") and Reports.
- **Opened and closed without changes:** More actions › Edit order (the dialog shows correct items and ₹60 shipping) and Timeline.

### Campaign test: in progress
- **Audience "TEST only Stephan"** (Customers › Audiences). Filter: area contains "Sunami"; it has 1 customer, verified.
- **Campaign "TEST campaign (only Stephan)"**, id `cmvd8wi010003jk078jwyo0vg`, URL `/dashboard/campaigns/cmvd8wi010003jk078jwyo0vg`:
  - Template `thenan_brand_intro` (marketing, approved); default number. Scheduled once: Sun 18 Oct, 10:00 AM.
  - **Pause:** "Campaign paused. Paused: nothing scheduled". Works.
  - **Resume:** "Campaign resumed. Next send Sunday 18 Oct, 10:00 AM". Works.
  - **Send now:** "Started: 1 customers queued, 100 every 10 min." at about 08:37. The scheduler sends queued batches every few minutes.
  - **To check next:** the run's status on the campaign page (Sent → Delivered → Read) and the Message log row.
  - **Note:** at 08:03 a "Thenan doorstep vehicle flyer" message to his number failed with "Sending faster than Meta allows for this number". That is Meta's limit on messages to the same person. Marketing to the same person can also be held by Meta ("held back because the customer gets many"). Neither is an app bug.
- **Still to test:** edit the campaign (name or time), delete it (in-app confirm dialog), then delete the audience.

### Live data the owner should know about (not bugs; tell him)
- **Black Cumin oil 50ml is priced ₹1** in the live WhatsApp catalogue, probably set for payment tests.
- **Test customers exist:** "Test recipient", "Test recipient 2" and "Stef".
- **Delivered but unpaid:** RG-1001, RG-1002 and RG-1010 are marked delivered with no payment request or record (₹720, Payments › To collect).
- **Stale scheduled campaign:** "Testing" (vip tag, 2 people) is scheduled Thu 22 Oct, 9:38 AM.
- **Bad imported name:** a customer called "(name unclear)" came from an order-sheet import.
- **Phone numbers missing:** 30 customers from order sheets need a phone number.

---

## 5. Code changes made in this session: NOT committed, NOT pushed, NOT live

Branch `Madhu_changes`, 37 tracked files changed plus these new ones:
- `prisma/sql/2026-10-18-order-step-times.sql`
- `src/lib/preview-customer.ts`
- `tests/qa/layout-check.mjs`
- `tests/qa/layout.mjs`
- `docs/qa/LIVE-TEST-HANDOFF.md`

`npx tsc --noEmit` passes. The last QA build came before the final copy edits: **rebuild before committing.**

### 5.1 Layout bugs (owner's screenshot and the new layout checker)

| Problem | Fix | File |
|---|---|---|
| Template editor "Buttons" card: description squeezed to one letter per line (owner's screenshot). Any card header with a wide row of buttons had this. | Title block keeps `min-w-[min(14rem,100%)]` (9rem on phones) with `basis-56`; header always wraps, so the buttons move under the title. | `src/components/ui.tsx` (CardHeader) |
| Template editor at 1024–1279: category cards ("Marketi ng") and "Template name" label squeezed; the hint overlapped "Language". | Form and preview side by side only from `xl` (1280). The form column is a `@container`; inner grids use `@md:`/`@lg:` container variants instead of `sm:`. The preview aside is sticky only at `xl`. | `src/app/dashboard/templates/template-editor.tsx` |
| Phone top bar: EN/தமிழ் pair covered the business name ("QA T…"; at 320px fully hidden). | New `LanguageToggle` (one 40px button for the other language) under `sm`; the pair stays from `sm`. Business name hidden under 360px. | `src/lib/i18n/language-switch.tsx`, `src/app/dashboard/layout.tsx` |
| Customer profile at 1024: "Redeem 100 pts" button overlapped "Send offer on WhatsApp". | Loyalty and offer columns side by side only from `xl`; `min-w-0`. | `src/app/dashboard/customers/[id]/purchase-journey.tsx` |
| Payments › All transactions on phones: dates broke into four lines ("18 / Oct, / 8:15 / AM"), refs into two. | `.tw td:first-child, td:nth-child(2), td.num { white-space: nowrap }`; the table scrolls sideways instead. | `src/app/dashboard/portal.css` |
| Priority chats at 320px: "Catalogue" button touched the card edge. | Row action group wraps and aligns right. | `src/app/dashboard/replies/priority/priority-board.tsx` |
| Raw phone digits ("918778613372") in the customers list, intelligence hub and spend card. | `formatPhone()` gives "+91 87786 13372". | `customers-board.tsx`, `intelligence-hub.tsx`, `spend-card.tsx` |

### 5.2 Dummy, empty or wrong data

| Problem | Fix | File |
|---|---|---|
| Template previews everywhere said "Hi **Priya Sharma**" (a made-up customer). | New `previewCustomer(clientId)`: the business's most recently updated, reachable customer. Falls back to the sample only when there are no customers. The examples sent to **Meta for review** still use the sample, so no real data goes to Meta. | `src/lib/preview-customer.ts`; templates `page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `template-editor.tsx` (`previewFor` prop) |
| New template opened pre-filled with a coffee-shop offer ("This week's special ☕ … 20% off … Interested"). | Starts blank: header NONE, body empty, footer "Reply STOP to unsubscribe", no buttons. | `templates/new/page.tsx` |
| Reports › Wallet showed "**₹0 Low balance** … about 0 messages. Top up soon" for Thenan, which Meta bills directly. Code had made-up fallbacks: balance `1500 - spent`, marketing/utility split 75/25, cost per message ₹0.86. | `wallet.synced` flag (true only when Meta's prepaid balance is known, the same rule as Home). Not synced: shows "Spent this month" and "Meta bills you directly…". Fallbacks removed (0, and the cost line is hidden when 0). | `src/lib/reports-data.ts`, `src/app/dashboard/report/report-dashboard.tsx` |
| Settings › WhatsApp billing "Balance —". | Shows "On Meta / Meta bills you directly" when there is no known prepaid balance. | `src/app/dashboard/settings/page.tsx` |
| Order Timeline showed "Confirmed: **Done**", "Dispatched: Done", "Delivered: Done", with no times. | New columns `Order.confirmedAt`, `dispatchedAt`, `deliveredAt`, stamped by a **Postgres trigger** on status change, so every code path is covered (portal, webhook, sheet sync). Moving an order back clears the later times. Old orders still show "Done". Tested on the QA database: CONFIRMED → c; DISPATCHED → c,d; DELIVERED → c,d,v; back to CONFIRMED → c only; NEW → none. | `prisma/sql/2026-10-18-order-step-times.sql`, `prisma/schema.prisma`, `scripts/db-additive.mjs` (listed), `tests/qa/serve.mjs` (applies it to QA), `orders/page.tsx`, `orders/order-card.tsx` |
| Notifications: failed-message alerts wore an amber "**Ringing**" badge; one failure showed twice (summary plus a row). | Badge reads "Needs attention" (calls keep "Ringing"). One failure gives one named row; several give one summary row that names the customers. | `src/app/dashboard/notifications/page.tsx` |

### 5.3 Broken links and filters

| Problem | Fix | File |
|---|---|---|
| Links to `/dashboard/orders?show=unpaid`, `?show=verify`, `?show=refund` (from Home "Chase", "customers say they paid", "refunds due", Reports, Products) **showed all orders**: the list ignored those values. | Filters added. **unpaid:** not cancelled, not paid, not COD. **verify:** payment claimed, not paid. **refund:** cancelled, paid, not refunded. A removable chip ("Not paid yet ×" etc.) shows the active filter. | `src/app/dashboard/orders/orders-view.tsx` |
| The "Paid / COD" chip showed the count of paid orders but opened "To pack". | Opens "paid". | `orders-view.tsx` |
| `/dashboard/orders?product=<name>` (from Products) was ignored. | Used as the search text. | `src/app/dashboard/orders/page.tsx` |

### 5.4 Copy: filler slogans removed, grammar fixed

| Where | Before → after |
|---|---|
| Home sub-heading | "Here is today, in plain words." → "Orders, payments and chats that need you today." (Tamil too) |
| Home daily brief | "Plain-language advice for today…" → "What to do first today, worked out from your live numbers." |
| Home Reorder reminder | "Off" + pill "Off" (shown twice) → "No reminders going out" + pill "Off" |
| Home callout | "1 customer say they paid" → "1 customer says they paid" |
| Loyalty "How points work" | "The rule thabaal uses for every customer, in plain words." → "Earn on every order, save on the next bill. The same rules for everyone." |
| Reports | "How WhatsApp charges, in plain words" → "How WhatsApp charges for messages" |
| Guide | "A map from the old menu to the new pages." → "Where every feature lives in the new menu." |
| Message log | "Tap Failed chip to inspect" / "Zero delivery errors" → "Tap Failed to see why" / "No delivery errors" |
| Priority chats | "Windows healthy" → "No window closing soon" |
| Settings billing | "…The simple version is in Reports." → "…The day-by-day breakdown is in Reports." |
| Template editor AI box | "Diwali silk saree 20% off, or ST Courier…" → "e.g. a Deepavali offer, or an order dispatched update" |
| Audience builder | Placeholders "silk sarees…Chennai", "rice, coffee, saree…" and "Repeat buyers in Chennai" → neutral Madurai and catalogue wording. "1 customers now" → "1 customer now". |
| Audiences empty state | "Build one on the left…" (wrong on phones) → "Build one with the filters, or start from a preset." |
| Campaign form, campaign page, start toast | "1 customers" → "1 customer" |
| Refills | "from 1 repeat buyers" → "1 repeat buyer"; "usually ₹83.43" → "usually ₹83" |

New Tamil phrases are in `src/lib/i18n/phrases-ta.ts`.
**Still to check:** whether a `"customer"` key exists there. `tr("customer")` falls back to English if it doesn't, so add `"customer": "வாடிக்கையாளர்"` if missing.

### 5.5 Build reliability

`scripts/db-additive.mjs` now retries each SQL file up to 3 times (4 s, then 8 s). One production deploy earlier
(`dpl_4wruM8wcchut1g5WfeEwXEDyS9gk`) failed at this step on a dropped connection; a redeploy fixed it.

### 5.6 New QA tools

- **`tests/qa/layout-check.mjs`** exports `layoutIssues({ scope })`, which runs in the page.
  - **What it reports:** sideways scroll; overlapping text or controls (per text line, ignoring parts hidden by scroll or clip, and pinned bars); squeezed text (12+ characters in a column under 60px that is over 4 lines tall); content within 6px of a card edge; stat tiles in one row with different heights; dialogs wider than the screen.
- **`tests/qa/layout.mjs`** runs those checks across:
  - **Routes (27):** Home; Orders; Payments and its All tab; Customers with its groups and loyalty tabs, plus a customer profile; Audiences; Grow; Refills; Catalogue and its demand view; Templates (list, new, first detail page); Campaigns (list, new, compare, first detail page); Messages; Chats; Priority; Calls; Notifications; Reports; Settings; Guide.
  - **Sizes (16):** 320×640, 360×740, 375×667, 390×844, 414×896, 430×932, 600×960, 768×1024, 820×1180, 1024×768, 1280×800, 1366×768, 1440×900, 1536×864, 1920×1080 and 2560×1440.
  - **Options:** `sizes=`, `routes=`, `themes=dark`, `langs=ta`. `SELFTEST=1` breaks one card on purpose to prove the checks catch it.
  - **Output:** `.git/qa-layout.json`. Summarise it with `node .git/laysum.mjs .git/qa-layout.json`.
- **`tests/qa/sweep.mjs`** (the click-every-button sweep) now screenshots every dialog or sheet a click opens to `.qa-shots/sweep/<width>/`, layout-checks it, then closes it.
  - `size=390x844` gives a phone run; the default is 1366×900.
  - Output: `.git/qa-sweep-<width>.json`.

### 5.7 Last QA results (build before the final copy edits)

- **payments:** 14/14.
- **payments-ui:** 12/12.
- **crud:** 9/12.
  - **Fails:** Templates create, edit, delete. The new blank template had header TEXT with empty text, so Save stayed disabled.
  - **Fixed since:** the header is now NONE. **Re-run to confirm 12/12.**
- **Layout matrix:** 448 screens. The last 9 findings were date cells, the Redeem overlap and the Priority button, all fixed since. **Re-run.**
- **Not run on the newest build:** crawl-desktop, crawl-phone, visual, sweep. Run them.

---

## 6. Ideas noticed but NOT done yet

1. **Campaign template picker.**
   - It shows raw names (`order_cancelled`) where everywhere else shows friendly names (`templateLabel` in `src/lib/plain-error.ts`).
   - It **defaults to `order_cancelled`** (a utility order template) for a new campaign. Default to the first approved **marketing** template instead.
2. **"Confirmed sales" means two different things.**
   - Home (`overview-screen.tsx`, `isBought`) counts only paid, dispatched or delivered orders.
   - Reports and loyalty (`business-reports.ts`, `loyalty.ts`) also count CONFIRMED orders.
   - Make them match. Suggestion: count CONFIRMED only when the order is COD or cash.
3. **Three "unpaid" totals with different scopes.**
   - Home "Unpaid carts" is ₹786 (orders from the last 7 days).
   - Payments "Money to collect" is ₹1,886 (all).
   - Reports "Money waiting" is ₹380 (ordered after a message, this month).
   - The labels should say the scope: Home sub "last 7 days"; Reports sub "Ordered after a message, not paid".
4. **Orders "From" filter:** "chat" and "catalogue" use the same test (`waMessageId`).
5. **Audience builder:** the form keeps its values after "Save audience". Consider clearing it.
6. **Customer profile:** the "Standing orders" label under the Orders count reads oddly; consider "Not cancelled". The average order shows "₹83.43"; consider rounding.

---

## 7. QA how-to (on the owner's computer)

```powershell
cd C:\Users\step1\OneDrive\Desktop\cupnsaucer\whatsapp-portal
# 1. stop the QA app (it locks Prisma's engine file)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'qa\\serve|qa/serve|start -p 3200' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# 2. generate, type-check, build (never delete .next)
npx prisma generate
npx tsc --noEmit -p .
cmd /c "npx next build > .git\qa-build.log 2>&1"; "build exit $LASTEXITCODE"
# 3. start the QA app (private Postgres on 5434, seeded "QA Test Shop", real keys blanked) and run the suites
powershell -File tests/qa/run-all.ps1 -NoBuild            # payments, payments-ui, crud, crawl x2, visual
node tests/qa/qa-login.mjs                                # refresh QA logins (manager@qa.test / qa-test-123)
node tests/qa/layout.mjs > .git/qa-layout.log 2>&1; node .git/laysum.mjs .git/qa-layout.json
node tests/qa/sweep.mjs size=390x844 ; node tests/qa/sweep.mjs
node tests/qa/scroll-fps.mjs                              # 60 fps check
```

QA app: http://localhost:3200. Its state, with ids and tokens, is in `.git/qa-state.json`.
The QA shop has no WhatsApp connection on purpose, so nothing reaches Meta.

---

## 8. Helper scripts (in `.git/`, not committed; recreate them if missing)

- **`rep.mjs <spec>`** applies exact text replacements. Spec format:
  ```
  @@@ path/to/file.tsx          (or "@@@ path x2" for two matches; NOT "[x2]", which is silently skipped)
  <<<
  old text
  ===
  new text (may be empty)
  >>>
  ```
- **`show.mjs file:a-b`** prints lines a to b of a file.
- **`shot.mjs <route> <WxH> <out.png> [clipH] [theme] [scrollY]`** takes a QA screenshot as the manager.
- **`laysum.mjs <json> [skipRegex]`** groups layout findings.
- **`trig.mjs`** exercises the order step-time trigger on the QA database.
- **`copyscan.mjs [regex]`** scans `src` for sub-headings and descriptions, used to hunt filler copy.

---

## 9. What to do next, in order

1. **Make the work safe.**
   - Rebuild and run QA (section 7). Fix anything that fails.
   - Add the `"customer"` Tamil phrase if missing (5.4).
2. **Commit on `Madhu_changes`** (rules in section 2):
   - Stage by name: the 37 modified files from `git status`, plus `scripts/db-additive.mjs`, `prisma/sql/2026-10-18-order-step-times.sql`, `src/lib/preview-customer.ts`, `tests/qa/layout-check.mjs`, `tests/qa/layout.mjs` and `docs/qa/LIVE-TEST-HANDOFF.md`.
   - **Do not stage** `scripts/vercel_env_output.txt`, `scripts/inspect_templates.js`, `scripts/check_*.mjs`, `.tmp-ui/` or `public/uploads/`.
   - Suggested message: "Live test fixes: no dummy data, order step times, working order filters, layout at every size".
3. **Push** to thabaal26/thabaal only: `git push thabaal Madhu_changes`, then `git push thabaal Madhu_changes:main`.
4. **Watch the deploy** with `mcp__Vercel__list_deployments` (projectId above).
   - If it shows ERROR, redeploy: `create_deployment` with `requestBody: { name: "thabaal", deploymentId: "<failed id>", target: "production" }`.
   - Once READY, check on live:
     - Template previews show a real customer.
     - Reports › Wallet shows "Spent this month", not ₹0.
     - Settings billing shows "On Meta".
     - Home "Chase" opens "Not paid yet".
     - New status changes show times in the Timeline.
     - The phone top bar shows the shop name.
5. **Finish the order RG-1028** after the owner pays: check Paid by webhook, then Packed → Dispatched → Delivered, checking each WhatsApp message, Payments and Reports. If he can't pay, use "Mark paid" (UPI) as the test, then continue.
6. **Finish the campaign test:**
   - Check the "Send now" run (Sent, Delivered, Read).
   - Edit the campaign, then delete it.
   - Delete the "TEST only Stephan" audience.
7. **Remaining add/edit/delete tests on live** (TEST records only, the owner approved these):
   - **Customer:** edit STEPHAN's details (e.g. add tag "test"), then undo.
   - **Loyalty:** on STEPHAN, add +50, check the history and the told-customer message, then redeem or remove 50.
   - **Product:** add "TEST product" to the Meta catalogue (₹1), edit its price, delete it. Check it disappears in Commerce Manager.
   - **Template:** create `test_template_<date>` (utility), submit to Meta, see the status update after Sync, then delete it.
   - **Settings:** flip one toggle (e.g. order steps), save, check, put it back.
8. **Clean up and report.** List every TEST record deleted and every setting restored, then send the owner a short summary with the live data notes from section 4.
9. **If time allows:** the "ideas noticed" in section 6.
