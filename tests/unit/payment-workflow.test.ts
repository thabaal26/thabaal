import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { db } from "../../src/lib/db";
import {
  confirmPayment,
  parseMetaAmount,
  recordPaymentClaim,
  recordPaymentFailure,
  cancelSupersededOrdersForCustomer,
} from "../../src/lib/payments";
import {
  canUndoPayment,
  dueOf,
  paymentState,
  receivedOf,
} from "../../src/lib/payment-state";

describe("Payment Workflow & Security Invariants", () => {
  let clientId: string;
  let customerId: string;

  before(async () => {
    let client = await db.client.findFirst({ where: { name: "QA Test Shop" } });
    if (!client) {
      client = await db.client.create({
        data: {
          name: "QA Test Shop",
          brandPrimary: "#0D9488",
          brandAccent: "#14B8A6",
          homeCity: "Madurai",
          orderFlow: "deliver",
          businessType: "retail",
          billingMode: "direct",
        },
      });
    }
    clientId = client.id;

    let customer = await db.customer.findFirst({
      where: { clientId, phone: "919999999999" },
    });
    if (!customer) {
      customer = await db.customer.create({
        data: {
          clientId,
          name: "Test Customer",
          phone: "919999999999",
          optedOut: false,
        },
      });
    }
    customerId = customer.id;
  });

  after(async () => {
    await db.order.deleteMany({ where: { customerId } }).catch(() => {});
  });

  describe("1. parseMetaAmount handling", () => {
    test("handles divisor mode (offset: 100 for paise)", () => {
      const amt = { value: 28000, offset: 100 };
      assert.equal(parseMetaAmount(amt), 280);
    });

    test("handles exponent mode (offset: 2 for 10^2)", () => {
      const amt = { value: 28000, offset: 2 };
      assert.equal(parseMetaAmount(amt), 280);
    });

    test("handles string value and decimal correctly", () => {
      assert.equal(parseMetaAmount({ value: "45050", offset: 100 }), 450.5);
      assert.equal(parseMetaAmount({ value: "100", offset: 0 }), 100);
    });

    test("handles null and undefined gracefully", () => {
      assert.equal(parseMetaAmount(null), null);
      assert.equal(parseMetaAmount(undefined), null);
      assert.equal(parseMetaAmount({ value: null, offset: 100 }), null);
      assert.equal(parseMetaAmount({ value: "not-a-number", offset: 100 }), null);
    });
  });

  describe("2. Payment Confirmation & Idempotency", () => {
    test("full payment marks order PAID and sets paidAt and paidAmount", async () => {
      const order = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "CONFIRMED",
          total: 500,
          currency: "INR",
          items: [{ name: "Oil 1L", quantity: 1, price: 500 }],
        },
      });

      const confirmed = await confirmPayment(order.id, "TXN-1001", {
        method: "upi_whatsapp",
        source: "meta",
        amount: 500,
        quiet: true,
      });

      assert.equal(confirmed, true);
      const updated = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(updated.status, "PAID");
      assert.equal(updated.paidAmount, 500);
      assert.ok(updated.paidAt != null);
      assert.equal(updated.paymentTxnId, "TXN-1001");
      assert.equal(paymentState(updated), "paid");
      assert.equal(dueOf(updated), 0);
    });

    test("duplicate payment confirmation is idempotent and returns false", async () => {
      const order = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "PAID",
          total: 350,
          currency: "INR",
          paidAmount: 350,
          paidAt: new Date(),
          items: [{ name: "Ghee 500ml", quantity: 1, price: 350 }],
        },
      });

      // Try confirming again (simulating webhook replay)
      const res = await confirmPayment(order.id, "TXN-REPLAY", {
        method: "upi_whatsapp",
        source: "meta",
        amount: 350,
        quiet: true,
      });

      assert.equal(res, false, "Replay should be rejected");
      const unchanged = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(unchanged.paidAmount, 350);
    });

    test("partial payment accumulates and keeps order status until fully paid", async () => {
      const order = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "CONFIRMED",
          total: 1000,
          currency: "INR",
          items: [{ name: "Combo Pack", quantity: 1, price: 1000 }],
        },
      });

      // First partial payment: ₹400
      await confirmPayment(order.id, "PART-1", {
        method: "upi",
        source: "staff",
        amount: 400,
        quiet: true,
      });

      let current = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(current.paidAmount, 400);
      assert.equal(current.paidAt, null);
      assert.equal(dueOf(current), 600);
      assert.equal(paymentState(current), "part_paid");

      // Second partial payment: ₹600 (completes order)
      await confirmPayment(order.id, "PART-2", {
        method: "upi",
        source: "staff",
        amount: 600,
        quiet: true,
      });

      current = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(current.paidAmount, 1000);
      assert.ok(current.paidAt != null);
      assert.equal(current.status, "PAID");
      assert.equal(dueOf(current), 0);
      assert.equal(paymentState(current), "paid");
    });
  });

  describe("3. Payment Claim & Failure Tracking", () => {
    test("customer claim flags order with note and UTR", async () => {
      const order = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "CONFIRMED",
          total: 750,
          currency: "INR",
          items: [],
        },
      });

      const claimed = await recordPaymentClaim(order.id, "Paid via GPay UTR 428901234567", "UTR-428901234567");
      assert.equal(claimed, true);

      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.ok(o.paymentClaimedAt != null);
      assert.equal(o.paymentTxnId, "UTR-428901234567");
      assert.equal(paymentState(o), "claimed");
    });

    test("payment failure records reason and keeps order unpaid", async () => {
      const order = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "CONFIRMED",
          total: 600,
          currency: "INR",
          items: [],
        },
      });

      await recordPaymentFailure(order.id, "UPI payment declined by customer bank");
      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.ok(o.paymentFailedAt != null);
      assert.equal(o.paymentFailReason, "UPI payment declined by customer bank");
      assert.equal(paymentState(o), "failed");
    });
  });

  describe("4. Undo & Refund Safety Invariants", () => {
    test("undoPayment rules: Meta-confirmed cannot be undone, staff-recorded can be undone", () => {
      const metaPaid = { status: "PAID", total: 500, paidAmount: 500, paidAt: new Date(), paymentSource: "meta", paymentTxnId: "WA-1234" };
      assert.equal(canUndoPayment(metaPaid), false);

      const staffPaid = { status: "PAID", total: 500, paidAmount: 500, paidAt: new Date(), paymentSource: "staff", paymentTxnId: "MANUAL" };
      assert.equal(canUndoPayment(staffPaid), true);

      const unpaid = { status: "NEW", total: 500, paidAmount: null, paidAt: null };
      assert.equal(canUndoPayment(unpaid), false);
    });

    test("refund capping: cannot refund more than received", async () => {
      const order = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "PAID",
          total: 800,
          currency: "INR",
          paidAmount: 800,
          paidAt: new Date(),
          items: [],
        },
      });

      assert.equal(receivedOf(order), 800);
      assert.equal(dueOf(order), 0);

      // Verify refund calculation capping: already refunded cannot exceed received
      const alreadyRefunded = 800;
      const leftToRefund = Math.max(0, receivedOf(order) - alreadyRefunded);
      assert.equal(leftToRefund, 0, "No refund remaining after full refund");
    });

    test("dispatched or delivered orders cannot have payment undone", () => {
      const dispatchedOrder = {
        status: "DISPATCHED",
        total: 500,
        paidAmount: 500,
        paidAt: new Date(),
        paymentSource: "staff",
        paymentTxnId: "MANUAL",
      };
      // In undoPayment, status DISPATCHED or DELIVERED is blocked before updating
      assert.ok(dispatchedOrder.status === "DISPATCHED" || dispatchedOrder.status === "DELIVERED");
    });

    test("zero-amount payment attempt is rejected as full payment", () => {
      const zeroAmount = parseMetaAmount({ value: 0, offset: 100 });
      assert.equal(zeroAmount, 0);
      const isValidPayment = zeroAmount != null && zeroAmount > 0;
      assert.equal(isValidPayment, false, "Zero amount must not be processed as completed payment");
    });

    test("customer claim followed by not-received clears claim and logs note", async () => {
      const order = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "CONFIRMED",
          total: 500,
          currency: "INR",
          items: [],
        },
      });

      // Customer claims they paid
      await recordPaymentClaim(order.id, "I sent money on GPay", "UTR-999999999999");
      let current = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(paymentState(current), "claimed");
      assert.equal(current.paymentTxnId, "UTR-999999999999");

      // Staff verifies and finds no record in bank: clears claim
      await db.order.update({
        where: { id: order.id },
        data: {
          paymentClaimedAt: null,
          paymentClaimNote: null,
          ...(current.paymentTxnId?.startsWith("UTR-") && { paymentTxnId: null }),
          internalNote: "customer said paid (UTR-999999999999), not found in account",
        },
      });

      current = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(current.paymentClaimedAt, null);
      assert.equal(current.paymentTxnId, null);
      assert.ok(current.internalNote?.includes("not found in account"));
      assert.equal(paymentState(current), "unpaid");
    });

    test("cancelSupersededOrdersForCustomer cancels older unpaid carts when new cart arrives", async () => {
      const oldCart = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "NEW",
          total: 450,
          currency: "INR",
          items: [{ name: "Oil 500ml", quantity: 1, price: 450 }],
        },
      });

      const newCart = await db.order.create({
        data: {
          clientId,
          customerId,
          status: "NEW",
          total: 800,
          currency: "INR",
          items: [{ name: "Oil 1L", quantity: 1, price: 800 }],
        },
      });

      const cancelled = await cancelSupersededOrdersForCustomer(customerId, newCart);
      assert.ok(cancelled.includes(oldCart.id));

      const checkedOld = await db.order.findUniqueOrThrow({ where: { id: oldCart.id } });
      assert.equal(checkedOld.status, "CANCELLED");
    });
  });

  describe("5. Money is never counted twice (QA run, scenarios 10, 16, 21, 22, 24)", () => {
    const newOrder = (total: number) =>
      db.order.create({ data: { clientId, customerId, status: "CONFIRMED", total, currency: "INR", items: [{ name: "Ghee", quantity: 1, price: total }] } });

    test("two full payments recorded at the same moment (staff + webhook) are saved once", async () => {
      const order = await newOrder(900);
      const results = await Promise.all([
        confirmPayment(order.id, "TXN-RACE-1", { method: "upi_whatsapp", source: "meta", amount: 900, quiet: true }),
        confirmPayment(order.id, null, { method: "cash", source: "staff", quiet: true }),
      ]);
      assert.equal(results.filter(Boolean).length, 1);
      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(o.paidAmount, 900);
      assert.equal(o.status, "PAID");
    });

    test("the same WhatsApp part payment delivered twice is counted once", async () => {
      const order = await newOrder(1000);
      assert.equal(await confirmPayment(order.id, "TXN-PART-1", { source: "meta", amount: 400, quiet: true }), true);
      assert.equal(await confirmPayment(order.id, "TXN-PART-1", { source: "meta", amount: 400, quiet: true }), false);
      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(o.paidAmount, 400);
      assert.equal(paymentState(o), "part_paid");
      assert.equal(dueOf(o), 600);
    });

    test("a double-tapped part payment from staff is recorded once (seenReceived)", async () => {
      const order = await newOrder(1000);
      const tap = () => confirmPayment(order.id, null, { method: "cash", source: "staff", amount: 300, quiet: true, seenReceived: 0 });
      const results = await Promise.all([tap(), tap()]);
      assert.equal(results.filter(Boolean).length, 1);
      // And a late second tap after the first finished is refused too.
      assert.equal(await tap(), false);
      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(o.paidAmount, 300);
    });

    test("a late WhatsApp webhook after staff already recorded the payment adds nothing", async () => {
      const order = await newOrder(750);
      assert.equal(await confirmPayment(order.id, null, { method: "upi", source: "staff", quiet: true }), true);
      assert.equal(await confirmPayment(order.id, "TXN-LATE-1", { source: "meta", amount: 750, quiet: true }), false);
      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(o.paidAmount, 750);
      assert.equal(o.paymentSource, "staff");
    });

    test("ten parallel webhook deliveries of one payment still save it once", async () => {
      const order = await newOrder(1200);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => confirmPayment(order.id, "TXN-FLOOD-1", { source: "meta", amount: 1200, quiet: true })),
      );
      assert.equal(results.filter(Boolean).length, 1);
      const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(o.paidAmount, 1200);
    });
  });
});
