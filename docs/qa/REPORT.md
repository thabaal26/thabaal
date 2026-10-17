# QA report: Madhu_changes, 17 Oct 2026

Everything was tested on an isolated QA app on the owner's computer: a private Postgres with a fake "QA Test Shop"
(and "QA Other Shop" to prove businesses can't see each other), every real key blanked, webhooks signed locally.
No real customer, number, sheet, Meta account or money was touched. Run it again with
`powershell -File tests/qa/run-all.ps1`.

## Results

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`), lint (`eslint`) | pass |
| Unit tests (`node tests/run.mjs`) | 76 / 76 |
| Server actions with a permission check (`tests/qa/action-guards.mjs`) | 115 / 115 |
| Payment webhooks (`tests/qa/payments.mjs`) | 14 / 14 |
| Payments by hand in Chrome (`tests/qa/payments-ui.mjs`) | 12 / 12 |
| Create / edit / delete + permissions (`tests/qa/crud.mjs`) | 12 / 12 |
| Every page, 5 roles, desktop (`tests/qa/crawl.mjs desktop`) | CRAWL_DESKTOP |
| Every page, 5 roles, phone (`tests/qa/crawl.mjs phone`) | CRAWL_PHONE |
| Visual matrix: 24 routes × 5 sizes × light/dark × en/ta (`tests/qa/visual.mjs`) | VISUAL |
| Production build (`next build`) | pass |

## The 25 payment scenarios

| # | Scenario | How it was tested | Result |
|---|---|---|---|
| 1 | Cart → Review and pay → paid webhook → Paid | webhook script: status, paidAt, paidAmount, txn id, source, method checked | pass |
| 2 | Manual order → payment request → paid | request: refused with a clear message without a WhatsApp connection (QA has none, by design); paid path = #1 | pass (send itself not run: no real WhatsApp in QA) |
| 3 | UPI outside WhatsApp → claim → staff verify → Paid | browser: claim shown on the card, "Payment received" → paid, source "verified" | pass |
| 4 | Staff record UPI / cash; part payment then balance | browser: part payment (collectedBy saved) → "Part paid" → balance prefilled → Paid | pass |
| 5 | Cash on delivery: confirm → dispatch → cash collected | browser: "Delivered, cash received" → DELIVERED, cod, paid | pass |
| 6 | Loyalty points at checkout → right total → paid | unit: points by hand in ₹25 steps, total lowered, paying it marks paid | pass |
| 7 | Refund full and part; undo where allowed | browser: part refund recorded once; Undo hidden for WhatsApp-confirmed, works for staff-recorded | pass |
| 8 | Wallet top-up and per-message charges | unit: charged once per message even when Meta reports twice; demo messages never charged | pass |
| 9 | Bad or missing signature → rejected, nothing saved | webhook: 401 / 401, order unchanged; bad JSON 400 | pass |
| 10 | Same webhook twice / out of order → saved once | webhook: duplicate, 5 parallel copies, "failed" after success | pass |
| 11 | Amount or currency differs | webhook: smaller amount = part paid; other currency = flagged, not counted | pass |
| 12 | Another business's reference → ignored | webhook: QO-1001 unchanged | pass |
| 13 | Payment on a replaced cart → latest active order | webhook: money lands on the new order, not the cancelled one | pass |
| 14 | Failed payment → reason, unpaid, retry | webhook: reason saved, then a retry pays; failed bubble not counted | pass |
| 15 | Refund larger than received / undo not allowed → refused | browser: "Only ₹610.00 can be refunded"; undo refused for WhatsApp-confirmed | pass |
| 16 | Two staff / staff + webhook at once → once | unit: parallel staff + webhook, 10 parallel webhooks: one payment | pass |
| 17 | Edit items on a paid order → balance shown, payment kept | browser: total up, paid amount kept, card "Part paid · ₹255 due" | pass |
| 18 | Points over the balance refused; cancelled order returns points | unit: refused, total unchanged; cancelled orders don't count (loyalty test) | pass |
| 19 | Zero total / opted out / closed window → clear message, nothing sent | browser: "opted out", "24-hour window has closed…"; nothing logged as sent | pass |
| 20 | Offline on a money action | browser: "Couldn't reach Thabaal…", sheet stays open, nothing saved, retry saves once | pass |
| 21 | Slow 3G: loading, no double submit | browser: button busy, repeat taps ignored, one record | pass |
| 22 | Double click | browser: one record | pass |
| 23 | Refresh mid-action | browser: whole or nothing; the page shows what is stored | pass |
| 24 | Late webhook after staff recorded it | webhook: nothing added | pass |
| 25 | Session expired mid-action | browser: sent to sign in, nothing saved | pass |

## Bugs found and fixed (most serious first)

**Money / data loss**
1. Money could be counted twice: a webhook and staff at the same moment, a double tap or Meta's parallel retries all
   added to the paid amount. Now every money write is conditional (and retried), the same WhatsApp transaction is
   never counted twice, and staff payments carry what the screen showed.
2. Free delivery set on Edit items was charged ₹60 again in the payment request (and orders from before shipping
   showed ₹60 more than stored). The stored total is now the truth.
3. A part-paid order's payment request asked for the full total again; it now asks for the balance.
4. Deleting a customer deleted their orders (and payments, refunds) with them. Customers with orders can't be deleted.
5. Points could change an order's total while a payment was landing.
6. A payment noted first on a "customer says paid" claim was later ignored as a duplicate.

**Security**
7. Without `META_APP_SECRET`, anyone could post a fake "payment success". Unverified payments now wait for staff.
8. A webhook from an unknown number could pay another business's order by its reference.
9. The QA Test Shop template exception now only applies on a QA server.

**Broken flows**
10. Customer profiles, Messages, and Home/Settings for admins crashed in production (server pages calling a function
    from a client module).
11. Refund, Undo payment and "Payment not received" had disappeared from the order card in the redesign; back.
12. A dropped connection on any dashboard action showed the error screen and lost what was typed.
13. An expired session showed "couldn't reach Thabaal" instead of sending the user to sign in.
14. Dispatch: "Send WhatsApp update" unticked still sent it; the dialog closed before saving.
15. Print packing slip printed the whole Orders page.
16. No way to delete a customer without orders.

**Wrong data**
17. Order card: part payments, claims, failures and refunds all showed as "₹total received" / "not received yet".
18. Receipt said the full total was paid, and "Today" for unpaid orders.
19. Sample data: riders "Murugan (bike)" / "Selvam (bike)"; "Thenan Oils" as the business name for admins.
20. "Mark paid" was always prefilled with the full total.

**Visual**
21. Phones: header controls, filter chips and small buttons now at least 40px; theme switch moved to Settings on phones.
22. Home "to do" link pushed off the screen in Tamil; notification chips showed stray bullets.
23. Tamil: greeting, customer page buttons.

Before screenshots: `docs/qa/screens/*-before.png`; after: `*-after.png`.

## Known limitations

- Several screens still have English headings and buttons in Tamil mode (list in suggestions.md, item 2).
- WhatsApp sending itself (payment request delivery, thank-you messages) can't be run in QA without a real
  number; the code paths up to sending, and the refusals, were tested.
- The Vercel preview of Madhu_changes could not be opened from here (no Vercel access); see needs-owner.md.

## Client handover note

Thabaal is ready for the shop to use on phone and desktop, in English and Tamil. Payments by WhatsApp UPI are marked
paid automatically; payments outside WhatsApp, cash on delivery, part payments, refunds and corrections are recorded
from the order card, and none of them can be counted twice. Before going live: confirm `META_APP_SECRET` is set on
Vercel and decide whether staff may refund/undo (needs-owner.md).
