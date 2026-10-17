# Design parity run â€” handoff notes

Read this first if you are picking this task up in a new session or another account.

## The task (owner's words, 17 Oct 2026)

> The sample `thabaal-portal (1).html` is the design we build thabaal.in from. Our pages should replicate exactly
> its look and functionality, except the new campaign features. We almost completed everything but missed minor
> things. Do a final run to check we replicate the HTML's look and functionality with live data connected,
> hardcoded and duplicate data removed and overlays removed. We added some features too (e.g. when several orders
> come in, a dropdown to view each one) â€” keep those. Check each route, click, interaction, every page and every
> page navigated to: all must work with live data, without errors.

## Ground rules (from the owner, still in force)

- Work only on branch **Madhu_changes**. Push to both remotes `thabaal` and `origin`. **Never push/merge to main.**
- Test only on the QA copy (below). Never touch production data, real WhatsApp numbers, payments, Meta templates or
  Google Sheets. No destructive database changes; additive SQL only, listed in `scripts/db-additive.mjs`.
- Never print or commit anything from `.env*`. Don't stage the untracked `scripts/*.mjs`, `.tmp-ui/`, `public/uploads/`.
- Pricing rules stay: â‚¹60 default shipping; loyalty 1 point per â‚¹100, 100 points = â‚¹50, redeem from 50 in â‚¹25 steps,
  max â‚¹250.
- Commit as `Rensog878 <stephane17081999@gmail.com>`; message ends with the Co-Authored-By / Claude-Session lines.

## Where things are

- Project: `C:\Users\step1\OneDrive\Desktop\cupnsaucer\whatsapp-portal` (Windows; Next.js 16, React 19, Prisma 6).
- Sample design: `C:\Users\step1\Downloads\thabaal-portal (1).html` (copy in `.tmp-ui\sample.html`, not committed).
  Single-page app with hash routes: `#index #inbox #orders #payments #customers #products #campaigns #templates
  #reports #settings #guide`, plus sub-routes like `#orders/pack`, `#orders/new`.
- App routes: `/dashboard` (Home), `/dashboard/replies` (Chats), `/dashboard/orders` (+ `?tab=pack`, `/packing`),
  `/dashboard/revenue` (Payments), `/dashboard/customers`, `/dashboard/catalogue` (Products),
  `/dashboard/campaigns`, `/dashboard/templates`, `/dashboard/report`, `/dashboard/settings`, `/dashboard/guide`.
  Shared design classes: `src/app/dashboard/portal.css` + `portal-ui.tsx` (copied from the sample's CSS).

## How to run the QA copy

```
powershell -File tests/qa/run-all.ps1 -Skip payments,payments-ui,crud,crawl-desktop,crawl-phone,visual   # build + start
node tests/qa/qa-login.mjs        # gives the QA logins the password qa-test-123 (QA database only)
```
App: http://localhost:3200 â€” `manager@qa.test` / `qa-test-123` (also staff@, viewer@, admin@qa.test).
Full checks: `powershell -File tests/qa/run-all.ps1` (payments, CRUD, crawls, 480-screen visual matrix).

## Progress (update as you go)

| Page | Look vs sample | Clicks / interactions | Live data, no sample/duplicates | Notes |
|---|---|---|---|---|
| Home | | | | |
| Chats | | | | |
| Orders (+ pack, new) | | | | |
| Payments | | | | |
| Customers (+ profile) | | | | |
| Products | | | | |
| Campaigns | n/a (new features kept) | | | |
| Templates | | | | |
| Reports | | | | |
| Settings | | | | |
| Guide | | | | |
| Sign-in / root | | | | |

## Findings and fixes

(append below, newest last)
