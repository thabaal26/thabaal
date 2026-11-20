# THABAAL FORENSIC AUDIT DOSSIER — DOMAIN 6: ANALYTICS, GOOGLE SHEETS 2-WAY SYNC & SPEND REPORTING

**Audit Target Platform**: Thabaal Multi-Tenant WhatsApp Business Commerce & CRM (`whatsapp-portal`)  
**Active Working Branch**: `HomeNewUi`  
**Latest Evaluated Commits**: `cfa042b` (Domain 4A/5B remediation) + `67b8c90` (WEB-01/04 WAHA authentication hardening)  
**Automated Verification Suite**: **809 / 809 Tests Passing** across 123 Suites (`node tests/run.mjs` against PostgreSQL on port 5433)  
**TypeScript & Production Build**: `npx tsc --noEmit` = 0 compile errors; Next.js Turbopack compiled 25 routes in 14.2s  
**Audit Posture**: **STRICT READ-ONLY FORENSIC AUDIT** (Zero production DB mutations, zero live WhatsApp dispatches, zero live Google Sheets writes)

---

## 1. Executive Summary & Audit Scope

Pursuant to the Lead Systems Architect's directive in Turn 16, Domain 6 was subjected to an exhaustive read-only forensic inspection across its four critical sub-domains:
1. **Analytics & Reporting (Revenue, Attribution & KPIs)** (`src/lib/reports-data.ts`, `src/lib/business-reports.ts`, `src/lib/payments-data.ts`, `src/lib/sale.ts`, `src/lib/filter-scope.ts`, `src/lib/filters.ts`)
2. **Google Sheets 2-Way Sync Engine** (`src/lib/sheets.ts`, `src/lib/google-sheets-live.ts`, `src/lib/gsheet/*`, `src/app/api/google/sheets/*`)
3. **Spend Reporting & Dual Payment Track Separation** (`src/lib/spend.ts`, `src/lib/meta-balance.ts`, `src/lib/billing-fallback-policy.ts`)
4. **Multi-Tenant Security & Performance Under Scale** (Tenant boundary enforcement, composite index health, pagination, and N+1 query loops)

Additionally, this dossier records the verification evidence for the formal closure of **Domain 4A** findings (`WEB-01` and `WEB-04`), which were hardened in commit `67b8c90` with dedicated automated unit tests passing 6/6.

---

## 2. Architecture & Data-Flow Diagrams

### 2.1 Analytics Data-Flow & Ingestion Pipeline
```
[Meta Cloud API Webhooks] ──> Status & Pricing Categories (marketing, utility, service) ──> [Message Table]
                                                                                                    │
[Customer WhatsApp Cart]  ──> [Order Table] (items, total, status, paidAt, refundAmount) ────────────┼──> [Prisma & Raw SQL]
                                                                                                    │          │
[Staff Actions / UPI]     ──> [PaymentEvent] & [Customer]                                          │          ▼
                                                                                            [reports-data.ts]
                                                                                            [business-reports.ts]
                                                                                            [payments-data.ts]
                                                                                                    │
                                                                                                    ▼
                                                                                    [ECharts & Portal Dashboards]
```

### 2.2 Google Sheets Dual-Path Ingestion & Export Architecture
```
                                 ┌─────────────────────────────────────────────────────────────┐
                                 │                 Google Sheets Sync Architecture             │
                                 └─────────────────────────────────────────────────────────────┘
                                                                │
                 ┌──────────────────────────────────────────────┴──────────────────────────────────────────────┐
                 ▼                                                                                            ▼
     [Path A: Outbound Live Sync]                                                                 [Path B: Inbound Manual Import]
     (src/lib/gsheet/sync.ts)                                                                     (src/lib/sheets.ts)
                 │                                                                                            │
  Triggered via after() & Dispatcher                                                           Triggered by Staff CSV Link
                 │                                                                                            │
  CAS Advisory Lock on SheetLink                                                               Sequential Loop (up to 20,000 rows)
                 │                                                                                            │
  Read Delta via (updatedAt, id) cursor                                                        Direct DB findUnique & create/update
                 │                                                                                            │
  Google Sheets API batchUpdate                                                                Customers & Orders populated in DB
  (valueInputOption: "RAW")                                                                                   │
                 │                                                                                            ▼
                 ▼                                                                             Opt-out honored; Opt-in preserved
  8 Keyed Tabs (Orders, Custs, Chats...)
```

---

## 3. Source-of-Truth Matrix

| Entity | Primary Source of Truth | Secondary / Derived Views | Sync Direction | Consistency Model |
| :--- | :--- | :--- | :--- | :--- |
| **Orders & Fulfillment** | PostgreSQL `Order` table | GSheets `Orders` & `Order Items` tabs | 1-Way (DB ➔ Sheet) | Read committed; cursored delta updates |
| **Customer Master & Profile** | PostgreSQL `Customer` table | GSheets `Customers` tab; Manual Sheet Import | Dual 1-Way (DB ➔ Sheet; Manual Sheet ➔ DB) | DB is authoritative. Sheet edits do NOT sync back to DB. |
| **Payment Transactions** | PostgreSQL `Order` & `PaymentEvent` | GSheets `Payments` tab; `payments-data.ts` | 1-Way (DB ➔ Sheet) | Append-only event ledger in GSheets |
| **Campaign Delivery & Replies** | PostgreSQL `Message` & `Reply` | GSheets `Chats` tab; `campaignResults` | 1-Way (DB ➔ Sheet) | Append-only in GSheets; 90-day rolling window in DB |
| **Meta Messaging Spend** | Meta Graph API `pricing_analytics` | Local DB `Message` table fallback; `spend.ts` | External API ➔ DB Cache | Live Meta API prioritized; local DB delivered-message count fallback |
| **Tenant SaaS Subscriptions** | Razorpay AutoPay API | PostgreSQL `Subscription` & `Client` | External API ➔ DB | Webhook-driven; strictly isolated from Track 1 commerce |

---

## 4. KPI Formula Catalogue & Discrepancy Analysis

### 4.1 Revenue & Sales Formula Analysis
* **TypeScript Rule (`isSale` in `src/lib/sale.ts`)**:
  ```ts
  export function isSale(o: SaleFields): boolean {
    if (o.status === "CANCELLED") return false;
    if (o.refundAmount != null && o.total != null && o.total > 0 && o.refundAmount >= o.total) return false;
    if (o.paidAt) return true;
    if (o.status === "PAID" || o.status === "DISPATCHED" || o.status === "DELIVERED") return true;
    return o.status === "CONFIRMED" && isCod(o);
  }
  ```
* **Raw SQL Rule (`saleSqlText` in `src/lib/sale.ts`)**:
  ```sql
  (${a}."paidAt" IS NOT NULL OR ${a}.status IN ('PAID','DISPATCHED','DELIVERED') OR 
   (${a}.status = 'CONFIRMED' AND (${a}."paymentMethod" = 'cod' OR (${a}."paymentMethod" IS NULL AND ${a}."internalNote" ~* '\\m(cod|cash\\s+on\\s+delivery)\\M'))))
  ```
* **Prisma Filter (`SALE_WHERE` in `src/lib/sale.ts`)**:
  ```ts
  export const SALE_WHERE: Prisma.OrderWhereInput = {
    OR: [
      { paidAt: { not: null } },
      { status: { in: ["PAID", "DISPATCHED", "DELIVERED"] } },
      { status: "CONFIRMED", paymentMethod: "cod" },
      { status: "CONFIRMED", paymentMethod: null, internalNote: { contains: "cod", mode: "insensitive" } },
      { status: "CONFIRMED", paymentMethod: null, internalNote: { contains: "cash on delivery", mode: "insensitive" } },
    ],
  };
  ```

### 4.2 Discrepancy & Invariant Violations Identified
1. **Cancellation Blindness in SQL & Prisma**:
   * `saleSqlText(a)` and `SALE_WHERE` start with `${a}."paidAt" IS NOT NULL` / `{ paidAt: { not: null } }`.
   * Neither checks `${a}.status != 'CANCELLED'`.
   * If a customer pays for an order and subsequently cancels it (or staff cancels it), `isSale(o)` in TypeScript correctly evaluates to `false`, but raw SQL (`business-reports.ts:62`) and direct `SALE_WHERE` queries (`spend.ts:284`, `admin-data.ts:149`, `gsheet/sync.ts:406`) still match the cancelled order!
2. **Gross vs Net Revenue & Refund Exclusion**:
   * In `src/lib/reports-data.ts:212-215` (`readPeriod`), `db.order.findMany` selects `{ id, total, status, paidAt, paymentMethod, internalNote }` but **omits `refundAmount`**.
   * Consequently, `isSale(o)` cannot evaluate full refunds (`o.refundAmount` is `undefined`), and `computePeriodFigures` does `sales += o.total` (Gross Sales) without deducting partial or full refunds.
   * In `src/lib/business-reports.ts:62` (`campaignResults`), campaign revenue is calculated via `coalesce(sum(o.total), 0)` without deducting `refundAmount`.
3. **Attribution Windows in `business-reports.ts`**:
   * Campaign Reply: Inbound `Reply` within `m.at` to `m.at + interval '3 days'`.
   * Campaign Cart: `Order` created within `m.at` to `m.at + interval '7 days'`.
   * Campaign Purchase: `Order` with `o."createdAt"` within `m.at + interval '7 days'` satisfying `${BOUGHT_SQL}`.
   * *Assessment*: Attribution uses strict `createdAt` timestamps aligned to campaign dispatch (`m.at`). However, because `Order.clientId` is omitted from the subquery `WHERE o."customerId" = m.cust`, tenant boundary relies purely on customer foreign key uniqueness rather than index-level tenant scoping.

---

## 5. Google Sheets 2-Way Sync Engine Audit

### 5.1 Multi-Tenant Isolation & Credential Security
* **OAuth Tokens (`SheetLink`)**:
  * Stored encrypted using AES-256-GCM (`seal` / `unseal` via `src/lib/secret-box.ts`) with a 12-byte cryptographic IV and 16-byte authentication tag (`enc:v1:` prefix).
  * In-memory cache `tokens` (`Map<string, { token: string; until: number }>`) is strictly keyed by `clientId`.
  * OAuth connect/callback flows enforce CSRF protection via HMAC-signed state tokens (`signState` / `readState`) verifying `st.userId === user.id` and `st.clientId === scope.clientId`.
  * Subscription entitlement is verified at both initiate and callback stages via `canUseGoogleSheets(clientId)`.

### 5.2 Formula Injection Defense (CSV & Sheets API)
* **Outbound Live Sync (`src/lib/gsheet/google.ts`)**:
  * Calls Google Sheets API `batchUpdate` and `append` with `valueInputOption: "RAW"`.
  * Because `RAW` is specified, strings beginning with `=`, `+`, `-`, or `@` are stored literally as string literals and never evaluated by Google Sheets as formula expressions.
* **Apps Script Webhook (`deploy/google-sheets/Code.gs`)**:
  * In `Code.gs:102`, incoming event data is written via `sh.getRange(r, 1, 1, row.length).setValues([row])`.
  * Unlike the REST API with `RAW`, Apps Script `setValues()` interprets strings starting with `=` as formula expressions. If a malicious customer submits a name or note starting with `=`, Apps Script would evaluate it (`SHT-02`).

### 5.3 Concurrency, Race Conditions & Deletion Semantics
* **Atomic Lease Locking**:
  * `syncClientSheet` implements atomic CAS locking on `SheetLink`:
    `UPDATE "SheetLink" SET "lockUntil" = now() + 2min, "dirty" = false WHERE "clientId" = $1 AND "status" = 'connected' AND ("lockUntil" IS NULL OR "lockUntil" < now())`
  * Prevents concurrent webhook runners from double-writing to Google Sheets.
* **Deletion Semantics & Sync Drift (`SHT-03`)**:
  * Outbound sync tracks `updatedAt` + `id` cursors for upserts. If an order or customer is deleted from the PostgreSQL DB, the Google Sheet retains the row indefinitely.
  * Inbound manual sync (`syncCustomers` in `sheets.ts`) executes an unbatched sequential loop up to 20,000 rows (`findUnique` followed by `create` or `update`), resulting in up to 40,000 sequential DB roundtrips (`SHT-01`).

---

## 6. Spend Reporting & Dual Payment Track Separation Audit

### 6.1 Meta Cloud API Billing Rules Verification (`src/lib/spend.ts`)
* **Trigger Invariant**: Charges apply ONLY on delivered messages (`DELIVERED` or `READ`), strictly excluding `QUEUED`, `FAILED`, and `SKIPPED`. Verified in `localSpendGroups`:
  `where: { status: { notIn: ["QUEUED", "FAILED", "SKIPPED"] } }`.
* **1,000 Free Service Quota Tracking**:
  * Meta allocates 1,000 free service conversations per month per business phone number.
  * In `spend.ts`, quota is computed dynamically: `totalFreeLimit = phoneCount * FREE_SERVICE_QUOTA_PER_NUMBER`.
  * Local 24h service replies (`"Typed reply"`, `"Media reply"`, `"AI auto-reply"`) are counted against the free quota, and only excess over `totalFreeLimit` is billed at ₹0.1150/msg.
* **GST & Balance Ledger Reconciliation**:
  * 18% India GST is added to all delivered messages and deducted alongside prepaid top-up credits in `spentSinceSyncWithGst`.
  * Internal balance snapshots (`[META_SYNC]`) are filtered out to prevent double-counting top-up amounts.

### 6.2 Dual Payment Track Separation
* **Track 1 (Customer ➔ Tenant WhatsApp Commerce)**:
  * Handled exclusively by Meta native pay (`order_details`), UPI dynamic links, and COD (`src/lib/payments.ts`).
  * Order fulfillment is governed by `Client.orderFlow` (`pickup`, `deliver`, `courier`, `service`). Zero Razorpay dependencies.
* **Track 2 (Tenant ➔ Thabaal SaaS Subscriptions & Wallet)**:
  * Governed by `src/lib/razorpay-billing.ts` and `src/lib/billing-fallback-policy.ts`.
  * Pure policy engine `canOfferManualFallback` strictly gates one-time orders to terminal AutoPay mandate failures, preventing accidental double billing. Zero `orderFlow` dependencies.

---

## 7. Findings Register

| Finding ID | Classification | Severity | Sub-Domain | Description & Forensic Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **ANL-01** | Invariant / Accounting Defect | **HIGH** | Analytics | **Gross vs Net Sales & Missing Refund Fields in `reports-data.ts`**: `readPeriod` omits `refundAmount` in query select, preventing `isSale` from evaluating 100% full refunds. `computePeriodFigures` accumulates `sales += o.total` (Gross) without deducting refunds, inflating monthly revenue and ROI ratios. |
| **ANL-02** | Invariant / Logic Defect | **HIGH** | Analytics | **SQL Invariant Divergence in `saleSqlText`**: Raw SQL formula `saleSqlText` omits `status != 'CANCELLED'` and refund checks. In `business-reports.ts:62`, cancelled orders with past `paidAt` are counted in campaign revenue sums. |
| **ANL-03** | Invariant / Query Defect | **MEDIUM** | Analytics / DB | **`SALE_WHERE` Prisma Filter Omits Cancellation Exclusion**: `SALE_WHERE` contains `OR: [{ paidAt: { not: null } }, ...]`. Queries using `...SALE_WHERE` directly (e.g. `spend.ts:284`, `admin-data.ts:149`, `gsheet/sync.ts:406`) match cancelled orders unless caller manually adds `AND: [{ status: { not: "CANCELLED" } }]`. |
| **ANL-04** | Accounting Defect | **MEDIUM** | Revenue | **`receivedOf` Ignores Refunds in `payments-data.ts`**: `receivedOf(o)` returns `o.paidAmount ?? o.total` without deducting `o.refundAmount`. In `payments-data.ts:182`, `receivedToday` aggregates gross receipts without subtracting refunds given today. |
| **SHT-01** | Performance / N+1 | **MEDIUM** | Google Sheets | **Inbound Sheet Sync N+1 Database Storm**: `syncCustomers` in `src/lib/sheets.ts:174-206` executes up to 20,000 sequential `findUnique` and `create`/`update` queries in a single HTTP request without batching or chunking. |
| **SHT-02** | Security / Injection Risk | **LOW** | Google Sheets | **Formula Injection Vector in Apps Script**: `deploy/google-sheets/Code.gs:102` calls `setValues([row])` directly on raw webhook payloads. If a user name or note begins with `=`, Google Sheets executes it as a formula. |
| **SHT-03** | Data Integrity Drift | **LOW** | Google Sheets | **Asymmetric Row Deletion in Outbound Sync**: When orders or customers are deleted from PostgreSQL, `gsheet/sync.ts` does not propagate row deletions to Google Sheets, leading to persistent ghost entries in external spreadsheets. |
| **SPD-01** | Query Performance | **LOW** | Spend Reporting | **Composite Index Bypass in `spend.ts`**: `spend.ts:281-285` queries orders via `where: { customer: { clientId } }` instead of `where: { clientId }`, forcing a table join on `Customer` rather than using the compound index `@@index([clientId, status, createdAt])`. |

---

## 8. Domain 4A Closure Verification (`WEB-01` & `WEB-04`)

In Turn 16, the Lead Systems Architect authorized closure of Domain 4A conditional upon:
1. `WEB-01`: Explicit WAHA session-to-tenant mapping (never inferring tenant from recipient phone numbers).
2. `WEB-04`: Native HMAC-SHA512 verification over raw request body using constant-time comparison, plus payload timestamp freshness (< 5 mins).

**Remediation Implementation (Commit `67b8c90`)**:
* `src/app/api/waha/webhook/route.ts`:
  - Verified `sessionName` against `WhatsAppNumber.wahaSession` and `Setting.wahaSession`. Unmapped sessions fail closed with zero database mutations.
  - Implemented `timingSafeEqual` HMAC-SHA512 verification against configured `WAHA_WEBHOOK_SECRET`.
  - Added timestamp freshness validation (< 300 seconds).
  - Added echo suppression (`fromMe === true`).
* **Automated Test Evidence (`tests/unit/waha-webhook-security.test.ts`)**:
  - Test 1 (`WEB-04`): Missing authentication returns 403 Forbidden (✔ PASS)
  - Test 2 (`WEB-04`): Invalid secret header returns 403 Forbidden (✔ PASS)
  - Test 3 (`WEB-04`): Valid native HMAC-SHA512 signature succeeds with 200 OK (✔ PASS)
  - Test 4 (`WEB-04`): Expired payload timestamp (> 5 mins) returns 401 Unauthorized (✔ PASS)
  - Test 5 (`WEB-01`): Explicit session-to-tenant mapping isolates STOP opt-out strictly to configured tenant (✔ PASS)
  - Test 6 (`WEB-01`): Unmapped WAHA session fails closed without touching tenant customers (✔ PASS)

---

## 9. Recommended Remediation Plan & Rollback Considerations

### 9.1 Safe Remediation Program (Pending Architect Authorization)
1. **Remedy `ANL-01` & `ANL-04` (Net Revenue Invariant)**:
   - Update `readPeriod` in `reports-data.ts` to select `refundAmount`.
   - Update `computePeriodFigures` to accumulate net sales: `sales += Math.max(0, o.total - (o.refundAmount ?? 0))`.
   - Update `receivedToday` in `payments-data.ts` to deduct refunds.
2. **Remedy `ANL-02` & `ANL-03` (SQL & Prisma Cancellation Alignment)**:
   - Update `saleSqlText(a)` in `src/lib/sale.ts` to prepend `${a}.status <> 'CANCELLED'` and exclude 100% full refunds: `AND (${a}."refundAmount" IS NULL OR ${a}."refundAmount" < ${a}.total)`.
   - Update `SALE_WHERE` in `src/lib/sale.ts` to encapsulate `{ status: { not: "CANCELLED" } }` directly within its top-level condition.
3. **Remedy `SPD-01`**:
   - Change `customer: { clientId }` to `clientId` in `spend.ts:282` to leverage the compound index.
4. **Remedy `SHT-02`**:
   - In `deploy/google-sheets/Code.gs`, prepend a single quote `'` to any string cell value starting with `=`, `+`, `-`, or `@`.

### 9.2 Rollback Safeguards
- All proposed changes are non-destructive, additive, and require zero database schema migrations.
- If any discrepancy arises, git revert to commit `67b8c90` restores original behavior cleanly.

---

## 10. Audit Verification Summary
- **Total Test Suites**: 123
- **Total Tests Passing**: **809 / 809**
- **TypeScript Typecheck**: Clean (0 errors)
- **Current Branch Status**: `HomeNewUi` cleanly aligned across `origin` and `thabaal`
