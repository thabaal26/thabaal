# Product suggestions (not built in this run)

Bigger ideas noticed while testing as a shop owner, staff member and admin. Each is a decision for the owner.

1. **Ask "who collected the cash?" on "Delivered, cash received".** The one-tap COD button records the cash without a
   name; the Record payment sheet has "Collected by". A small optional prompt would make cash reconciliation easier.
2. **Have a Tamil speaker read the wording.** Every screen now has Tamil; most short labels live in
   `src/lib/i18n/phrases-ta.ts` (one place to correct a word everywhere) and `docs/tamil-glossary.md`.
3. **Managers-only refunds and undo** (see needs-owner.md): protects against hidden cash mistakes.
4. **One order card everywhere.** `orders/order-actions.tsx` (the older card) is no longer used anywhere; removing
   it avoids two versions of the same buttons drifting apart. Kept for now in case the owner wants parts of it back.
5. **Payment link reminder after a part payment.** The request now asks for the balance; a one-tap "Ask for the
   balance" on part-paid orders would make it obvious.
6. **Return to the same page after signing in again.** When a session expires, staff land on the sign-in page;
   sending them back to where they were (e.g. the order) would save taps.
7. **Packing list addresses on small phones** are cut to one line with "Edit"; a "show full address" tap would help
   delivery staff.
8. **Theme switch on phones** moved to Settings to give the business name room in the top bar. If staff switch
   light/dark often, a slot in the "More" menu would bring it back within one tap.
