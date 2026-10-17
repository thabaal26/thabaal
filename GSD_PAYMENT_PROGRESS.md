# GSD Payment Workflow & Security Tracker

## Project: Thabaal WhatsApp Portal
- **Active Branch**: `Madhu_changes`
- **Target Remote**: `origin/Madhu_changes` and `thabaal/Madhu_changes` (NEVER `main`)
- **Safety Standard**: Zero real Meta mutations, zero real money; all tests use dedicated test client `QA Test Shop` and simulated HMAC-signed payloads.

---

## Phase Checklist

### Phase 1: Workflow Mapping & Audit (Completed)
- [x] Trace all 10 payment paths in code.
- [x] Map pure 10-state machine (`src/lib/payment-state.ts`).
- [x] Identify critical bug in Meta amount parsing (`10 ** offset` vs divisor `offset: 100`).
- [x] Audit multi-tenant isolation, replay protection, refund invariants, and undo guards.

### Phase 2: Security & Amount Parsing Fixes (In Progress)
- [ ] Implement robust `parseMetaAmount` helper in `src/app/api/webhook/route.ts` supporting both divisor (`offset: 100`) and exponent (`offset: 2`).
- [ ] Ensure strict sanitization and validation on all payment inputs (`amount`, `method`, `reference`, `collectedBy`).
- [ ] Verify atomic DB saving and Google Sheet synchronization.

### Phase 3: Comprehensive Payment Test Suite
- [ ] Create `tests/unit/payment-workflow.test.ts` covering:
  - [ ] Webhook HMAC SHA256 signature verification (valid, invalid, missing).
  - [ ] Native Meta UPI payment webhook (status transition, `paidAt`, `paymentTxnId`).
  - [ ] Idempotency on repeated webhook deliveries.
  - [ ] Superseded cart auto-routing to active order.
  - [ ] UTR extraction, duplicate UTR replay protection, and claim verification.
  - [ ] Manual staff payment recording (`recordPayment`) and part-payments.
  - [ ] Cash on Delivery (COD) flow and delivery handover.
  - [ ] Refund capping invariants (`recordRefund`).
  - [ ] Undo payment restrictions on Meta-confirmed payments (`undoPayment`).
  - [ ] Multi-tenant isolation between different clients.

### Phase 4: Chrome MCP Visual QA on Payment Screens
- [ ] Walk through payment UI components:
  - [ ] Order payment status cards & badges
  - [ ] Record payment modal
  - [ ] Payment claim verification UI
  - [ ] Refund modal
  - [ ] Undo payment button
  - [ ] Wallet top-up & balance cards
- [ ] Capture screenshots at `390×844` (Mobile) and `1920×1080` (Desktop).
- [ ] Verify 0 horizontal scroll, clean spacing, and 0 console errors.

### Phase 5: Verification & Quality Gates
- [ ] `npx tsc --noEmit` (0 TypeScript errors)
- [ ] `npm run lint` (0 ESLint errors)
- [ ] `npm test` (all unit and integration tests passing)
- [ ] Safe commit & push to `Madhu_changes` remote.
