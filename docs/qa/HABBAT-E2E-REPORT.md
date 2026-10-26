# Habbat end-to-end test report (27 Oct 2026)

Purpose: confirm Habbat is ready before its login goes to the client. Run by Claude on the owner's computer.
The live checks were read-only. Everything that writes ran on the throwaway local test database.

## Result

No test failed. Habbat is ready to hand over after the decisions below. Three things stop it from sending
campaigns or taking real orders yet (see "Before the client logs in").

## What passed

| Area | Result |
|---|---|
| Live data (read-only) | 20 of 20: one Habbat business, all sections on, logo set, Growth active to 26 Nov 2026, one login (client manager), 1,168 customers (valid 91 + 10-digit mobiles, no duplicates, none opted out, all tagged habbat-guests, opt-in source and date on each), none under any other business, no order, campaign or message yet |
| Repo unit checks | 104 of 104 |
| One business never sees another's data (HTTP) | 14 of 14 (25 pages and exports per business, customer and order lookups, webhook routing, unsigned webhook refused) |
| Type check / production build | clean / builds |
| Every page opens (32 routes, production build) | all 200, no error text, 26 to 121 ms; the admin-only Clients page sends a client login back to Home |
| Sign-in | wrong password rejected with a clear message; right password reaches Home; sign out works; private pages redirect to login when signed out |
| Customers | list and count, search, add customer (count +1), customer page, opt out (drops out of the campaign audience), export CSV (1,168 rows) |
| Orders | new order saved as `#HABB-1001` (own prefix), total correct, shows on Home and the bell |
| Campaign builder, Templates, Chats, Settings, Payments, Reports, Account | open and show sensible empty states |
| Language | Tamil and English switch both ways |
| Phone layout | Home reads well; no sideways scrolling on 7 busy pages at 375 px |

## Could not be tested

- **Signing in to the live site as the Habbat login.** Claude does not type passwords into live sites. The owner
  should do this once (checklist below).
- **Vercel deployment status.** The Vercel connection has no access to the team. Check that the latest production
  deployment is READY (main is at `bbb37f1`; the Habbat logo file is only live after that deploy).
- **Sending any WhatsApp message** (campaign, template, payment link, chat reply). Habbat has no WhatsApp number and
  no templates, so sending cannot work yet and cannot be tested.
- **CSV import through the upload screen.** The same logic was exercised by `scripts/habbat-setup.ts` instead.

## Before the client logs in

1. **WhatsApp number and templates.** Settings says "No WhatsApp number connected yet. Your Thabaal admin adds it"
   (Clients page). Campaigns, chat replies and payment links stay unusable until a number is connected and templates
   are created and approved by Meta.
2. **Demo products.** A business with no connected Meta catalogue is shown the app's 10 made-up grocery items
   (Basmati rice, Toor dal, bath towel...) on Products and in the New order form, with no "demo" label, and
   Settings counts them as 10 products. For a restaurant this looks wrong. Either add Habbat's real menu items, or
   switch Products (and Orders) off again for Habbat in Clients > sections.
3. **Consent.** The 1,168 numbers are a restaurant guest list, not a WhatsApp sign-up. The campaign builder's
   default is "Campaign active", every Tue and Fri, to all opted-in customers. Get Habbat's confirmation that guests
   agreed to WhatsApp messages, and review the first campaign carefully before switching it on.
4. **Names.** 682 contacts are called "Guest", so name greetings read "Hi Guest".
5. **Password.** The starting password for the Habbat login is weak. Ask the client to change it on first sign-in
   (Settings > Your account).
6. **Plan.** Growth (monthly) ends 26 Nov 2026; renew or record the next period before then.

## Owner's 2-minute check on the live site

Sign in as the Habbat login, then confirm: Home says "Good morning, Habbat" and the Habbat flower logo shows (after
the deploy); Customers shows 1,168; My account shows Growth active until 26 Nov 2026; Settings says no WhatsApp
number connected. Do not message anyone from it yet.
