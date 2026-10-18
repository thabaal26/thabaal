# Thabaal: project inventory

Branch `Madhu_changes` at `a0943e7` (18 Oct 2026). Built from the code itself; the per-route data and action map from
the 17 Oct QA run is in [`inventory.md`](inventory.md) and is still accurate.

## 1. What Thabaal is

A multi-business WhatsApp portal for small shops: catalogue orders arrive from WhatsApp, the shop confirms them, the
customer pays by UPI inside WhatsApp (or cash on delivery), the order is packed, dispatched and delivered, and the shop
runs template campaigns, replies to chats and tracks loyalty points. One live client today: Thenan Oils (Madurai).

## 2. Stack

| Part | What it uses |
|---|---|
| Framework | Next.js 16.4 (App Router, Turbopack builds, Server Components, Server Actions), React 19.2 |
| Language | TypeScript 5 (strict), 59,748 lines in `src/` |
| Styling | Tailwind CSS v4, `portal.css` design layer, light/dark themes, English/Tamil |
| Data | PostgreSQL (Neon on live), Prisma 6.19; 18 models; additive SQL in `prisma/sql/` run by `scripts/db-additive.mjs` on Vercel builds |
| Auth | Email + password (bcrypt, rate-limited: 5 tries per email / 20 per IP in 15 min), Google sign-in (OAuth with state cookie), HS256 JWT session cookie `wp_session` (httpOnly, SameSite=Lax, Secure in production) with a session version so "sign out everywhere" works |
| Hosting | Vercel (project `thabaal`, team thabaal26), domain thabaal.in; GitHub thabaal26/thabaal |
| Scheduler | GitHub Actions `Campaign scheduler` every 5 min → `/api/cron` (Bearer `CRON_SECRET`) |
| CI | GitHub Actions `Checks`: type check, lint, build, unit tests and the cross-business HTTP check on a throw-away Postgres |
| Charts | ECharts 6, Recharts 3, Chart.js 4 (lazy-loaded while the page is idle) |
| AI | Google Gemini / Groq (template drafts, smart replies, order parsing from chat, business copilot) |

## 3. Roles

| Role | Can do |
|---|---|
| Admin (`Role.ADMIN`) | every business; business switcher; Clients page (create businesses, numbers, users, sending rules, tokens); wallet decisions |
| Manager (`CLIENT` + `MANAGER`) | everything in their own business: campaigns, templates, customers, audiences, catalogue, orders, payments, settings, exports |
| Staff (`CLIENT` + `STAFF`) | orders and dispatch, payments, replies, Google Sheet, QR codes; not campaigns, templates, settings or exports |
| Viewer (`CLIENT` + `VIEWER`) | read only |

Every server action checks the role on the server (`requireManager`, `requireOrderAccess`, `requireAdmin`), and every
query is scoped to the caller's business (`owned(scope)`), so one business never sees another's data.

## 4. Routes (34 pages)

| Route | Who | Purpose | Main actions |
|---|---|---|---|
| `/` | public | sign-in landing (redirects signed-in users to `/dashboard`) | — |
| `/login` | public | email/password and Google sign-in, five-step product story | `login` |
| `/about`, `/privacy`, `/terms` | public | company and legal pages | — |
| `/dashboard` | all | Home: today's orders, money to collect, chats, daily brief, reminders | links |
| `/dashboard/orders` | all (staff+ act) | order list with steps New → Confirmed → Paid/COD → Packed → Dispatched → Delivered; filters `show=`, `q=`, `product=` | confirm, request payment, mark paid, part pay, COD, refund, undo, edit items, address, notify, create order |
| `/dashboard/orders/packing` | — | turned off: redirects to `/dashboard/orders?show=topack` | — |
| `/dashboard/revenue` | all | Payments: to collect, received, claims to verify, all transactions | verify claim, request payment, record payment |
| `/dashboard/customers` (+ `?tab=groups`, `?tab=loyalty`) | all (manager edits) | customer list, groups, loyalty | save, import, tag, opt out, delete, export CSV |
| `/dashboard/customers/[id]` | all | profile, purchase journey, loyalty history, offer on WhatsApp | adjust points, redeem, send |
| `/dashboard/customers/audiences` | manager | saved audiences and filters | save, delete, count |
| `/dashboard/customers/fields` | manager | custom customer fields | save |
| `/dashboard/customers/grow` | staff+ | QR codes and join links | — |
| `/dashboard/customers/sheet` | staff+ | Google Sheet link and sync | save links, test, sync now |
| `/dashboard/refills` | all | customers due a refill | send nudge |
| `/dashboard/catalogue` (+ `?view=demand`, `/combos`) | manager | Meta catalogue products, demand view, combos | create, edit, delete product, image, send catalogue |
| `/dashboard/templates` (+ `new`, `[id]`) | manager | Meta message templates | save, submit, sync, delete, test send, default image |
| `/dashboard/campaigns` (+ `new`, `[id]`, `compare`) | manager | scheduled template campaigns | save, pause/resume, send now, test, duplicate, cancel run, delete |
| `/dashboard/messages` | all | message log with statuses and failure reasons | export CSV |
| `/dashboard/replies` (+ `priority`) | staff+ | customer chats, 24-hour window board | reply, mark handled |
| `/dashboard/calls` | staff+ | WhatsApp calls | answer, reject, hang up, start |
| `/dashboard/notifications` | all | alerts (failed messages, calls, claims) | links |
| `/dashboard/report` | all | Reports: sales, payments, messages, wallet/spend | — |
| `/dashboard/wallet` | manager/admin | prepaid wallet and recharges | request, decide, adjust |
| `/dashboard/settings` | manager | account, appearance, WhatsApp provider, order steps, refill/win-back rules, billing | many |
| `/dashboard/clients` | admin | businesses, numbers, users | many |
| `/dashboard/guide` | all | where each feature lives | — |

## 5. API routes (14)

| Route | Method | Access | Notes |
|---|---|---|---|
| `/api/webhook` | GET | Meta verify token | echoes `hub.challenge` |
| `/api/webhook` | POST | HMAC `x-hub-signature-256` with `META_APP_SECRET` | messages, statuses, payments, calls, orders |
| `/api/waha/webhook` | POST | `?key=` per install | WAHA (WhatsApp Web) provider events |
| `/api/cron` | GET/POST | `Authorization: Bearer CRON_SECRET` | dispatcher: due campaigns, batches, reminders; `?probe=key` reports the key fingerprint only |
| `/api/calls`, `/api/notifications` | GET | signed in | JSON for the call widget and bell |
| `/api/customers/export` | GET | managers | CSV with the Customers page filters |
| `/api/messages/export` | GET | signed in | CSV of the message log |
| `/api/upload` | POST | managers | JPG/PNG/WebP/PDF ≤ 4 MB, magic-byte checked |
| `/api/upload/[id]` | GET | public by design (Meta must fetch template images) | served with `nosniff` and a sandbox CSP |
| `/api/media/[id]` | GET | signed in, own business | streams a customer's photo or voice note from Meta |
| `/api/manifest/[clientId]` | GET | public | PWA manifest |
| `/api/session/clear` | GET | — | clears the cookie, back to `/login` |
| `/api/auth/google`, `/callback` | GET | — | Google OAuth with state check |

## 6. Data model (18 models)

Setting, Client, WhatsAppNumber, User, Customer, PendingCustomer, Template, Campaign, CampaignRun, Message, Reply,
Order, Audience, Call, TopUp, WalletEntry, LoyaltyEntry, LoginAttempt. Plus `PortalUploadedImage` (raw SQL) and the
Postgres trigger that stamps `Order.confirmedAt / dispatchedAt / deliveredAt` on status changes.

## 7. External integrations

| Service | Used for | How QA treats it |
|---|---|---|
| Meta WhatsApp Cloud API | sending templates and replies, catalogue, payments (order_details), calls | QA app has no token: sends are refused with a clear message; inbound webhooks are signed locally and replayed |
| Meta Commerce catalogue | products | QA shows the demo catalogue (no connection) |
| WhatsApp payments (UPI) | payment links and paid/failed webhooks | webhook replays with HMAC (payments.mjs) |
| WAHA | alternative WhatsApp Web provider | key check only |
| Google Sheets (Apps Script webhook) | order sheet sync | unit tests with a fake webhook URL |
| Google OAuth | sign in | "not configured" and forged-state paths |
| Gemini / Groq | AI drafts | keys blank in QA: AI buttons show their "not configured" message |
| Vercel Blob | image storage when configured | QA stores uploads in Postgres (fallback path) |

## 8. Critical workflows

1. Catalogue cart on WhatsApp → order created (webhook) → confirm → payment link → paid webhook → Paid → packed →
   dispatched → delivered, with a WhatsApp update at each step and the Timeline stamped.
2. Manual order → payment request / cash on delivery / part payments → refund or undo.
3. Customer claims "I paid" in chat → staff verify → Paid.
4. Template create → submit to Meta → approved (sync) → campaign to an audience → batches by the scheduler → statuses.
5. Loyalty: 1 point per ₹100, +50 on repeat orders, redeem from 50 points in ₹25 steps, max ₹250; 100 points = ₹50.
6. Chats: reply inside the 24-hour window, priority board, mark handled.
7. Roles and isolation: staff/viewer limits; another business never sees this one's data.

## 9. Existing automated tests (before this run)

| Suite | What | Size |
|---|---|---|
| `tests/unit/*.test.ts` (node test runner + tsx, real Postgres) | orders, payment workflow, loyalty, points wallet, templates, tenancy, i18n, CRUD | 76 tests |
| `tests/http/isolation.mjs`, `rehearsal.mjs` | cross-business HTTP isolation; webhook rehearsal | |
| `tests/qa/action-guards.mjs` | every server action has a permission check | 115 actions |
| `tests/qa/payments.mjs` | payment webhooks: signature, duplicates, order, amounts, currency, other business | 14 |
| `tests/qa/payments-ui.mjs` | payment buttons in the browser | 12 |
| `tests/qa/crud.mjs` | create/edit/delete + permissions in the browser | 12 |
| `tests/qa/crawl.mjs` | every page × 5 roles, every internal link, desktop and phone | ~683 visits each |
| `tests/qa/visual.mjs` | 24 routes × 5 sizes × light/dark × en/ta | 480 screens |
| `tests/qa/layout.mjs` | overlap, squeezed text, edge spacing, sideways scroll at 16 sizes | 448 screens |
| `tests/qa/sweep.mjs` | presses every button, screenshots each dialog | |
| `tests/qa/scroll-fps.mjs` | scroll smoothness | |

Gaps against the master QA prompt, filled in this run: API status/auth/session tests (`api.mjs`), stored-XSS test
(`xss.mjs`), automated accessibility with axe-core plus keyboard focus (`a11y.mjs`), page-load performance
(`perf.mjs`), the prompt's 14 exact viewports, and a cross-platform runner (`run-all.mjs`; `run-all.ps1` is Windows-only).

## 10. Baseline (18 Oct 2026, cloud Linux workspace)

| Check | Result |
|---|---|
| `tsc --noEmit` | pass, 0 errors |
| `eslint .` (455 files) | 0 errors, 1 warning (unused eslint-disable in `src/app/app-icon.tsx`) |
| `npm audit --omit=dev` (production dependencies) | 0 vulnerabilities |
| `npm audit` (all) | 5 high, all in lint tooling (`eslint-config-next` → `fast-glob` → `micromatch` → `braces`); not shipped to users |
| Live site | production deploy `8452d48` Ready on Vercel; GitHub `Checks` green on `main` and `Madhu_changes` |
| Initial findings | see [`BUG_REPORT.md`](BUG_REPORT.md) |
