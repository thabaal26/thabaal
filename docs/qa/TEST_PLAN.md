# Thabaal: test plan

## 1. Scope

The whole Thabaal portal on branch `Madhu_changes`: all 34 pages, 14 API routes, 113 server actions, the 18-model
database, the four roles (admin, manager, staff, viewer) plus a second business for isolation, and the integrations
listed in [`PROJECT_INVENTORY.md`](PROJECT_INVENTORY.md) §7. Out of scope: the `mobile/` folder (not part of the web
app), Meta's and Google's own services (only Thabaal's side of each integration is tested), physical devices.

## 2. Environments

| Environment | What runs there | Data |
|---|---|---|
| **QA app** (`node tests/qa/serve.mjs`) | production build on `localhost:3200`, its own Postgres (port 5434, `.qadb/`), seeded "QA Test Shop" + "QA Other Shop" | fake customers (`91999000xxxx`); every real key blanked, so nothing reaches WhatsApp, Meta, Sheets, AI or storage |
| **Unit/HTTP test DB** (`node tests/run.mjs`) | node test runner against a throw-away Postgres (embedded locally, a service container in CI) | created and dropped per run |
| **CI** (GitHub Actions `Checks`) | type check, lint, build, unit + HTTP isolation tests on every push | throw-away Postgres |
| **Live** (www.thabaal.in) | read-only checks, and live tests only with the owner's number +91 87786 13372 on records named TEST, deleted afterwards | real; never touched destructively |

## 3. Tools

Node's test runner + tsx (unit/integration), Playwright (`playwright-core`) driving Chromium (browser suites),
axe-core (accessibility), Chrome DevTools Protocol (CPU/network throttling and timing), `fetch` (API), Prisma (setup
and assertions on the QA database). No new runtime dependencies are added to the app; the browser tools are installed
outside it and found through `PW_CORE`, `CHROME_PATH` and `AXE_PATH`.

## 4. Test types and where they live

| ID prefix | Type | Suite | What it proves |
|---|---|---|---|
| UNIT | unit + DB integration | `tests/unit/*.test.ts` | pricing, loyalty, payment state machine, templates, tenancy, i18n, CRUD rules |
| ISO | HTTP isolation | `tests/http/isolation.mjs` | no page or route of one business shows another's data |
| GUARD | authorisation | `tests/qa/action-guards.mjs` | every server action refuses roles that may not use it |
| API | API contract, auth, sessions, uploads | `tests/qa/api.mjs` | status codes and bodies for every route; forged, expired, `alg:none` and revoked sessions; upload type checks |
| PAY | payment integration | `tests/qa/payments.mjs` | signed webhooks: paid, part paid, failed, duplicate, out of order, other currency, other business |
| PAYUI | payment E2E | `tests/qa/payments-ui.mjs` | money buttons in the browser: verify claim, part pay, COD, refund, undo |
| CRUD | functional E2E | `tests/qa/crud.mjs` | create → read → edit → delete for customers, templates, campaigns, audiences, products, with permission checks |
| CRAWL | smoke + regression | `tests/qa/crawl.mjs desktop|phone` | every page × every role loads without errors, sample data, wrong values, leaks or sideways scroll; every internal link followed |
| VIS | visual regression | `tests/qa/visual.mjs` | 24 routes × sizes × light/dark × English/Tamil screenshots; off-screen, clipped, untranslated |
| LAY | responsive layout | `tests/qa/layout.mjs` | overlap, squeezed text, edge spacing, uneven tiles, sideways scroll, oversized dialogs at the 14 required viewports |
| SWEEP | interaction | `tests/qa/sweep.mjs` | presses every button; each dialog opens, fits, closes |
| A11Y | accessibility | `tests/qa/a11y.mjs` | axe WCAG 2.x A/AA rules, visible keyboard focus, Escape closes dialogs |
| XSS | security | `tests/qa/xss.mjs` | HTML/script in customer, chat, order, campaign and audience fields is shown as text and never runs |
| PERF | performance | `tests/qa/perf.mjs` | TTFB, FCP, LCP, CLS, TBT, JS and total bytes, repeated requests; laptop and throttled phone |
| BUILD | build health | `tsc`, `eslint`, `next build`, `npm audit` | compiles, lints, builds; dependency advisories |
| LIVE | live smoke | built-in browser on thabaal.in | deployed fixes visible; read-only |

The full matrix with one row per test case is [`TEST_CASES.csv`](TEST_CASES.csv).

## 5. Required viewports

320×568, 360×800, 375×812, 390×844, 414×896, 430×932, 600×960, 768×1024, 1024×768, 1280×720, 1366×768, 1440×900,
1600×900, 1920×1080 (layout suite, every route). The crawl runs at 1366×860 and 390×844; the visual matrix at five
representative sizes. These are browser viewports in Chromium, not physical devices.

## 6. Test data

Seeded by `tests/qa/seed.mjs` on every QA start: QA Test Shop (manager, staff, viewer logins), QA Other Shop (its own
manager), an admin, customers and orders in every payment state, chats, templates, a campaign. Tests that add data
name it "TEST"/"Zz…" and delete it. Logins for a normal browser: `manager@qa.test` / `qa-test-123` after
`node tests/qa/qa-login.mjs`.

## 7. Priorities

1. Money: order and payment flows, webhooks, refunds, loyalty arithmetic (P0 if wrong).
2. Security: authorisation, cross-business isolation, sessions, uploads, XSS (P0/P1).
3. Sending: campaigns, templates, replies, rate limits (P1).
4. Every page at every viewport: no clipping, overlap, sideways scroll (P2 unless a task is blocked).
5. Accessibility and performance (P2/P3 unless a task is blocked).

## 8. Severity

P0 critical (app down, security exposure, money or data loss) · P1 high (major feature or integration broken, no
workaround) · P2 medium (degraded feature, substantial layout problem) · P3 low (cosmetic).

## 9. Release acceptance

Release is recommended only when: build, type check and lint pass; unit, isolation, guard, API, payment, CRUD and XSS
suites pass; crawls show no errors or leaks; no known P0, and every P1 fixed or accepted by the owner; no critical
layout defect at the required viewports; accessibility and performance findings fixed or listed; every untested area
named in [`FINAL_QA_REPORT.md`](FINAL_QA_REPORT.md).

## 10. Running it

```bash
npm ci                                   # once
npx next build                           # production build (never delete .next: next dev uses .next/dev)
export PW_CORE=/path/to/node_modules/playwright-core CHROME_PATH=/path/to/chromium AXE_PATH=/path/to/axe.min.js
node tests/run.mjs --http                # unit + isolation (own throw-away Postgres)
node tests/qa/run-all.mjs                # QA app + every browser/API suite; one line per suite, logs in .git/qa-*.log
node tests/qa/run-all.mjs --only=api,xss # a subset
node tests/qa/layout.mjs sizes=320x568,360x800,375x812,390x844,414x896,430x932,600x960,768x1024,1024x768,1280x720,1366x768,1440x900,1600x900,1920x1080
```

On the owner's Windows PC `powershell -File tests/qa/run-all.ps1 -NoBuild` still works (Chrome and playwright-core
default to the paths there).
