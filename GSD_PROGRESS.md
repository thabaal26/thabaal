# GSD Execution Progress & Ralph Loop Tracker

## Project: Thabaal WhatsApp Portal
- **Active Branch**: `Madhu_changes`
- **Target Remote**: `origin/Madhu_changes` and `thabaal/Madhu_changes` (NEVER `main`)
- **Safety Standard**: Zero real Meta mutations for live clients; all CRUD tests use dedicated test client `QA Test Shop`.

---

## Phase Checklist

### Phase 1: Setup & Safety (Completed)
- [x] Route & data audit complete.
- [x] Create isolated test client `QA Test Shop` in Neon PostgreSQL database (`cmvbe7lbp0000e0cscxlsqk23`).
- [x] Verify test client has safe dummy credentials and no live Meta webhook binding.

### Phase 2: Live Data & Fallback Removal (Completed)
- [x] Clean `src/lib/reports-data.ts`:
  - [x] Remove `baselineCampaigns` mock data.
  - [x] Remove `baselineLocations` mock data.
  - [x] Remove `baselineProducts` mock data.
  - [x] Remove `stuckItems` mock data fallback.
  - [x] Remove `bestTimes` fallback slots.
  - [x] Remove `whatToRepeat` hardcoded strings.
  - [x] Remove 0-sent simulated numbers (`cost = 3840; sales = 142800...`).
  - [x] Harmonize unpaid carts filter with `overview-screen.tsx` (`(status === 'NEW' || status === 'CONFIRMED') && !paidAt`).
- [x] Restore missing top-right icons across all stat cards:
  - [x] Templates (`/dashboard/templates`)
  - [x] Catalogue (`/dashboard/catalogue`)
  - [x] Catalogue Demand (`/dashboard/catalogue?view=demand`)
  - [x] Customers (`/dashboard/customers`)
  - [x] Customer Detail (`/dashboard/customers/[id]`)
  - [x] Campaigns (`/dashboard/campaigns`)
  - [x] Orders (`/dashboard/orders`)
  - [x] Revenue / Payments (`/dashboard/revenue`)
  - [x] Refills (`/dashboard/refills`)
  - [x] Calls (`/dashboard/calls`)
  - [x] Priority Inbox (`/dashboard/replies/priority`)

### Phase 3: Templates & Catalogue CRUD for "QA Test Shop" (Completed)
- [x] Ensure Template Create / Read / Update / Delete works cleanly with explicit success/error feedback (`src/app/dashboard/actions/templates.ts`).
- [x] Ensure Catalogue Add / Edit / Delete Product works (stock on/off, price, image, category), reflecting in Orders (`src/lib/catalog.ts`).
- [x] Test end-to-end CRUD exclusively against `QA Test Shop` via `tests/unit/crud.test.ts`.

### Phase 4: Chrome MCP Visual QA & Screen Testing (Completed)
- [x] Test screen sizes:
  - [x] `390×844` (Mobile Phone) - Light & Dark
  - [x] `768×1024` (Tablet) - Dark
  - [x] `1366×860` (Laptop) - Dark
  - [x] `1920×1080` (Desktop) - Light & Dark
- [x] Capture and save screenshots under `qa-screenshots/` (16 screenshots captured and archived).
- [x] Verify 0 horizontal scroll, no overlapping or cut-off text, buttons $\ge 40$px tall on phones.
- [x] Read console messages for 0 errors.

### Phase 5: Verification & Quality (Completed)
- [x] `npx tsc --noEmit` (0 TypeScript errors)
- [x] `npm run lint` / ESLint checks (0 errors, 14 warnings)
- [x] `npm test` (44/44 tests passing across 12 test suites)
- [x] Safe commit on `Madhu_changes` branch.
