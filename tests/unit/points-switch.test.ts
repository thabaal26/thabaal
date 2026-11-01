// Payments › Settings › Loyalty points at checkout (Client.loyaltyRedeemOn, loyaltyAutoRedeem): with using points on,
// "Automatic" takes them off a new order and "By hand" uses them on request; with it off, points still add up but
// none can be used (by hand or automatically) and nothing offers them, while points already on an order can come off.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { loyaltyFromOrders, loyaltyRules } from "../../src/lib/loyalty";
import { autoRedeemPoints, maxPointsDiscount, setOrderPoints } from "../../src/lib/loyalty-redeem";

describe("customers can use their points: the switch", () => {
  let clientId: string;
  let customerId: string;
  let seq = 0;
  // Each scenario starts with the customer's full balance: the open orders of the one before are taken away.
  const shop = async (data: { loyaltyRedeemOn?: boolean; loyaltyAutoRedeem?: boolean }) => {
    await db.order.deleteMany({ where: { clientId, status: "NEW" } });
    return db.client.update({ where: { id: clientId }, data });
  };
  const newOrder = () =>
    db.order.create({ data: { ref: `QW-${++seq}`, clientId, customerId, status: "NEW", total: 1060, items: [{ name: "Ghee 1L", quantity: 1, price: 1000 }] } });
  const customer = () =>
    db.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { name: true, tags: true, purchases: true, client: { select: { loyaltyEarnOn: true, loyaltyRupeesPerPoint: true, loyaltyRepeatOn: true, loyaltyRepeatBonus: true, loyaltyRedeemOn: true } }, orders: { select: { id: true, total: true, status: true, paidAt: true, paymentMethod: true, internalNote: true, pointsRedeemed: true } } },
    });

  before(async () => {
    const client = await db.client.create({ data: { name: `QA Points Switch ${Date.now()}`, orderPrefix: "QW" } });
    clientId = client.id;
    const c = await db.customer.create({ data: { clientId, name: "Switch Customer", phone: `91999000${String(Date.now()).slice(-4)}` } });
    customerId = c.id;
    // Two delivered, paid orders of ₹5,000: 100 + 50 + 50 = 200 points by the default rules.
    for (const n of [1, 2])
      await db.order.create({ data: { ref: `QW-9${n}`, clientId, customerId, status: "DELIVERED", total: 5000, paidAt: new Date(), paidAmount: 5000, items: [{ name: "Oil tin", quantity: 1, price: 4940 }] } });
  });

  after(async () => {
    await db.order.deleteMany({ where: { clientId } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId } }).catch(() => {});
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
  });

  test("1. on (as before): points are worth money; By hand uses them on request", async () => {
    await shop({ loyaltyRedeemOn: true, loyaltyAutoRedeem: false });
    const c = await customer();
    const l = loyaltyFromOrders(c, { rules: loyaltyRules(c.client) });
    assert.ok(l.totalPoints >= 100);
    assert.ok(l.redeemableRupees >= 25);
    const o = await newOrder();
    assert.equal(await autoRedeemPoints(o.id), 0, "By hand: nothing comes off by itself");
    const r = await setOrderPoints(o.id, 25);
    assert.equal(r.ok, true, r.message);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).total, 1035);
  });

  test("2. on + Automatic: a new order gets the points before payment is asked", async () => {
    await shop({ loyaltyRedeemOn: true, loyaltyAutoRedeem: true });
    const o = await newOrder();
    const off = await autoRedeemPoints(o.id);
    assert.ok(off >= 25, `took off ₹${off}`);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).pointsRedeemed, off * 2);
  });

  test("3. off: points still add up, but are worth nothing off an order (so nothing offers them)", async () => {
    await shop({ loyaltyRedeemOn: false, loyaltyAutoRedeem: true });
    const c = await customer();
    const l = loyaltyFromOrders(c, { rules: loyaltyRules(c.client) });
    assert.ok(l.totalPoints > 0, "still earned");
    assert.equal(l.redeemableRupees, 0);
    const o = await newOrder();
    const full = await db.order.findUniqueOrThrow({ where: { id: o.id }, select: { id: true, items: true, total: true, pointsRedeemed: true, customer: { select: { name: true, tags: true, purchases: true, orders: { select: { id: true, total: true, status: true, paidAt: true, paymentMethod: true, internalNote: true, pointsRedeemed: true } } } } } });
    assert.equal(maxPointsDiscount(full, loyaltyRules(c.client)).max, 0, "no Use button");
  });

  test("4. off: neither Automatic nor By hand can use points", async () => {
    await shop({ loyaltyRedeemOn: false, loyaltyAutoRedeem: true });
    const o = await newOrder();
    assert.equal(await autoRedeemPoints(o.id), 0);
    const r = await setOrderPoints(o.id, 25);
    assert.equal(r.ok, false);
    assert.match(r.message, /Using loyalty points is off/);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).total, 1060);
  });

  test("5. turned off after points went on an order: they can still be taken off", async () => {
    await shop({ loyaltyRedeemOn: true, loyaltyAutoRedeem: false });
    const o = await newOrder();
    assert.equal((await setOrderPoints(o.id, 25)).ok, true);
    await db.client.update({ where: { id: clientId }, data: { loyaltyRedeemOn: false } });
    const r = await setOrderPoints(o.id, 0);
    assert.equal(r.ok, true, r.message);
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.equal(after.pointsRedeemed, 0);
    assert.equal(after.total, 1060);
  });
});
