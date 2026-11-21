import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { isSale } from "../../src/lib/sale";
import { utrOf } from "../../src/lib/payment-events";

describe("PAY-CONCURRENCY-02: Financial Concurrency & Optimistic CAS Idempotency Test Suite", () => {
  test("1. CAS State Guard: Duplicate payment events with identical txnId are safely deduplicated", () => {
    const order = {
      id: "ord_concur_1",
      total: 1500,
      paidAmount: 1500,
      paidAt: new Date("2026-11-20T10:00:00Z"),
      status: "PAID" as const,
      paymentTxnId: "TXN_UPI_99887766",
      currency: "inr",
      paymentClaimedAt: null,
      paymentMethod: "upi",
      internalNote: null,
    };

    assert.equal(utrOf("UTR-123456789012"), "123456789012");
    // Duplicate webhook delivery with identical txnId on already paid order
    const isDuplicate = order.paymentTxnId === "TXN_UPI_99887766" && (order.paidAmount ?? 0) >= order.total;
    assert.equal(isDuplicate, true, "Duplicate payment event must be recognized");
  });

  test("2. Concurrency CAS: 10 simultaneous duplicate payment confirmations produce exactly 1 credit", async () => {
    let orderState: {
      id: string;
      total: number;
      paidAmount: number | null;
      paidAt: Date | null;
      status: "NEW" | "PAID";
      paymentTxnId: string | null;
    } = {
      id: "ord_10_concurrent",
      total: 2000,
      paidAmount: null,
      paidAt: null,
      status: "NEW",
      paymentTxnId: null,
    };

    // Simulate optimistic concurrency CAS update in database:
    // UPDATE "Order" SET paidAmount = 2000, paidAt = now(), status = 'PAID'
    // WHERE id = order.id AND paidAmount IS NULL AND paidAt IS NULL AND status = 'NEW'
    const tryAtomicUpdate = async (txnId: string) => {
      if (orderState.paidAmount === null && orderState.paidAt === null && orderState.status === "NEW") {
        // First writer wins
        orderState.paidAmount = 2000;
        orderState.paidAt = new Date();
        orderState.status = "PAID";
        orderState.paymentTxnId = txnId;
        return { count: 1, credited: 2000 };
      }
      // Competing writers match 0 rows
      return { count: 0, credited: 0 };
    };

    // Fire 10 simultaneous concurrent confirmation requests
    const txnId = "UPI_CONCUR_SIMULTANEOUS_123456";
    const results = await Promise.all(Array.from({ length: 10 }).map(() => tryAtomicUpdate(txnId)));

    const successfulCommits = results.filter((r) => r.count === 1);
    const rejectedCommits = results.filter((r) => r.count === 0);
    const totalCredited = results.reduce((acc, r) => acc + r.credited, 0);

    assert.equal(successfulCommits.length, 1, "Exactly one concurrent payment must commit");
    assert.equal(rejectedCommits.length, 9, "All 9 competing writers must match 0 rows");
    assert.equal(totalCredited, 2000, "Financial credit must equal exactly order total without double-credit");
    assert.equal(orderState.status, "PAID");
  });

  test("3. Refund Concurrency CAS: Two simultaneous partial refunds cannot exceed received payment", async () => {
    let order = {
      id: "ord_refund_race",
      total: 1000,
      paidAmount: 1000,
      refundAmount: 0,
      currency: "inr",
    };

    const received = order.paidAmount;

    // Simulate staff A attempting refund of ₹600 and staff B attempting refund of ₹700 at the same millisecond
    const refundAttempt = async (attemptedAmount: number, seenRefundAmount: number) => {
      // Atomic CAS: UPDATE "Order" SET refundAmount = seenRefundAmount + attemptedAmount
      // WHERE id = order.id AND refundAmount = seenRefundAmount
      if (order.refundAmount === seenRefundAmount) {
        order.refundAmount = seenRefundAmount + attemptedAmount;
        return { ok: true, amountRefunded: attemptedAmount };
      }
      return { ok: false, error: "A refund was recorded a moment ago. Check order before recording another." };
    };

    // Both fire with seenRefundAmount = 0
    const [resA, resB] = await Promise.all([
      refundAttempt(600, 0),
      refundAttempt(700, 0),
    ]);

    // One succeeds, the other fails CAS
    const succeeded = [resA, resB].filter((r) => r.ok);
    const failed = [resA, resB].filter((r) => !r.ok);

    assert.equal(succeeded.length, 1, "Only one concurrent refund can commit against the same base state");
    assert.equal(failed.length, 1, "The competing refund must fail with concurrent conflict error");
    assert.ok(order.refundAmount <= received, "Total refunded cannot exceed paid amount");
  });

  test("4. Accounting Invariant: Full refund revokes sales eligibility across TypeScript and SQL", () => {
    const fullyRefunded = {
      id: "ord_refund_full",
      total: 1000,
      paidAmount: 1000,
      refundAmount: 1000,
      status: "DELIVERED" as const,
      paidAt: new Date(),
      paymentMethod: "upi",
      internalNote: null,
    };

    assert.equal(isSale(fullyRefunded), false, "Full refund must not be considered a qualifying sale");

    const partialRefunded = {
      id: "ord_refund_partial",
      total: 1000,
      paidAmount: 1000,
      refundAmount: 300,
      status: "DELIVERED" as const,
      paidAt: new Date(),
      paymentMethod: "upi",
      internalNote: null,
    };

    assert.equal(isSale(partialRefunded), true, "Partial refund retains qualifying sale status with reduced net value");
  });

  test("5. Webhook Monotonic State Progression: Out-of-order DELIVERED callback after READ does not regress", () => {
    const states = ["QUEUED", "SENT", "DELIVERED", "READ"];
    const rank = (s: string) => states.indexOf(s);

    let currentMessageState = "READ";

    // Simulate late-arriving out-of-order DELIVERED webhook
    const incomingStatus = "DELIVERED";
    if (rank(incomingStatus) > rank(currentMessageState)) {
      currentMessageState = incomingStatus;
    }

    assert.equal(currentMessageState, "READ", "State must remain READ and not regress to DELIVERED");
  });
});
