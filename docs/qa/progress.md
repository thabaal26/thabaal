# QA progress

How to resume: `powershell -File tests/qa/run-all.ps1` builds the app, starts the QA app (private Postgres on :5434
with a fresh QA Test Shop, app on :3200, every real key blanked) and runs every QA script; logs in `.git/qa-*.log`.
Logins for the QA roles are written to `.git/qa-state.json` on start.

| Phase | Status |
|---|---|
| 0. Safety + QA environment | done: `tests/qa/serve.mjs`, `tests/qa/seed.mjs` |
| 1. Inventory | done: `docs/qa/inventory.md` |
| 2. Live data + wiring | done: crawl of every page as 5 roles (desktop + phone), CRUD for customers and templates, permission and cross-business checks, static check that all 115 server actions check permissions |
| 3. Payment flow | done: 25 scenarios covered by `tests/qa/payments.mjs` (14 webhook checks), `tests/qa/payments-ui.mjs` (12 browser checks) and unit tests (payment-workflow, points-wallet) |
| 4. User journeys | done within the payment and CRUD scripts (owner: confirm, request, record, refund; staff: cash, COD, dispatch; admin: crawl across businesses) |
| 5. Visual QA | done: `tests/qa/visual.mjs`, 24 routes × 5 sizes × light/dark × en/ta; screenshots in `.qa-shots/` |
| 6. Fix | done for everything listed in the morning summary; open items in needs-owner.md and suggestions.md |
| 7. Verify | done: final build + run-all (payments 14/14, browser payments 12/12, CRUD 12/12, crawls, visual), tsc, eslint, 76 unit tests; QA report posted on PR #1 (not merged) |
