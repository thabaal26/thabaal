// How an order was paid and why it was cancelled (lib/payment-app.ts; Order.paymentApp, cancelledAt, cancelledBy):
// the UPI app is found in what the customer wrote, their UPI ID's handle, or what staff picked, and kept once known;
// every way an order is cancelled says when and by whom. Meta is never called.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { expireUnfinishedOrders } from "../../src/lib/cart-followups";
import { db } from "../../src/lib/db";
import { detectPaymentApp, paymentAppName } from "../../src/lib/payment-app";
import { cancelSupersededOrdersForCustomer, confirmPayment, recordPaymentClaim } from "../../src/lib/payments";

describe("payment app: found in words and UPI IDs", () => {
  test("1. names, Tamil and UPI ID handles; nothing when nothing says", () => {
    const cases: [string, string | null][] = [
      ["paid via GPay", "gpay"],
      ["Google Pay done, ref 412345678901", "gpay"],
      ["sent on phonepe", "phonepe"],
      ["PhonePe", "phonepe"],
      ["paytm la anuppiten", "paytm"],
      ["BHIM app", "bhim"],
      ["paid with whatsapp pay", "whatsapp"],
      ["ஜிபே ல அனுப்பினேன்", "gpay"],
      ["போன் பே", "phonepe"],
      ["meena.r@okaxis", "gpay"],
      ["98765@ybl", "phonepe"],
      ["shop@paytm", "paytm"],
      ["ravi@upi", "bhim"],
      ["paid 360 rs", null],
      ["credit card", null],
      ["", null],
    ];
    for (const [text, app] of cases) assert.equal(detectPaymentApp(text), app, text);
    assert.equal(paymentAppName("gpay"), "GPay");
    assert.equal(paymentAppName("nope"), null);
  });
});

describe("payment and cancel details on orders", () => {
  let clientId: string;
  let customerId: string;
  let seq = 0;
  const order = (data: Record<string, unknown> = {}) =>
    db.order.create({ data: { ref: `QZ-${++seq}`, clientId, customerId, status: "NEW", total: 360, items: [{ id: "x", name: "Oil", quantity: 1, price: 300 }], ...data } });
  const fresh = (id: string) => db.order.findUniqueOrThrow({ where: { id } });

  before(async () => {
    const c = await db.client.create({ data: { name: `QA Pay Details ${Date.now()}`, orderPrefix: "QZ", paySettings: { cartExpiryDays: 1, receipt: false } } });
    clientId = c.id;
    customerId = (await db.customer.create({ data: { clientId, name: "Details Buyer", phone: `9199877${String(Date.now()).slice(-5)}` } })).id;
  });

  after(async () => {
    await db.paymentEvent.deleteMany({ where: { clientId } }).catch(() => {});
    await db.order.deleteMany({ where: { clientId } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId } }).catch(() => {});
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
  });

  test("2. a payment recorded with its app keeps it, with the time and the UTR", async () => {
    const o = await order();
    assert.equal(await confirmPayment(o.id, "412345678901", { method: "upi", source: "staff", utr: "412345678901", app: "phonepe", quiet: true }), true);
    const after = await fresh(o.id);
    assert.equal(after.paymentApp, "phonepe");
    assert.equal(after.paymentSource, "staff");
    assert.equal(after.paymentUtr, "412345678901");
    assert.ok(after.paidAt);
  });

  test("3. the customer says 'paid by gpay': the app is noted while staff check; a later claim doesn't change it", async () => {
    const o = await order();
    await recordPaymentClaim(o.id, "Customer: paid by gpay, ref 498765432109", "498765432109");
    assert.equal((await fresh(o.id)).paymentApp, "gpay");
    await recordPaymentClaim(o.id, "Customer: sent again on phonepe");
    assert.equal((await fresh(o.id)).paymentApp, "gpay", "the first app named stays");
    await confirmPayment(o.id, null, { method: "upi", source: "verified", quiet: true });
    assert.equal((await fresh(o.id)).paymentApp, "gpay", "still there once paid");
  });

  test("4. not completed in time: cancelled automatically, saying so and when", async () => {
    const o = await order({ waMessageId: `wamid.qz.${Date.now()}`, createdAt: new Date(Date.now() - 3 * 86_400_000) });
    await expireUnfinishedOrders(new Date());
    const after = await fresh(o.id);
    assert.equal(after.status, "CANCELLED");
    assert.ok(after.cancelledAt);
    assert.match(after.cancelledBy ?? "", /Automatically: not completed within 1 day/);
  });

  test("5. a newer cart replaces an unpaid one: the old one says it was replaced by which", async () => {
    const old = await order();
    const newer = await order();
    await cancelSupersededOrdersForCustomer(customerId, newer);
    const after = await fresh(old.id);
    assert.equal(after.status, "CANCELLED");
    assert.ok(after.cancelledAt);
    assert.match(after.cancelledBy ?? "", new RegExp(`Replaced by the customer's newer cart ${newer.ref}`));
  });
});
