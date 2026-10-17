import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { maxPointsDiscount, setOrderPoints } from "../../src/lib/loyalty-redeem";
import { confirmPayment } from "../../src/lib/payments";
import { chargeMessage, walletBalance } from "../../src/lib/wallet";

// Payment scenarios 6, 8 and 18 of the QA run: loyalty points at checkout and the wallet's per-message charge.
describe("Points at checkout and wallet charges (QA scenarios 6, 8, 18)", () => {
  let clientId: string;
  let customerId: string;

  before(async () => {
    const client = await db.client.create({ data: { name: "QA Points Shop", orderPrefix: "QP", billingMode: "wallet" } });
    clientId = client.id;
    const customer = await db.customer.create({ data: { clientId, name: "Points Customer", phone: "919990005555" } });
    customerId = customer.id;
    // Two delivered, paid orders of ₹5,000: enough points for a discount.
    for (const n of [1, 2])
      await db.order.create({
        data: { ref: `QP-90${n}`, clientId, customerId, status: "DELIVERED", total: 5000, paidAt: new Date(), paidAmount: 5000, items: [{ name: "Oil tin", quantity: 1, price: 4940 }] },
      });
  });

  after(async () => {
    await db.walletEntry.deleteMany({ where: { clientId } }).catch(() => {});
    await db.message.deleteMany({ where: { customer: { clientId } } }).catch(() => {});
    await db.order.deleteMany({ where: { clientId } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId } }).catch(() => {});
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
  });

  const newOrder = (ref: string) =>
    db.order.create({ data: { ref, clientId, customerId, status: "NEW", total: 1060, items: [{ name: "Ghee 1L", quantity: 1, price: 1000 }] } });

  test("using more points than the customer has is refused and changes nothing", async () => {
    const o = await newOrder("QP-1001");
    const full = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { customer: { select: { name: true, tags: true, purchases: true, orders: true } } } });
    const { max } = maxPointsDiscount(full);
    const r = await setOrderPoints(o.id, max + 25);
    assert.equal(r.ok, false);
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.equal(after.total, 1060);
    assert.equal(after.pointsRedeemed, 0);
  });

  test("points by hand lower the total in ₹25 steps, and paying that total marks it paid", async () => {
    const o = await newOrder("QP-1002");
    const r = await setOrderPoints(o.id, 60); // rounds down to ₹50
    assert.equal(r.ok, true, r.message);
    assert.equal(r.applied, 50);
    const mid = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.equal(mid.pointsRedeemed, 100);
    assert.equal(mid.total, 1010);
    assert.equal(await confirmPayment(o.id, "QP-TXN-1", { source: "meta", amount: 1010, quiet: true }), true);
    const paid = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.ok(paid.paidAt);
    assert.equal(paid.paidAmount, 1010);
  });

  test("points can't be changed once money was received", async () => {
    const o = await newOrder("QP-1003");
    await confirmPayment(o.id, null, { source: "staff", method: "cash", amount: 200, quiet: true });
    const r = await setOrderPoints(o.id, 25);
    assert.equal(r.ok, false);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).total, 1060);
  });

  test("a wallet client is charged once per delivered message, even when Meta reports it twice", async () => {
    const start = await walletBalance(clientId);
    const msg = await db.message.create({ data: { customerId, templateName: "qa_offer", body: "Offer", status: "SENT", provider: "META", waMessageId: "wamid.QP1" } });
    await chargeMessage(msg.id, "marketing");
    await chargeMessage(msg.id, "marketing"); // "read" after "delivered"
    const entries = await db.walletEntry.count({ where: { clientId, messageId: msg.id } });
    assert.equal(entries, 1);
    assert.ok((await walletBalance(clientId)) < start);
  });

  test("simulated (demo) messages are never charged", async () => {
    const msg = await db.message.create({ data: { customerId, templateName: "qa_offer", body: "Offer", status: "SENT", provider: "META", simulated: true, waMessageId: "wamid.QP2" } });
    await chargeMessage(msg.id, "marketing");
    assert.equal(await db.walletEntry.count({ where: { messageId: msg.id } }), 0);
  });
});
