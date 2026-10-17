# Inventory (Madhu_changes, 17 Oct 2026)

What the QA run covered: every route, where its data comes from, the server actions behind its buttons, and the
journeys per role. Interactive elements were not listed by hand: the crawler (`tests/qa/crawl.mjs`) opens every page
as every role and follows every internal link, tab and filter it finds (≈145 pages per role, 600+ page visits per
run), and the payment scripts (`tests/qa/payments*.mjs`) press the money buttons.

## Pages (src/app)

| Route | Data (Prisma models read on the server) | Main actions (server actions) |
|---|---|---|
| `/` , `/login`, `/privacy`, `/terms` | none / session | `login`, `logout` |
| `/dashboard` (Home) | orders, customers, messages, replies, wallet (overview-screen, intelligence-hub) | links to every section; Tamil/English, theme |
| `/dashboard/orders` | order (+customer, client), catalogue products | orders.ts: `setOrderStatus`, `setOrderPacked`, `notifyOrder`, `requestPayment`, `setOrderPointsAction`, `saveLoyaltyAutoRedeem`, `savePaymentConfig`, `saveOrderAddress`, `createOrder`, `updateOrderItems`, `updateOrderExtra`; payments.ts: `recordPayment`, `setPaymentMethod`, `deliverCod`, `verifyPaymentClaim`, `recordRefund`, `undoPayment` |
| `/dashboard/orders/packing` | order | print slips / labels (client side) |
| `/dashboard/revenue` | client, template, payments-data (orders) | `verifyPaymentClaim`, `requestPayment`, `recordPayment`, `setPaymentMethod` |
| `/dashboard/customers` (+ `[id]`, `audiences`, `fields`, `grow`, `sheet`) | customer, pendingCustomer, audience, template, whatsAppNumber, client | customers.ts (`saveCustomer`, `importCustomers`, `setOptOut`, `deleteCustomer`, `adjustLoyaltyPoints`, `tagCustomers`, pending customers), audiences.ts, custom-fields.ts, sheets.ts, send.ts |
| `/dashboard/catalogue` (+ `combos`) | client, order, catalogue (Meta catalogue via lib/catalog) | catalog.ts: `createProduct`, `updateProduct`, `deleteProduct`, `uploadProductImage`, `sendCatalogue` |
| `/dashboard/templates` (+ `[id]`, `new`) | template, client | templates.ts: `saveTemplate`, `syncTemplates`, `deleteTemplate`, `sendTestMessage`, `setDefaultImage` |
| `/dashboard/campaigns` (+ `[id]`, `new`, `compare`) | campaign, customer, client, template, message | campaigns.ts: `saveCampaign`, `toggleCampaign`, `deleteCampaign`, `runCampaignNow`, `sendCampaignTest`, `duplicateCampaign`, `countCampaignAudience`, `cancelRun`, `retryHeldBackNow` |
| `/dashboard/messages` | message, campaign | export CSV (`/api/messages/export`) |
| `/dashboard/replies` (+ `priority`) | reply, message | replies.ts: `setReplyHandled`, `handleAllReplies`, `handleRepliesOf`; send.ts: `replyToCustomer` |
| `/dashboard/notifications` | reply, order, call, message | links |
| `/dashboard/calls` | call | calls.ts |
| `/dashboard/refills` | orders (refill rules) | `sendRefillNudge` |
| `/dashboard/report` | orders, messages (report-dashboard) | none (read only) |
| `/dashboard/wallet` | client, walletEntry, setting | wallet.ts: `requestRecharge`, `decideRecharge`, `adjustWallet`, `saveWalletSettings`, `saveWalletPayment`; spend.ts: `addTopUp`, `deleteTopUp`, Meta balance sync |
| `/dashboard/settings` | customer, order, client | account.ts `changePassword`, appearance.ts, provider.ts, orders.ts (`saveOrderFlow`, refill/winback rules), sheets.ts |
| `/dashboard/clients` (admin) | client | clients.ts (create client, numbers, users, sending rules, branding, tokens) |
| `/dashboard/guide` | none | none |

## API routes

`/api/webhook` (Meta: messages, statuses, payments, calls; HMAC-checked), `/api/waha/webhook`, `/api/cron`
(CRON_SECRET), `/api/auth/google` (+callback), `/api/calls`, `/api/customers/export`, `/api/messages/export`,
`/api/manifest/[clientId]`, `/api/media/[id]`, `/api/notifications`, `/api/session/clear`, `/api/upload` (+`[id]`),
`/pwa-icon/[variant]`.

## Hardcoded / sample values found

| Where | Value | Done |
|---|---|---|
| Orders → Dispatch dialog | riders "Murugan (bike)", "Selvam (bike)" | removed; delivery person's name is typed (decision 11) |
| Orders page (admin, no business picked) | business name fallback "Thenan Oils" | now "All businesses" |
| Order card "Mark paid" | amount prefilled with the full total even when part paid | shared sheet prefilled with what's due |
| `lib/order-templates.ts`, `lib/media.ts` | `thenan_` template-name prefix | kept: intentional compatibility with Thenan's existing Meta templates |
| `lib/catalog.ts` | "kambu" in category keywords | kept: a real millet word used to sort products |

## Journeys per role

| Role | What they can do | Checked by |
|---|---|---|
| Admin | every business; pick one with the business switcher; clients, numbers, wallet decisions | crawl (admin + `wp_client`) |
| Manager (owner) | everything in their own business: campaigns, templates, customers, orders, payments, settings | crawl, payments-ui (all money flows) |
| Staff | orders, payments, replies, customers; not campaigns/templates/settings | crawl (staff), server checks `requireManager` vs `requireOrderAccess` |
| Viewer | read only | crawl (viewer): no action should change data |
| Other business's manager | must never see QA Test Shop data | crawl (otherManager) looks for QA names/refs on every page |

Screen sizes: desktop 1366×860 and phone 390×844 crawls; the full visual matrix (5 sizes × light/dark × en/ta) is
`tests/qa/visual.mjs`.
