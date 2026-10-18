# Thabaal: integration report (18 Oct 2026)

How each integration was tested, and how real the test was. **Real** = the actual code path against the actual
service or a real database. **Replay** = Thabaal's real code fed a correctly signed copy of what the service sends.
**Not reached** = the QA app has no key for the service, so only Thabaal's "not connected" handling was tested.
No mocked call is reported as a live result.

## 1. Inside Thabaal (all real)

| Path | Test | Result |
|---|---|---|
| Page → server action → Prisma → Postgres → page | CRUD suite (customers, templates, campaigns, audiences, products, orders), with reloads | 12/12 |
| Server actions → role check | `action-guards.mjs`: all 115 actions | 115/115 |
| Session cookie → every page and API | API-17…22: no login, wrong secret, expired, `alg:none`, revoked by "sign out everywhere" | all refused |
| Business scope on every query | `tests/http/isolation.mjs` (14) + crawl as the other shop's manager on every page + API-14…16 (CSV exports) + API-28 (media) | no leaks |
| Order status → Postgres trigger → Timeline times | DB-01: forward stamps, backward clears | pass |
| Duplicate order reference | DB-02: refused by the unique index | pass |
| Filters/search → query → list | crawl follows every filter, tab and link as 5 roles on desktop and phone | 651 + 651 page visits, 0 problems |
| Uploads → Postgres storage → public URL | API-24…27: refused without a manager, wrong types refused by magic bytes, PNG stored and served | pass after BUG-01 fix |
| Scheduler → `/api/cron` → dispatcher | API-01…03: secret required; live: the 10:00 TEST campaign run started on schedule | pass |

## 2. Outside services

| Service | What Thabaal does | QA test | Kind | Result |
|---|---|---|---|---|
| **Meta webhook** (messages, statuses, payments, calls) | `/api/webhook`, HMAC-SHA256 with `META_APP_SECRET` | API-04…06; payments suite (14): bad/missing signature, malformed JSON, duplicates, 5 parallel copies, out of order, wrong amount, other currency, other business's reference, replaced cart, failed then retried | Replay | all pass |
| Meta webhook on live | same | Live: RG-1028 cart arrived 07:32; statuses for today's sends arrived (failed with 130429); payments for RG-1019/1020 on 11 Oct | Real | working |
| **Meta Cloud API sending** | templates, replies, order updates, payment requests | QA: no token, so every send is refused with a clear message (by design, nothing reaches Meta). Live: TEST campaign "Send now" 08:38 and scheduled 10:00 were accepted by Meta, then failed by Meta with 130429 | Not reached in QA / Real on live | Thabaal side correct; see EXT-01 |
| **WhatsApp payments (UPI)** | payment link (order_details), paid/failed webhooks | payments + payments-ui suites (26 cases) | Replay | pass |
| Live UPI payment | RG-1028 ₹61 | waiting for the owner to pay | Real | **NOT RUN** (needs the owner) |
| **Meta catalogue** | products, images, send catalogue | QA shows the demo catalogue; CRUD of products via the demo store | Not reached | demo path passes |
| **WAHA** (WhatsApp Web) | alternative provider | API-07: key required | Replay | pass |
| **Google Sheets** (Apps Script) | push order/campaign rows | unit tests run with a fake webhook URL: each push fails and is logged, and the order tests around it still pass | Not reached | failure handled |
| **Google sign-in** | OAuth with a state cookie | API-23: not configured → clear error; forged state → refused | Not reached | pass |
| **Gemini / Groq** (AI drafts) | template drafts, smart replies, copilot | keys blank in QA | Not reached | **NOT RUN** |
| **Vercel Blob** | image storage when configured | QA uses the Postgres fallback (API-26) | Not reached | fallback passes |
| **Vercel deploy** | build + additive SQL | GitHub Checks on every push; Vercel builds for `8452d48` (production) and `9c7e81f` (preview) | Real | Ready |

## 3. Failure and recovery

| Scenario | How | Result |
|---|---|---|
| Duplicate / repeated requests | 5 parallel copies of one payment webhook; double-click on Record payment | saved once |
| Out-of-order delivery | "failed" status after "paid" | stays paid |
| Partial failure | Google Sheet push fails during order updates (unit tests) | failure logged; order assertions pass |
| External service down | no WhatsApp token | clear refusal, nothing half-saved |
| Meta rate limit on send | dispatcher keeps the message queued and retries in 5 minutes (code review of `dispatcher.ts`); limit reported later by webhook marks the message failed with code and reason (live, today) | as designed |
| Session revoked mid-use | API-21 | refused on pages and APIs |
| Network interruption in the browser | not automated | **NOT RUN** |

## 4. Open integration risks

1. **Meta 130429 on the Thenan number** (EXT-01): three sends to the same number failed today. Check the number's
   messaging limit and quality in WhatsApp Manager before the next real campaign.
2. **AI drafts** were not exercised (no keys in QA).
3. **Live payment** RG-1028 is still unpaid; the paid-webhook path is proven by replay, not by a real UPI payment today.
4. **Preview deployments run the additive SQL** against the preview database, which may be the live one
   (`needs-owner.md` item 3); the SQL is additive and safe to repeat.
