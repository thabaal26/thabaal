# Morning summary (QA run on Madhu_changes, 17 Oct 2026)

**Pull request:** https://github.com/thabaal26/thabaal/pull/1 (Madhu_changes → main, already open; QA report added as a
comment). **Not merged.** Nothing was pushed to main.

## What is done

- An isolated QA copy of Thabaal (private database with a fake "QA Test Shop", every real key blanked) and scripts
  that test it end to end: `powershell -File tests/qa/run-all.ps1`.
- **All 25 payment scenarios pass** (26 browser + webhook checks, 81 unit tests): money is never counted twice under
  double taps, slow or dropped connections, refreshes, late or repeated webhooks.
- **Every page** opened as owner, staff, viewer, admin and another business, on desktop and phone: RESULT_CRAWL.
- **Visual check** of 24 pages × 5 screen sizes × light/dark × English/Tamil: RESULT_VISUAL.
- Typecheck, lint, unit tests and production build pass. 115/115 server actions check permissions.

## Most important fixes (full list in docs/qa/REPORT.md)

1. Customer profiles, Messages, and Home/Settings for admins **crashed in production** on this branch. Fixed.
2. **Money counted twice** (webhook + staff at the same moment, double taps, Meta retries). Fixed with
   conditional saves; tested with parallel requests.
3. **Free delivery charged ₹60** in payment requests; part-paid orders asked for the full total again. Fixed.
4. **Fake "payment success"** possible if `META_APP_SECRET` is missing; another business's order could be paid from
   an unknown number. Fixed.
5. **Deleting a customer deleted their orders and payments.** Now refused for customers with orders.
6. Order card: refunds, undo, "payment not received", part payments and correct amounts are back; printing a packing
   slip prints that order; dispatch respects "send WhatsApp update"; sample rider names removed.
7. A dropped connection or expired session no longer breaks the page or loses what was typed.
8. Phones: 40px tap targets, Tamil layout fixes, some missing Tamil labels.

## What needs you (docs/qa/needs-owner.md)

1. Confirm `META_APP_SECRET` is set on Vercel (otherwise WhatsApp payments wait for staff to check).
2. Decide whether staff (not only managers) may refund and undo payments.
3. Open the Vercel preview while signed in to Vercel (it's protected) and glance at Home, Orders, a customer.
4. Merge PR #1 when happy.
5. Demo catalogue for businesses without WhatsApp: keep or replace with an empty "connect" page.

## What didn't get done

- Some screens still show English headings/buttons in Tamil mode (list in suggestions.md).
- Sending real WhatsApp messages can't be tested without a real number (refusals and everything before sending were).
- CodeRabbit isn't installed on the repository, so there were no CodeRabbit comments.
