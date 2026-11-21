# Thabaal (`whatsapp-portal`) — Full Project Context & Session Handoff

> **AUTOMATIC CONTEXT RULE**: This `GEMINI.md` file is automatically loaded by Antigravity in every session across any user account. For the standalone handoff reference, see [`HANDOFF_CONTEXT.md`](file:///c:/Users/step1/OneDrive/Desktop/cupnsaucer/HANDOFF_CONTEXT.md).

---

## 1. Local Conversation Transcripts (From Previous Account Sessions)
If you need to inspect any earlier conversation step or code diff from previous account sessions, the raw JSONL transcripts are stored locally on this machine at:
- **Active End-to-End Audit, Domain 4A & Domain 6 Turn 17 Session**: `C:\Users\step1\.gemini\antigravity\brain\1bf02987-2bcf-41de-baa1-ccab398cd951\.system_generated\logs\transcript.jsonl` (full: `.../transcript_full.jsonl`)
- **Landing Page Visibility & Heritage Footer Session**: `C:\Users\step1\.gemini\antigravity\brain\9c280eb1-afa5-42c2-80ed-c53998a891ee\.system_generated\logs\transcript.jsonl` (full: `.../transcript_full.jsonl`)
- **Previous Session Compact Transcript**: `C:\Users\step1\.gemini\antigravity\brain\322fbc6e-ce65-4054-bda4-c917d739f683\.system_generated\logs\transcript.jsonl`
- **Previous Session Full Transcript**: `C:\Users\step1\.gemini\antigravity\brain\322fbc6e-ce65-4054-bda4-c917d739f683\.system_generated\logs\transcript_full.jsonl`
- **Meta Integration Auditor Subagent Transcript**: `C:\Users\step1\.gemini\antigravity\brain\42d50663-5eaa-4d77-805e-9ea59292e49a\.system_generated\logs\transcript.jsonl`

---

## 2. Project Identity & Tech Stack
- **Repository / App Path**: `c:\Users\step1\OneDrive\Desktop\cupnsaucer\whatsapp-portal`
- **Active Working Branch**: `HomeNewUi` (Pushed to both remotes: `origin/HomeNewUi` and `thabaal/HomeNewUi`)
- **Platform Brand Name**: **Thabaal** (Multi-tenant WhatsApp Business Commerce, CRM, AI & Loyalty Platform)
- **Primary Active Tenant / Store**: **Thenan Oils** (Cold-pressed oils, Madurai / Tamil Nadu retail & D2C)
- **Framework**: Next.js 16 (App Router, React Server Components + Server Actions), TypeScript, Tailwind CSS
- **Database**: PostgreSQL (Neon) + Prisma ORM (`prisma/schema.prisma`)
- **Messaging Providers**:
  - Primary: **Meta WhatsApp Cloud API** (`src/lib/whatsapp.ts`, `src/lib/provider.ts`)
  - Secondary / Local fallback: **WAHA** (`src/lib/waha.ts`)
- **AI Engine**: **Groq Cloud Free API** (`llama-3.3-70b-versatile`) via `src/lib/ai.ts` (zero-cost fallback logic if key absent)
- **Charts & Visualization**: Apache ECharts (`src/components/echart.tsx`, `src/lib/echarts-core.ts`) + custom SVG visualizations (`src/components/viz.tsx`, `src/components/charts.tsx`)
- **Spreadsheet Sync**: 2-way Google Sheets integration (`src/lib/sheets.ts`, `src/lib/google-sheets-live.ts`)

---

## 3. Complete Database Schema (`prisma/schema.prisma`)
1. **`Setting`** (`id = 1`): Portal-wide provider (`META` | `LOCAL`), WAHA config, `lastDispatchAt` scheduler heartbeat.
2. **`Client`**: Multi-tenant business entity (`name`, `waToken`, `waPhoneNumberId`, `waBusinessAccountId`, branding colours/logos, `marketingGapHours` default 72h, `quietFrom`/`quietTo` IST quiet hours, `refillDays`/`refillTemplateId`, `lapsedDays`/`winbackTemplateId`, `sheetCustomersUrl`/`sheetOrdersUrl`, `paymentConfig` for Meta native UPI/PG checkout, `disabledSections`, `iconPack` `"hugeicons"`|`"lucide"`, `iconLook` `"3d"`|`"2d"`).
3. **`WhatsAppNumber`**: Multi-number support per client (`phoneNumberId`, `businessAccountId`, `displayPhone`, `verifiedName`, `qualityRating` `GREEN|YELLOW|RED`, `messagingTier`, `dailyCap`).
4. **`User`**: Portal logins (`Role`: `ADMIN` | `CLIENT`; `ClientAccess`: `MANAGER` | `STAFF` | `VIEWER`).
5. **`Customer`**: (`name`, `phone` E.164 digits, `tags` array — also stores manual loyalty point ledger entries as `loyalty-adj:<points>:<ts>:<reason>`, `purchases` from paper/Google sheets, `location`, `region`, `optedOut`, `optInSource`, `unreachable`, `winbackSentAt`, `callAskedAt`, `callAllowedUntil`).
6. **`PendingCustomer`**: Rows from paper/Google sheets with missing/invalid phone numbers kept separate from `Customer`.
7. **`Template`**: Meta message templates (`MARKETING` | `UTILITY` | `AUTHENTICATION`, `DRAFT` | `PENDING` | `APPROVED` | `REJECTED` | `PAUSED` | `DISABLED`, `headerType`, `body`, `buttons`, `variables`, `qualityScore`).
8. **`Campaign` & `CampaignRun`**: Scheduled (`ONCE` | `WEEKLY`) broadcasts with batching (`batchSize`, `intervalMinutes`) and automatic safety pauses (`WAITING_LIMIT`, `WAITING_QUALITY`, `WAITING_QUIET`).
9. **`Message`**: Outbound messages (`QUEUED` | `SENT` | `DELIVERED` | `READ` | `FAILED` | `SKIPPED`, `waMessageId`, `errorCode`, `pricingCategory`, `billable`).
10. **`Reply`**: Inbound customer messages (`kind`: `text` | `button` | `media` | `order`, `mediaId`, `mediaType`, `handled`).
11. **`Order`**: WhatsApp Catalogue carts & synced orders (`number` auto-increment shown as `RG-1001`, `items` JSON, `total`, `status`: `NEW` | `CONFIRMED` | `PAID` | `DISPATCHED` | `DELIVERED` | `CANCELLED`, plus full payment lifecycle fields: `paymentRequestedAt`, `paymentReminderAt`, `paidAt`, `paymentTxnId`, `paymentMethod`, `paymentSource`, `paidAmount`, `paymentClaimedAt`, `paymentClaimNote`, `paymentFailedAt`, `paymentFailReason`, `collectedBy`, `refundedAt`, `refundAmount`, `refundNote`).
12. **`Audience`**: Saved dynamic customer segmentation filters (`aud:<id>`).
13. **`Call`**: Browser-based WebRTC WhatsApp voice calls (`INCOMING` | `OUTGOING`, `RINGING` | `ANSWERED` | `ENDED` | `MISSED` | `REJECTED`, `offerSdp`, `answerSdp`, `duration`).
14. **`TopUp`**: Manual wallet top-up ledger for estimating live Meta account balance (`src/lib/meta-balance.ts`, `src/lib/spend.ts`).
15. **`LoyaltyEntry`**: Immutable append-only loyalty ledger (`customerId`, `clientId`, `delta`, `reason`, `sourceRef`, `idempotencyKey`).
16. **`SentTemplateSnapshot`**: Cryptographically verified immutable snapshot of outbound Meta templates at send time.

---

## 4. Master Architectural Audit Progress & Status (ChatGPT Lead Architect Thread)
- **Active Thread URL**: `https://chatgpt.com/c/6afed935-d278-83ee-8217-c25f486170f6`
- **Thread Title**: `Continue WhatsApp UI Architecture`
- **Lead Systems Architect Turn 20 Verdict: ALL 7 DOMAINS PASSED!**:
  1. **Domain 1 (Tenant Boundaries & Identity Tracing)**: **`PASS WITH DOCUMENTED RISKS · REMEDIATION ACCEPTED`** (Closed in commit `dd3fec0`).
  2. **Domain 2 (Orders, Checkout & Payment State Machine)**: **`PASS WITH DOCUMENTED RISKS`** (Accepted by Architect).
  3. **Domain 3 (Campaign Engine & Rate Limiting)**: **`PASS WITH DOCUMENTED RISKS`** (Accepted by Architect).
  4. **Domain 4A (Inbound Webhooks & WAHA Local Failover)**: **`PASS WITH DOCUMENTED RISKS`** (Closed in Turn 18 via `WEB-01` and `WEB-04`).
  5. **Domain 5A (AI & Copilot Integration)**: **`PASS WITH DOCUMENTED RISKS`** (Accepted by Architect).
  6. **Domain 5B (Customer Intelligence, RFM Matrix & Loyalty Engine)**: **`PASS WITH DOCUMENTED RISKS · ACCEPTED`** (Closed via `LOY-01..03` in commit `cfa042b`).
  7. **Domain 6 (Analytics, Google Sheets 2-Way Sync & Spend Reporting)**: **`PASS WITH DOCUMENTED RISKS · ACCEPTED`** (Closed in Turn 20 via `ANL-01..04`, `SHT-01..03`, `SPD-01` in commits `5bf50fa`, `a9982c9`, `30b2dcd`).
- **Lead Systems Architect Turn 21 Verdict: CONDITIONAL GO · PRODUCTION RELEASE AUTHORIZED**:
  - Controlled Staging Acceptance Report accepted across Gates A through E.
  - Authorized promotion of commit `c51e754` (`c51e754f4b24d600e9b4fe9f64dcad96e484f0bc`) to controlled production application deployment on Hostinger VPS (`189.72.145.225`).
- **Lead Systems Architect Turn 22 Verdict: PRODUCTION APPLICATION RELEASE ACCEPTED**:
  - Confirmed atomic zero-downtime switch to `/srv/thabaal/releases/20261120094035-c51e754f4b24`.
  - PM2 online, zero restarts, internal and public health endpoints returning `{"ok":true}`.
- **Lead Systems Architect Turn 23 & 24 Verdict: FINAL ACCEPTANCE**:
  - **Git Tree Provenance**: Non-destructive `git merge-tree --write-tree 16a600e c51e754` executed on local and VPS; matched `c51e754^{tree}` exactly (`5988c0692b3b...`), formally closing the provenance qualification.
  - **Production Backup Full Restore**: Successfully restored `/srv/thabaal/backups/pre-c51e754-20261120T092508Z.dump` into isolated database `thabaal_restore_c51e754_20261120T094724Z` on PostgreSQL 18.6 with exit code 0.
  - **Host Environment**: Confirmed Ubuntu 26.04.1 LTS, Kernel 7.0.0-42-generic, PostgreSQL 18.6.
  - **FINAL STATUS**: **ALL 7 DOMAINS PASSED · PRODUCTION APPLICATION RELEASE ACCEPTED · ALL FOLLOW-UPS CLOSED · RUNTIME ONLINE & HEALTHY**.
- **Lead Systems Architect Turn 44 Verdict: UNCONDITIONAL PRODUCTION PERMANENT-PREVENTION CERTIFICATION GRANTED**:
  - **Verdict**: **`UNCONDITIONAL ACCEPTANCE — PERMANENT-PREVENTION CERTIFICATION GRANTED` · APPROVED AND CLOSED**.
  - **Incident Resolution**: Missing-table `sent_template_snapshots` rendering defect (digest `3888382912`) permanently resolved via PostgreSQL 18.6 table creation + defensive compatibility fallback in `src/app/dashboard/replies/page.tsx`. Finforte `/dashboard/replies` loads with `HTTP 200 OK`.
  - **Control A (Schema Drift Gate)**: 11 / 11 adversarial DDL scenarios blocked with Exit 1 on PostgreSQL 18.6. Pinned Prisma CLI executed via `execFileSync` without shell interpolation. Verified against `$REL/prisma/schema.prisma` before promotion.
  - **Control B (Import Tenant Isolation & Lease Fencing)**: Stale worker finalization transaction rollback verified (Subtest 7); cross-tenant child record isolation enforced.
  - **Control C (Loyalty Idempotency & Operation Identity)**: Explicit `conflict: true` contract alignment + stable operation identity validation (Subtest 6 & 7) preventing cross-tenant replay and mutation mismatch.
  - **Control D (Chats Resilience)**: Verified live on production with 0 P2021 errors in log.
  - **Production Release**: Atomically promoted and active at `/srv/thabaal/releases/20261121023931-107aed35bb26` under PM2 PID `570595` (0 restarts, online).
  - **Acceptance Scope**: All permanent-prevention controls formally certified. Zero outstanding requirements.

---

## 5. Recent Git Commits on `HomeNewUi` (All Pushed to `origin` & `thabaal`)
- `fd38644`: **fix(turn-44): eliminate shell interpolation in schema drift gate using execFileSync**
- `107aed3`: **fix(turn-42): complete loyalty idempotency contract with conflict flag and stable operation identity validation**
- `e12fa16`: **fix(turn-41): complete permanent prevention suite, enum value drift parser, stale worker transaction rollback, and cross-tenant idempotency protection**
- `8e87cc5`: **fix(turn-40): close all architect requirements: clean fail-closed gate hook, import child isolation, loyalty db unique constraint, and chats ssr fallback**
- `c51e754`: **test(staging): add controlled staging validation suite for turn 20 gates A-E**
  - Added dedicated staging validation suite `tests/staging/controlled-staging-validation.test.ts`.
  - Verified cross-period financial reconciliation (Order Oct 28 ₹10k / Refund Nov 5 ₹3k).
  - Verified explicit `Archive = yes` tombstone semantics, PostgreSQL 17.10 index scan, and 10-concurrent webhook delivery idempotency.
- `30b2dcd`: **fix(domain-6): reconcile refund status lifecycle, enforce sht-03 tombstone semantics, and complete 20k benchmark**
  - Fulfilment status (`DELIVERED`, `DISPATCHED`, `PAID`) preserved post-refund; removed artificial `status: "CANCELLED"` overwrite.
  - Sales eligibility strictly governed by `refundAmount < total` in both `isSale(o)` and `saleSqlText(a)`.
  - Implemented SHT-03 explicit tombstone semantics (`Archive = yes` sets `deletedAt`), preserving all historical orders, messages, and loyalty records.
  - Reconciled period attribution in `reports-data.ts` and `payments-data.ts` using `refundedAt` completion date.
  - Executed 20,000-row benchmark: 7,853 ms (2,547 rows/sec, 38 MB heap delta).
- `a9982c9`: **fix(domain-6): implement chunked sheets sync, order parity validation, and spd-01 index proof**
  - Implemented 500-row chunking in `syncCustomers` reducing DB round-trips by >98%.
  - Added deterministic 10-state order-ID set parity test (`qualifyingPrismaIds === qualifyingSqlIds`).
  - Executed `EXPLAIN (ANALYZE, BUFFERS)` for SPD-01 proving direct Bitmap Index Scan on `Order_clientId_status_createdAt_idx`.
- `5bf50fa`: **fix(domain-4a-6a): enforce waha unique mapping, durable replay protection, and financial parity**
  - Enforced strict session-to-tenant binding in `src/app/api/waha/webhook/route.ts` with 409 fail-closed on duplicate sessions.
  - Implemented HMAC-SHA512 verification, payload freshness (< 5 mins), and durable event replay deduplication via `Reply.waMessageId` unique index. Tested with 10 concurrent requests via `Promise.allSettled`.
  - Enforced gross vs net sales and refunds separation across `reports-data.ts`, `business-reports.ts`, `payments-data.ts`, and `spend.ts`.
  - Aligned Prisma and PostgreSQL order sets by stamping `status: "CANCELLED"` on 100% full refunds.
  - Sanitized Google Sheets cell inputs against formula injection with leading whitespace/newlines.
- `e3eca52`: **docs(audit): add master forensic report for domain 6 analytics gsheets and spend**
- `67b8c90`: **fix(web-01-04): enforce explicit waha session-to-tenant mapping and native hmac-sha512 body freshness**
  - Enforced strict session-to-tenant binding in `src/app/api/waha/webhook/route.ts` (`WhatsAppNumber.wahaSession` and `Setting.wahaSession`), failing closed without touching customer records for unmapped sessions.
  - Implemented constant-time `timingSafeEqual` HMAC-SHA512 signature verification over raw body bytes, payload timestamp freshness (< 5 mins), and echo suppression (`fromMe === true`).
  - Added test suite `tests/unit/waha-webhook-security.test.ts` (6/6 passing).
- `cfa042b`: **fix(domain-4a-5b): complete forensic remediation for loyalty concurrency, refund lifecycle, inbound lease fencing, and waha webhook security**
- `6a06d50`: **fix(sec-01): implement pg_advisory_xact_lock for true database-level WABA reservation serialization**
- `ef3d000`: **fix(sec-01): add cross-tenant draft reservation check and atomic concurrency guard**
- `6c0ebe4`: **fix(sec-01): enforce tenant-bound WABA and token authorization for onboarding**

---

## 6. Current Status & Active Production Environment
- **Branch**: `HomeNewUi` (HEAD: `fd386449c678af55b47c92734ce7caded4479e77`)
- **Git Remotes**:
  - `origin`: `https://github.com/Rensog878/campaign.git` (up-to-date with `fd38644`)
  - `thabaal`: `https://github.com/thabaal26/thabaal.git` (up-to-date with `fd38644`)
- **Production Server**: Hostinger VPS (`189.72.145.225`, Ubuntu 26.04.1 LTS, PostgreSQL 18.6)
- **Active Release Symlink**: `/srv/thabaal/current -> /srv/thabaal/releases/20261121023931-107aed35bb26`
- **PM2 Process**: `thabaal` (PID `570595`, 0 restarts, memory `290 MB`, cpu `0.0%`, uptime online)
- **Health Endpoints**:
  - Internal: `http://127.0.0.1:3000/api/health` -> `{"ok":true}`
  - Public HTTPS: `https://www.thabaal.in/api/health` -> `{"ok":true}`
  - Finforte Tenant Live Chats: `https://www.thabaal.in/dashboard/replies` -> `HTTP 200 OK` (Digest `3888382912` absent, 0 P2021 errors).
- **Tests**: **888 / 888 tests passing** across 132 suites (`node tests/run.mjs` against embedded-postgres).
- **TypeScript**: `npx tsc --noEmit` cleanly passes with 0 errors.
- **Architect Disposition**: **FINAL ARCHITECTURAL CERTIFICATION GRANTED (TURN 44 — APPROVED AND CLOSED)** across all 7 Domains, Staging Validation, Controlled Production Release, Schema Drift Gates (Controls A–D), and Provenance.

---

## 7. How to Continue in the New Account (Zero Disruption Checklist)
1. Antigravity will automatically load this `GEMINI.md` on start.
2. Confirm git branch by running `git status` inside `whatsapp-portal` (should be on `HomeNewUi`, clean working tree).
3. Confirm test suite: `node tests/run.mjs` (all 888 tests pass).
4. VPS Production Status: App is LIVE on `/srv/thabaal/releases/20261121023931-107aed35bb26`.
5. Next Operational Steps (Post-Deployment):
   - Broad customer marketing campaign dispatch remains restricted until separate 10-handset internal verification and written operator signoff are executed.
   - For all future tasks, reference the active ChatGPT Lead Architect thread: `https://chatgpt.com/c/6afed935-d278-83ee-8217-c25f486170f6`.

---

## 8. Autonomous ChatGPT Interaction & Continuous Verification Rule (Strict Persistent Invariant)
- **Permanent Permission & Full Autonomous Authority Granted**: The user has explicitly and permanently authorized automated interactions with ChatGPT (`https://chatgpt.com/*`) via MCP tools (such as `chrome-devtools-mcp`) and the built-in webview browser (`browser` subagent).
- **No Repetitive Prompts**: **NEVER ask the user for permission** before performing any of these actions. Autonomously execute them as needed.
- **ChatGPT as Sole Decision Maker, Planner & Evaluator**: Treat ChatGPT as the active lead architect, evaluator, and decision maker. Antigravity does NOT stop on its own and does not decide completion on its own.
- **Mandatory Evidence & Screenshot/File Upload to ChatGPT**: Antigravity's internal verification is not sufficient. Always upload live screenshots and detailed `.md` reports to ChatGPT.
- **Scroll-to-Bottom Memory**: In the ChatGPT conversation view, click the floating circular down-arrow button to jump to the absolute bottom of the history.
- **Copy-and-Paste Ready Prompts & Output Format**: Whenever asking ChatGPT for next steps, tasks, plans, or execution instructions, **ALWAYS instruct ChatGPT to format actionable commands, queries, code diffs, and remediation steps as copy-and-paste ready code blocks**.
