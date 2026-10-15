# Thabaal (`whatsapp-portal`) — Full Project Context & Session Handoff

> **AUTOMATIC CONTEXT RULE**: This `GEMINI.md` file is automatically loaded by Antigravity in every session across any user account. For the standalone handoff reference, see [`HANDOFF_CONTEXT.md`](file:///c:/Users/step1/OneDrive/Desktop/cupnsaucer/HANDOFF_CONTEXT.md).

---

## 1. Local Conversation Transcripts (From Previous Account Sessions)
If you need to inspect any earlier conversation step or code diff from previous account sessions, the raw JSONL transcripts are stored locally on this machine at:
- **Latest Session (Sign-in UI & Animation Refinements)**: `C:\Users\step1\.gemini\antigravity\brain\9c280eb1-afa5-42c2-80ed-c53998a891ee\.system_generated\logs\transcript.jsonl` (full: `.../transcript_full.jsonl`)
- **Previous Session Compact Transcript**: `C:\Users\step1\.gemini\antigravity\brain\322fbc6e-ce65-4054-bda4-c917d739f683\.system_generated\logs\transcript.jsonl`
- **Previous Session Full Transcript**: `C:\Users\step1\.gemini\antigravity\brain\322fbc6e-ce65-4054-bda4-c917d739f683\.system_generated\logs\transcript_full.jsonl`
- **Meta Integration Auditor Subagent Transcript**: `C:\Users\step1\.gemini\antigravity\brain\42d50663-5eaa-4d77-805e-9ea59292e49a\.system_generated\logs\transcript.jsonl`

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
  - Diffs consecutive WhatsApp carts sent by the same customer within a shopping session to detect **hesitation / dropped items / replaced items** (e.g., customer added 1L Gingelly Oil, then replaced it with 500ml before paying) vs. abandoned carts vs. completed orders.
- **Loyalty Points, Tiers & RFM Ratio Engine (`src/lib/loyalty.ts`)**:
  - **Auto-Earned Points**: `1 pt` per `₹10` spent on paid/active WhatsApp orders + `+50 pts` per repeat order + `+35 pts` per historical sheet item.
  - **Manual Point Adjustments**: Stored as tags (`loyalty-adj:<delta>:<timestamp>:<reason>`) on `Customer.tags` via `adjustCustomerLoyaltyPoints` in `src/app/dashboard/actions/customers.ts` (`+50`, `+100`, `+200`, or `-100 Redeem` = `₹10` discount).
  - **Tiers**: `Bronze` (`0–199 pts`, 2% perk), `Silver` (`200–499 pts`, 5% perk), `Gold` (`500–999 pts`, 8% perk), `Platinum` (`1000+ pts`, 12% VIP perk + free delivery).
  - **RFM Score (`R·F·M`)**: Scores every customer `1–5` on **Recency (R)**, **Frequency (F)**, and **Monetary (M)** + composite score (`3–15` / `0–100%`) + segment (`Champion`, `Loyal Regular`, `High-Spend Buyer`, `Promising`, `Cooling Down`, `At Risk`, `New / Prospect`).
  - **Smart Offer Engine**: Generates 1-click personalized `wa.me` offer links based on tier, RFM segment, cart drops, or reorder due status.
- **Payments & Order Lifecycle (`src/lib/payments.ts`, `src/lib/payment-state.ts`, `src/app/dashboard/actions/orders.ts`)**:
  - **Native Checkout (`order_details`)**: `autoRequestPayment` automatically sends Meta's native "Review and Pay" card when a customer submits a catalogue cart.
  - **24h Window Smart Routing**: Sends interactive `order_details` (free) if the 24h customer reply window is open; falls back to `ORDER_DETAILS` utility template (`payment_request`) if closed.
  - **Resilient Image Fallback (`withCatalogFallback`)**: Automatically retries without product image header if Meta returns `error 131053` (media fetch error).
  - **Live Order Card Updates (`updateOrderCard`)**: Mutates the customer's in-chat WhatsApp order card via `order_status` (`processing` -> *"Payment received"*, `shipped` -> *"Order dispatched"*, `completed` -> *"Order delivered"*, `canceled` -> *"Order cancelled"*).
  - **10-State Payment Machine (`computePaymentInfo`)**: Tracks `paid`, `part_paid` (partial advance + balance due), `cod_due`, `claimed` (auto-detects customer `"paid"` text, 12-digit UPI UTRs, or payment screenshots), `failed` (with Meta fail reason), `requested`, `unpaid`, `refund_due` (paid order later cancelled), and `refunded`.
  - **6-Hour Unpaid Cart Reminder**: `sendDuePaymentReminders` nudges unpaid carts after 6 hours (`REMIND_AFTER_MS`).
- **Filter System (`src/lib/filters.ts`, `src/lib/filter-scope.ts`, `src/components/filter-bar.tsx`)**:
  - Clean, simplified per-page filter scoping (`dateRange`, `area`, `product`, etc.) without history/sheet popstate collisions.
- **Reorder Reminders & Forecast (`src/lib/refill.ts`, `src/lib/refill-forecast.ts`, `src/app/dashboard/refills/*`, `src/app/dashboard/orders/refill-form.tsx`)**:
  - User-facing wording across the entire portal uses **Reorder / Reorders** (while preserving DB column names `refillDays`, `refillTemplateId` and Meta template identifiers `thenan_refill_reminder*`).
  - The **Reorder reminders** configuration card (`RefillForm`) lives in `/dashboard/campaigns` right beside `WinbackForm`.

---

## 5. Recent Git Commits (All Pushed to `origin/main` & `thabaal/main`)
- `604a436`: **style(mobile): Optimize Data Density, Compact Layouts, and Responsive Alignment Across All Pages** — Refined `Stat`, `Table`, `Th`, `Td`, and `OrderStepper` in `src/components/ui.tsx` with compact padding, truncation, and responsive typography to prevent multi-line number wrapping on 360-390px mobile screens. Compacted `HomeTiers` TodoTiles, section padding, and 4 KPI cards in `src/app/dashboard/home-tiers.tsx`. Refined `OrderCard` and phone customer list rows with compact avatar sizing, tighter spacing, and proper truncation. Optimized `ChatList`, `Conversation` bubbles, `ReplyInbox` header, and `InlineReplyBox` composer padding to prevent keyboard crowding on mobile. Compacted 4-KPI spend strip, ECharts metric tiles, report summary table, campaign schedule cards, and catalogue product cards. Ensured 100% desktop fidelity and breathing room via `sm:*` and `lg:*` responsive utility parity.
- `e22d50e`: **style(ui): Polish Layout Spacing, Fluid Button Swaps, and Sign-in Theme/Language Indicators** — Corrected sign-in theme toggle track inversion bug (day mode renders blue daytime sky with clouds; night mode renders dark starry sky). Added animated sliding indicator to language toggle pill (`EN | தமிழ்`) with spring physics transition. Upgraded `buttonClass` with hover elevation (`hover:-translate-y-px`), tactile active compression (`active:scale-[0.97]`), and subtle variant shadows. Added fluid button-swap transitions to `FilterChips`, `Segmented` radio switches, and sub-view navs across Campaigns, Customers, Inbox, Catalogue, Revenue, and Reports. Fixed customer sub-nav tab label from 'Refills' to 'Reorders'. Refined `PageHeader`, `Section`, and `CardHeader` spacing rhythm and vertical centering. Refined dashboard layout container padding (`px-3.5 pt-3.5` on mobile, `lg:pb-12` on desktop).
- `98bb860`: **perf(db): Add Compound Indexes on Message, Customer, and Reply for High-Throughput Scaling** — Added `@@index([customerId, createdAt])` and `@@index([senderId])` to `Message` to eliminate full-table scans during customer chat history lookups. Added `@@index([clientId, optedOut, unreachable])` to `Customer` for instant audience filtering during high-volume campaign broadcasts. Added `@@index([senderId])` to `Reply`. Created additive migration `prisma/sql/2026-10-16-indexes.sql`, registered in `scripts/db-additive.mjs` for Vercel, and executed on live Neon PostgreSQL database.
- `0b43005`: **Theme & UI Consistency: Elevate 100% of Dashboard Cards to 3D Glassmorphism Across All 34 Pages** — Upgraded every `<Card>` across Settings, Wallet, Campaigns, Customers, Orders, Replies, and Templates to `card-3d` with matching glossy `IconCube` headers and theme tone bands (`brand`, `violet`, `info`, `gold`, `rose`, `amber`). Verified 0 direct imports of `lucide-react` across application code.
- `81e695c`: **Reports & Analytics Overhaul** — Rolling 7-day range, today's live data inclusion in `weeklyReport`, top products fallback, direct 1-tap WhatsApp report sharing link (`wa.me/?text=...`), and 4-KPI carts summary tiles.
- `28a20ae`: **Auth: Integrate Continue with Google OAuth 2.0 & Update Login Credentials** — Updated login credentials in Neon PostgreSQL to `rgfoodproducts2018@gmail.com` (`rgfood2018`). Implemented `/api/auth/google` (CSRF state generation & cookie) and `/api/auth/google/callback` (Google code exchange, user profile lookup, `db.user` matching, and session creation). Added "Continue with Google" button with Google 4-color SVG and "or continue with email" divider in `src/app/login/login-form.tsx` and `src/app/login/thabaal-login.css`. Added bilingual error handling (`unauthorized_email`, `google_not_configured`, `google_denied`) in English and Tamil. Documented `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.example`.
- `0cd1ab6`: **Sign-in UI: Expand Breathing Room Between Welcome Back Text and Email Input on Mobile and Desktop** — Increased the vertical separation between the "Welcome back! Please sign in to continue" text and the "Email id" input box to `clamp(36px, 5vh, 46px)` on mobile (measured `42px` live) and `44px` on desktop (and `30px` on short screens), creating an unmistakably generous, airy visual distinction between the introductory header text and the form input card.
- `5cc2b2d`: **Sign-in UI: Shift Form Down to Balance Layout & Add Breathing Room Between Sign-in Title, Subtitle, and Input** — Shifted the entire brand and form section slightly downwards on mobile (`margin-top: clamp(14px, 2.8vh, 28px)` on brand, `padding: clamp(24px, 4vh, 42px) 20px clamp(60px, 8vh, 80px)`) to gracefully fill the bottom empty space and eliminate top banner crowding. Added distinct, comfortable breathing room between the "Sign in" title and "Welcome back! Please sign in to continue" subtitle (`margin-top: 10px` desktop / `8px` mobile), widened the gap between the subtitle and the "Email id" input field (`margin-top: 32px` desktop / `28px` mobile), and increased brand-to-form clearance (`gap: clamp(28px, 4.5vh, 42px)` desktop / `clamp(22px, 3.5vh, 32px)` mobile) with guaranteed clearance above the floating scroll badge on short screens (iPhone SE).
- `31d593e`: **Sign-in UI: Light Mode Default and Comfortable Element Spacing for Mobile and Desktop** — Removed `prefers-color-scheme: dark` fallback so the portal opens in light (day) mode by default on initial visits rather than forcing night mode automatically based on OS theme. Solved congested/cramped spacing across mobile and desktop: added 24px/20px top separation between subtitle and first input, comfortable 16px/14px input field spacing, 14px/10px forgot-password row margin, 22px/20px primary login CTA separation, and 18px/15px sign-up link margin. Centered mobile form layout vertically in `.thabaal-left` to eliminate the bottom empty void and guaranteed no overlap above the floating scroll badge on both iPhone SE and large displays. Fixed Recharts `RowText` typing for clean build.
- `9e32a0f`: **Sign-in Mobile Perfection: Compact Responsive Layout, Zero Button Overlap, and 60-120fps Scroll Virtualization** — Removed the 77.3px ghost `.mark` element inside `.thabaal-brand` that was pushing the sign-in form down, decoupled the language toggle (`EN | தமிழ்`) into a clean top-left header badge on mobile matching the theme toggle at top-right, refined sky banner height (`clamp(135px, 18vh, 160px)`) and bird scale, compacted form padding/gaps (`height: 44px` inputs/buttons) so all controls and links fit comfortably above the fold with zero bottom prompt overlap on all mobile screens (360x667 iPhone SE to 430x932 Pro Max). Implemented 60–120 FPS high-refresh scrolling with `requestAnimationFrame` throttled scroll listener in `scroll-prompt.tsx`, `visibility: hidden` GPU compositor bypass for backdrop-blur, and `content-visibility: auto` layout virtualization across all landing sections (`landing.css`).
- `35fed5a`: **Appearance & Charts Optimization** — Immutable caching headers for icon art/sets, decoupled ClientAppearance component, and Recharts bar indexing fix.
- `b241881`: **Sign-in: Eliminate Corner Reload Glitch & Add Attention Scroll-Down Prompt with Pulsing Circle Bar** — Eliminated 1-second corner flash on page reload by placing the mascot directly inside `.thabaal-brand .words` with pure CSS percentage coordinates (`96.55%, 23%` English; `26.22%, 23.4%` Tamil on `த`). Replaced the static text explore link with an interactive floating glassmorphic pop-up badge (`src/app/login/scroll-prompt.tsx`, `scroll-prompt.css`) centered at the bottom of the viewport featuring a pulsing concentric halo ring (`thabaal-circle-pulse`), theme yellow gradient (`#FDB913`), animated bouncing arrow, smooth scroll to `#explore`, and auto-hide past 70px scroll.
- `fc846d5`: **Sign-in Mascot: Sits Directly on Target Letter on Start, Jumping Animations and Cartoon Eyes/Mouth Removed** — Eliminated intro flight from left and multi-hop letter sequences; the mascot bird now sits directly on the target letter right from page load (`l` in English, `த` in Tamil) with gentle resting wing flutters and breathing bob. Completely removed `<BirdFace />` (cartoon SVG eyes and mouth), presenting only clean, authentic brand artwork (`body.png` + `wing.png`).
- `d34993a`: **Sign-in Mascot: Realistic Ballistic Physics Jumps & Crazy Funny Double Hops on Every Letter** — Implemented authentic 2D projectile physics (constant horizontal velocity $v_x$, parabolic vertical gravity deceleration to apex hang-time and accelerating fall, synchronized anticipation crouch, launch stretch, impact compression, and letter elastic oscillation). Mascot performs two jumps on every letter (Hop 1 = realistic spring jump, Hop 2 = crazy/funny personality bounce with cheeky tongue-out wink, bug-eyed shock O, laughing wiggle, or 360° backflip on tall letter `b`). Tamil executes double hops on first letter `த` and perches; English hops across all letters and perches on `l`.
- `026fbb0`: **Sign-in UI: Floating Inset Sky Panel with Curved Rounded Corners (`border-radius: 32px`) & Tamil Mascot Perched on First Letter 'த'** — Styled `.thabaal-right` as an elevated floating card with `margin: 16px; border-radius: 32px;` and soft drop-shadow. Updated Tamil letter mapping and `perchIndex` so the mascot lands and perches cleanly on the first letter `த` (matching official brand logo), while perching on `l` in English.
- `d740f1e`: **Sign-in Animation Simplification & Cut-Off Fixes** — Removed cartoon eyes (`<BirdFace />`) from the right big bird (flies constantly undisturbed). Streamlined mascot sequence: enters from left, hops letters, and sits on target letter. Fixed letter `b` sparks cut-off using custom polygon clip-paths.
- `a63f825`: Smoother scrolling and lighter pages: charts draw when scrolling pauses, lighter login images.
- `359b3de`: Icons: one module per icon, so each page loads only the icons it uses.
- `478c7ee`: **Simplified & Decluttered Orders Page (`/dashboard/orders`)** — Replaced congested 7-stat strip with a clean 4-KPI summary bar, consolidated 11 filter pills into 6 core tabs + secondary dropdown, redesigned `OrderCard` with a 4-step progress stepper (`Confirmed → Paid → Dispatched → Delivered`) and single primary CTA + `More` menu (`src/app/dashboard/orders/*`).
- `a66bf55`: **PWA Rebrand to Thabaal** — Updated `src/app/manifest.ts`, `src/app/api/manifest/[clientId]/route.ts`, `src/app/dashboard/layout.tsx`, `public/offline.html`, and `public/sw.js` (`thabaal-v3`) so Chrome PWA install always shows **Thabaal** instead of client name (*Thenan Oils*).

---

## 6. Where We Left Off & Next Potential Tasks
In our latest session:
1. **Mobile Data Simplification & Compact Responsive Alignment Complete (Commit `604a436`)**:
   - Refined `Stat`, `Table`, `Th`, `Td`, and `OrderStepper` in `src/components/ui.tsx` with compact padding, truncation, and responsive typography to prevent multi-line number wrapping on 360-390px mobile screens.
   - Compacted `HomeTiers` TodoTiles, section padding, and 4 KPI cards in `src/app/dashboard/home-tiers.tsx`.
   - Refined `OrderCard` and phone customer list rows with compact avatar sizing, tighter spacing, and proper truncation.
   - Optimized `ChatList`, `Conversation` bubbles, `ReplyInbox` header, and `InlineReplyBox` composer padding to prevent keyboard crowding on mobile.
   - Compacted 4-KPI spend strip, ECharts metric tiles, report summary table, campaign schedule cards, and catalogue product cards.
   - Ensured 100% desktop fidelity and breathing room via `sm:*` and `lg:*` responsive utility parity.
   - 100% tests passing (36/36), 0 TypeScript errors, verified production build, pushed to both `origin` and `thabaal`.
2. **Layout Spacing, Button Swap Animations & Sign-in Theme/Language Indicators Complete (Commit `e22d50e`)**:
   - Corrected sign-in theme toggle track inversion bug (day mode renders blue daytime sky; night mode renders dark starry sky).
   - Added animated sliding indicator to language toggle pill (`EN | தமிழ்`) with spring physics transition.
   - Upgraded `buttonClass` with hover elevation (`hover:-translate-y-px`), tactile active compression (`active:scale-[0.97]`), and subtle variant shadows.
   - Added fluid button-swap transitions to `FilterChips`, `Segmented` radio switches, and sub-view navs across Campaigns, Customers, Inbox, Catalogue, Revenue, and Reports.
   - Fixed customer sub-nav tab label from 'Refills' to 'Reorders'.
   - Refined `PageHeader`, `Section`, and `CardHeader` spacing rhythm and vertical centering.
   - Refined dashboard layout container padding (`px-3.5 pt-3.5` on mobile, `lg:pb-12` on desktop).
3. **Database Index Optimization Complete (Commit `98bb860`)**:
   - Added compound and foreign-key indexes on `Message(customerId, createdAt)`, `Message(senderId)`, `Customer(clientId, optedOut, unreachable)`, and `Reply(senderId)`.
   - Additive SQL migration registered in `scripts/db-additive.mjs` and applied to live Neon PostgreSQL database.
4. **Held Tasks (Per User Request)**:
   - **Item 1 (Hold)**: COD-to-Prepaid Instant Discount Nudge (`₹20–₹50 OFF` or `+100 Bonus Loyalty Points`).
   - **Item 2 (Hold)**: Auto-Generated PDF Receipt / GST Bill in Chat upon order payment.
   - **Item 4 (Hold)**: Shipping Tracking Link Integration (`Shiprocket` / `Delhivery` / `India Post` / ST Courier) in `order_status` cards.

