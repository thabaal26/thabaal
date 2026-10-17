# QA decisions (unattended run, 17 Oct 2026)

Each decision taken without the owner, and why.

1. **Test database = a private Postgres on this computer** (`tests/qa/serve.mjs`, port 5434, data in `.qadb/`), filled with
   "QA Test Shop" data (`tests/qa/seed.mjs`). Not the local `.env` database (a copy of real shop data, with a real Google
   Sheet hook) and never the live one. Every key from the `.env` files is blanked for the QA app unless it has a test
   value, so no real WhatsApp token, sheet, storage key or database can be reached. Checked: blank values survive
   Next.js loading `.env` files.
2. **Payment webhooks are simulated** with payloads signed by the QA app secret (`qa-meta-app-secret`), sent to the
   QA app only.
3. **Screenshots:** the full matrix (every route × 5 sizes × light/dark × English/Tamil) is kept on this computer in
   `.qa-shots/` (not committed: hundreds of images would bloat the repo). Only before/after shots of fixed issues are
   committed under `docs/qa/screens/`.
4. **Money is protected on the server, not only by disabling buttons.** Every write that changes money on an order
   (record payment, WhatsApp payment, verify claim, refund, undo) is a conditional update: it saves only if the order
   still has the paid amount it was read with, otherwise it reads again (or refuses, for staff). Staff payments also
   carry the "already received" amount the screen showed, so a double tap of a part payment can't count twice.
   Chosen over an idempotency-key table because it needs no new table or migration and covers webhook + staff races.
5. **Same WhatsApp transaction id = same payment.** A Meta payment update whose transaction id is already on the order
   is ignored, even for part payments (Meta retries webhooks).
6. **Webhooks without a configured app secret no longer mark orders paid.** Before, a missing `META_APP_SECRET` meant
   every webhook was trusted, so anyone could post a fake "payment success". Now messages are still received (nothing
   lost), but a payment from an unverified webhook becomes "Customer says paid · check" for staff to verify. With the
   secret set (as it should be in production) nothing changes. Owner to confirm the secret is set: see needs-owner.md.
7. **A payment in another currency is never counted;** a payment bubble whose transaction status is not success is
   recorded as a failed attempt.
8. **Payment requests ask only for what is still due.** After a part payment the WhatsApp "Review and pay" is for the
   balance, shown as one line "Balance for order X", with "Already received" and "Balance to pay" in the message.
9. **The stored order total is the truth for money.** `getOrderPricing` no longer adds ₹60 to a stored order whose total
   equals its items (that happened for free delivery set on Edit items, and for orders from before 10 Oct). The ₹60
   default still applies to every new order and new cart. Effect on old orders: one created before shipping existed
   now shows its real stored total instead of total + ₹60 (what the customer was actually asked to pay).
10. **The order card uses `lib/payment-state`** (the same helpers as the server, packing slips and Revenue) for what it
    shows about money. The old inline "Mark paid" dialog (always prefilled the full total, closed before saving, no part
    payments) was replaced by the shared Record payment sheet. Refund, Undo payment and "Payment not received" were
    only in the old OrderActions component, which nothing renders any more; they are now on the order card.
11. **Dispatch dialog:** the rider list ("Murugan (bike)", "Selvam (bike)") was sample data from the design mockup and
    is removed; staff type the delivery person's name (optional) or pick Courier / Customer pickup. Unticking "Send the
    customer a WhatsApp delivery update" now really skips the message (before, it was ignored).
12. **Dropped connections:** every dashboard action that runs in a React transition goes through `safeAction`, which
    turns a network failure into a normal "Couldn't reach Thabaal…" message. Before, React 19 sent the error to the
    dashboard error screen, losing what was typed.
13. **Plain class helpers moved out of the client module.** `components/ui.tsx` became `"use client"` (for Tamil
    labels), which made every server page that called `buttonClass()` crash in production (customer profiles,
    Messages, and Home/Settings for admins). The helpers now live in `components/ui-classes.ts`.
14. **Deleting a customer keeps payment records.** Orders are deleted with their customer (database cascade), so a
    customer with orders can't be deleted any more; "Opt out" stops all messages instead. Customers without orders can
    be deleted from their profile.
15. **Kept: the demo catalogue** (`lib/catalog.ts` DEFAULT_PRODUCTS: Basmati rice, Toor dal…) shown to a business that
    hasn't connected WhatsApp yet. It is intentional demo mode, not leftover data. Note for the owner: edits made in demo
    mode are saved to a file, which doesn't persist on Vercel (suggestions.md).
16. **The existing pull request #1 (Madhu_changes → main) is used** rather than opening a second one for the same
    branch; the QA report is posted on it as a comment. It is not merged.
17. **Tap targets:** the crawler flags under 32px on phones and the visual run under 40px (the brief's rule).
    Inline text links inside sentences are left at their size. A checkbox counts by its label (table checkboxes
    now sit in a 40px label); screen-reader-only controls (a chart's keyboard list) aren't finger targets.
18. **Tamil for shared components comes from one phrase list** (`src/lib/i18n/phrases-ta.ts`): Button, Label,
    Field help, CardHeader, Callout, Badge, EmptyState, Segmented, Picker, Stat and `<T>` look the English up there
    in Tamil mode and show it unchanged when there's no entry. Sentences with numbers or names are written per
    screen. Names, places, products and a language's own name ("English" on the language switch) stay as written;
    the visual check skips them (`data-data`, `lang`).
19. **On phones, compact controls grow to 40px** (`min-h-10 sm:…`) and return to their desktop size from the `sm`
    breakpoint, so computers look the same as before.
