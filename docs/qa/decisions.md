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
