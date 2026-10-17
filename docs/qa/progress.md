# QA progress

How to resume: start the QA app with `node tests/qa/serve.mjs` (needs `npx next build` first), then run the scripts in
`tests/qa/`. Logins for the QA roles are written to `.git/qa-state.json` on start.

| Phase | Status |
|---|---|
| 0. Safety + QA environment | done: private Postgres + seeded QA Test Shop, app on :3200 with all real keys blanked |
| 1. Inventory | in progress |
| 2. Live data + wiring | pending |
| 3. Payment flow | pending |
| 4. User journeys | pending |
| 5. Visual QA | pending |
| 6–7. Fix + verify | pending |
