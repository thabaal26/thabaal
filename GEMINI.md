# Thabaal (`whatsapp-portal`) — Full Project Context & Session Handoff

> **AUTOMATIC CONTEXT RULE**: This `GEMINI.md` file is automatically loaded by Antigravity in every session across any user account. For the standalone handoff reference, see [`HANDOFF_CONTEXT.md`](file:///c:/Users/step1/OneDrive/Desktop/cupnsaucer/HANDOFF_CONTEXT.md).

---

## 1. Local Conversation Transcripts (From Previous Account Session)
If you need to inspect any earlier conversation step or code diff from the previous account's session, the raw JSONL transcripts are stored locally on this machine at:
- **Main Session Compact Transcript**: `C:\Users\step1\.gemini\antigravity\brain\322fbc6e-ce65-4054-bda4-c917d739f683\.system_generated\logs\transcript.jsonl`
- **Main Session Full Transcript**: `C:\Users\step1\.gemini\antigravity\brain\322fbc6e-ce65-4054-bda4-c917d739f683\.system_generated\logs\transcript_full.jsonl`
- **Meta Integration Auditor Subagent Transcript**: `C:\Users\step1\.gemini\antigravity\brain\42d50663-5eaa-4d77-805e-9ea59292e49a\.system_generated/logs\transcript.jsonl`

---

## 2. Project Identity & Tech Stack
- **Repository / App Path**: `c:\Users\step1\OneDrive\Desktop\cupnsaucer\whatsapp-portal`
- **Platform Brand Name**: **Thabaal** (Multi-tenant WhatsApp Business Commerce, CRM, AI & Loyalty Platform)
- **Primary Active Tenant / Store**: **Thenan Oils** (Cold-pressed oils, Madurai / Tamil Nadu retail & D2C)
- **Framework**: Next.js (App Router, React Server Components + Server Actions), TypeScript, Tailwind CSS
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

---

## 4. Core Libraries & Business Logic Map (`src/lib/*`)
- **AI & Copilot (`src/lib/ai.ts`)**:
  - Uses Groq (`llama-3.3-70b-versatile`) for 7 features:
    1. Dashboard AI Executive Briefing & Copilot (`src/app/dashboard/ai-copilot.tsx`)
    2. Inbox Smart Reply Drafts (English & Tanglish/Tamil)
    3. Customer Sentiment & Purchase Intent Analysis
    4. Template Copywriter & Meta Approval Guard
    5. Campaign Audience & Timing Optimizer
    6. Order Note / Address / Payment Claim Extractor
    7. Catalogue Product Description & Combo Generator
- **Meta Spend, 1,000 Free Service Quota & Pricing (`src/lib/spend.ts`, `src/lib/meta-balance.ts`)**:
  - Tracks monthly service conversations (first 1,000 service conversations/month telemetry + 24h free customer service window tracking), category-wise spend (`marketing`, `utility`, `authentication`, `service`), and Apache ECharts spend visualizations (`src/app/dashboard/spend-card.tsx`, `src/app/dashboard/spend-charts.tsx`).
- **Cart Mentality & Purchase Behavior (`src/lib/cart-mentality.ts`)**:
  - Diffs consecutive WhatsApp carts sent by the same customer within a shopping session to detect **hesitation / dropped items / replaced items** vs. abandoned carts vs. completed orders.
- **Loyalty Points, Tiers & RFM Ratio Engine (`src/lib/loyalty.ts`)**:
  - **Auto-Earned Points**: `1 pt` per `₹10` spent on paid/active WhatsApp orders + `+50 pts` per repeat order + `+35 pts` per historical sheet item.
  - **Manual Point Adjustments**: Stored as tags (`loyalty-adj:<delta>:<timestamp>:<reason>`) on `Customer.tags` via `adjustCustomerLoyaltyPoints` in `src/app/dashboard/actions/customers.ts` (`+50`, `+100`, `+200`, or `-100 Redeem` = `₹10` discount).
  - **Tiers**: `Bronze` (`0–199 pts`, 2% perk), `Silver` (`200–499 pts`, 5% perk), `Gold` (`500–999 pts`, 8% perk), `Platinum` (`1000+ pts`, 12% VIP perk + free delivery).
  - **RFM Score (`R·F·M`)**: Scores every customer `1–5` on **Recency (R)**, **Frequency (F)**, and **Monetary (M)** + composite score (`3–15` / `0–100%`) + segment (`Champion`, `Loyal Regular`, `High-Spend Buyer`, `Promising`, `Cooling Down`, `At Risk`, `New / Prospect`).
  - **Smart Offer Engine**: Generates 1-click personalized `wa.me` offer links based on tier, RFM segment, cart drops, or refill due status.
- **Payments & Order Lifecycle (`src/lib/payments.ts`, `src/lib/payment-state.ts`, `src/app/dashboard/actions/orders.ts`)**:
  - **Native Checkout (`order_details`)**: `autoRequestPayment` automatically sends Meta's native "Review and Pay" card when a customer submits a catalogue cart.
  - **24h Window Smart Routing**: Sends interactive `order_details` (free) if the 24h customer reply window is open; falls back to `ORDER_DETAILS` utility template (`payment_request`) if closed.
  - **Resilient Image Fallback (`withCatalogFallback`)**: Automatically retries without product image header if Meta returns `error 131053` (media fetch error).
  - **Live Order Card Updates (`updateOrderCard`)**: Mutates the customer's in-chat WhatsApp order card via `order_status` (`processing` -> *"Payment received"*, `shipped` -> *"Order dispatched"*, `completed` -> *"Order delivered"*, `canceled` -> *"Order cancelled"*).
  - **10-State Payment Machine (`computePaymentInfo`)**: Tracks `paid`, `part_paid` (partial advance + balance due), `cod_due`, `claimed` (auto-detects customer `"paid"` text, 12-digit UPI UTRs, or payment screenshots), `failed` (with Meta fail reason), `requested`, `unpaid`, `refund_due` (paid order later cancelled), and `refunded`.
  - **6-Hour Unpaid Cart Reminder**: `sendDuePaymentReminders` nudges unpaid carts after 6 hours (`REMIND_AFTER_MS`).
- **Filter System (`src/lib/filters.ts`, `src/lib/filter-scope.ts`, `src/components/filter-bar.tsx`)**:
  - Clean, simplified per-page filter scoping (`dateRange`, `area`, `product`, etc.) without history/sheet popstate collisions.

---

## 5. Recent Git Commits (All Pushed to `origin/main`)
- `446a833` / `2e2f021` / `0e4a6fd`: Animated Thabaal sign-in page with interactive bird mascot (`src/app/login/*`).
- `a66bf55`: **PWA Rebrand to Thabaal** — Updated `src/app/manifest.ts`, `src/app/api/manifest/[clientId]/route.ts`, `src/app/dashboard/layout.tsx`, `public/offline.html`, and `public/sw.js` (`thabaal-v3`) so Chrome PWA install always shows **Thabaal** instead of client name (*Thenan Oils*).
- `b2cd66c`: **Customer/Product Intelligence, RFM Ratio, Loyalty Wallet & Smart Offer Engine** (`src/lib/loyalty.ts`, `src/app/dashboard/intelligence-hub.tsx`, `src/app/dashboard/customers/[id]/purchase-journey.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/customers/page.tsx`).
- `5da66ee`: **Simplified Filters** — Removed cluttered/unwanted filters, fixed sheet/picker browser history collisions, and scoped filter bars per tab.
- `3166a86`: **Free AI & Meta Quota Telemetry** — Added 7 free Groq AI integrations and Meta 1,000 free monthly service quota telemetry.
- `58ec02f`: **Apache ECharts Spend Analytics** — Added ECharts visualizations to Meta Spend & Wallet card.

---

## 6. Where We Left Off & Next Potential Tasks
In our last turn, we completed a full comparison of **WhatsApp Business Payments & Commerce** (Thabaal vs. AiSensy, Interakt, Wati, Zoko, BiteSpeed) and identified **4 optional high-impact payment/order features** ready to implement next if requested:
1. **COD-to-Prepaid Instant Discount Nudge**: Auto-send an interactive WhatsApp offer (`₹20–₹50 OFF` or `+100 Bonus Loyalty Points`) when an order is marked `cod_due` to convert COD orders into instant UPI prepaid.
2. **1-Click COD Order Confirmation Button**: Auto-send *"Confirm COD Order"* / *"Cancel Order"* interactive buttons before shipping `cod_due` orders to prevent fake COD orders / RTO.
3. **Auto-Generated PDF Receipt / GST Bill in Chat**: Automatically generate and send a branded PDF receipt in WhatsApp (with items, amount paid, and updated **Loyalty Points balance**) when `paymentStatus` becomes `paid`.
4. **Shipping Tracking Link (`Shiprocket` / `Delhivery` / `India Post` / Custom AWB)**: Allow staff to attach a courier tracking number/link when marking an order `DISPATCHED`, embedding it inside the native WhatsApp `order_status` card.
