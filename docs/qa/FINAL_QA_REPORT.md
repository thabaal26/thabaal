# Thabaal: final QA report

**Date:** 18 Oct 2026 · **Branch:** `Madhu_changes` (thabaal26/thabaal) · **Live:** www.thabaal.in (Vercel)
**Scope:** the whole web portal: 34 pages, 14 API routes, 113 server actions, 18 data models, 4 roles plus a
second business, and its integrations ([`PROJECT_INVENTORY.md`](PROJECT_INVENTORY.md)).

## 1. Overall status

**Recommended for release** of the fixes in this run, with the owner decisions in §7 open. No P0 or P1 defect is
known to be open. Every automated suite passes on the fixed build. Open items are P2/P3: owner decisions, the
remaining Tamil strings, and live checks that need the owner.

## 2. How it was tested

A private QA copy of Thabaal (production build, its own Postgres, seeded "QA Test Shop" and "QA Other Shop", every
real key blanked so nothing reaches WhatsApp, Meta, Sheets, AI or storage), driven by Chromium. Live checks on
www.thabaal.in only with the owner's number and records named TEST. Details: [`TEST_PLAN.md`](TEST_PLAN.md).
Every row in [`TEST_CASES.csv`](TEST_CASES.csv) comes from a result file a suite wrote (`tests/qa/report.mjs`).

## 3. Results on the fixed build

| Check | Result |
|---|---|
| Type check (`tsc --noEmit`) | pass |
| Lint (`eslint .`, 455 files) | 0 errors, 0 warnings |
| Production build (`next build`) | pass |
| Dependency audit, production packages | 0 vulnerabilities (5 high in lint-only tooling, not shipped) |
| Unit + database tests (`tests/run.mjs`) | **81/81** (76 existing + 5 new) |
| Cross-business HTTP isolation | **14/14** |
| Server actions with a permission check | **115/115** |
| API, sessions, uploads, database trigger (new `api.mjs`) | **32/32** |
| Payment webhooks (signed replays) | **14/14** |
| Payment buttons in the browser | **12/12** |
| Create / edit / delete with permissions | **12/12** |
| Stored XSS in 7 fields × 11 pages × 2 sizes (new) | **22/22** |
| Crawl, 5 roles, desktop + phone | **1,302 page visits, 0 problems** |
| Layout, 28 routes × 17 viewports (all 14 required) | **476 screens, 0 findings** |
| Visual, 24 routes × 5 sizes × light/dark × English/Tamil | 480 screens, 10 findings, all one data item (a template's own name) |
| Accessibility, axe WCAG 2.x A/AA, 25 pages × 2 sizes (new) | **0 violations** (was 4 rule types on 18+ pages) |
| Performance, 12 pages × laptop + slowed phone (new) | every page within LCP/CLS/TBT targets |
| GitHub Checks on every push | green |

Totals in `TEST_CASES.csv` (from the generator): see §8.

## 4. Defects fixed in this run (14)

| ID | Sev | Defect |
|---|---|---|
| BUG-02 | P1 | Link tabs/chips used ARIA attributes links can't have (critical axe rule, 16 pages) |
| BUG-01 | P2 | Uploaded files lost their sandbox security header (site-wide header overwrote it) |
| BUG-03 | P2 | Seven text colours below 4.5:1 contrast |
| BUG-04 | P2 | Picker buttons' spoken name left out the visible choice |
| BUG-06 | P2 | Orders "From: chat" showed the same orders as "catalogue"; catalogue included campaign orders |
| BUG-07 | P2 | Order templates previewed "Hello Priya … #A1B2C" (sample word saved as the name) |
| BUG-08 | P2 | New campaigns started on the "order cancelled" utility template |
| BUG-11 | P2 | Reports invented a "return per ₹1" when no message cost was recorded |
| BUG-13 | P2 | New order / Dispatch / Receipt overlays didn't behave as dialogs (Escape, focus, role) |
| BUG-14 | P1 | A template's `{{2}}`+ with no value set was filled with the customer's name in campaign and test sends; now refused with a clear reason, and campaigns can't be saved on such a template |
| BUG-12 | P3 | Tamil mode: 63 tile/filter phrases in English (rest listed) |
| BUG-05 | P3 | Sideways-scrolling tables not reachable by keyboard |
| BUG-09/10 | P3 | Lint warning; QA suites only ran on Windows |

Full write-ups with cause, fix and regression test: [`BUG_REPORT.md`](BUG_REPORT.md).

Also done on the owner's request (CR-01): alerts moved from Home to Notifications, and payment checks shown and
confirmable in the chat.

## 5. Integrations

Inside Thabaal every path was tested for real (forms → actions → database → pages, roles, isolation, scheduler
auth, uploads, the order-timeline trigger). Meta webhooks and payments were tested by signed replays, and on live
(today's order, statuses and payments arrive). AI drafts, Google Sheets delivery and Google sign-in were not reached
(no keys in QA). Details: [`INTEGRATION_REPORT.md`](INTEGRATION_REPORT.md).

## 6. Responsive and performance

Every route at every required viewport: 0 layout findings; phone and laptop screenshots reviewed by eye.
[`RESPONSIVE_UI_AUDIT.md`](RESPONSIVE_UI_AUDIT.md). Main content appears in 0.2–0.5 s on a laptop and about 1.2 s
or less on a slowed phone, with no layout shift beyond 0.066. [`PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md).

## 7. Open items

| Item | Sev | Who |
|---|---|---|
| "Confirmed sales" counted differently on Home vs Reports/loyalty (DEC-01) | P2 | owner decision |
| Staff can refund/undo payments (DEC-03) | P2 | owner decision |
| Meta reported 130429 on three sends to the Thenan number today (EXT-01) | P2 | owner: check the number in WhatsApp Manager |
| Live templates with an unmapped `{{2}}`+ will now refuse to send until a value is set | — | owner: set values in Templates if a campaign uses one |
| ~125 Tamil strings still in English ([`tamil-gaps.tsv`](tamil-gaps.tsv)) | P3 | next pass |
| Unpaid totals' scopes unlabelled (DEC-02); `portal.css` generator out of date (DEC-04) | P3 | next pass |
| Live order RG-1028: owner paid ₹1; Meta sent no paid event (UPI Intent mode), so it waits for "Payment received: confirm" after the owner checks the UPI app | — | owner |
| Automatic payment confirmation needs Thenan's WhatsApp payment configuration on a gateway (Razorpay/PayU/Billdesk/Zaakpay); Thabaal already handles those events | P2 | owner (WhatsApp Manager) |

## 8. Untested

Firefox and WebKit; physical devices; browser zoom; network interruption in the browser; AI features; Google
Sheets delivery; Google sign-in success path; real UPI payment confirmed by Meta's webhook (proven by replay);
screen readers (axe rules only); live-site field performance.

## 9. Release recommendation

Release `Madhu_changes` to `main`. The fixes are covered by passing suites, the build and GitHub Checks are green,
and nothing open is a release blocker. Do the owner items in §7 next, starting with the "Confirmed sales" rule.
