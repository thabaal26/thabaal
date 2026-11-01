// Settings › Delivery charge (lib/pay-settings.ts deliveryFee, lib/orders.ts recordOrder): a shop that never set it
// keeps ₹60; free delivery adds nothing; a shop's own amount goes on every new WhatsApp cart; orders already saved
// keep the charge they were saved with.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { getOrderPricing } from "../../src/lib/order-pricing";
import { recordOrder } from "../../src/lib/orders";
import { readPaySettings } from "../../src/lib/pay-settings";
import { deliveryFeeFor } from "../../src/lib/pay-settings-server";

let seq = 0;
async function shopWith(paySettings?: Record<string, unknown>) {
  const c = await db.client.create({ data: { name: `Delivery ${Date.now()} ${++seq}`, ...(paySettings ? { paySettings } : {}) } });
  const cust = await db.customer.create({ data: { clientId: c.id, phone: `9198${String(Date.now()).slice(-6)}${seq}`.slice(0, 12), name: "Cart" } });
  return { c, cust };
}
// A cart of 2 × ₹100 sent from the catalogue.
const cart = { order: { product_items: [{ product_retailer_id: "oil", quantity: 2, item_price: 100, currency: "INR" }] } };

describe("delivery charge setting", () => {
  test("1. read: unset keeps ₹60, 0 is free, an amount is kept, bad values fall back to ₹60", () => {
    assert.equal(readPaySettings(null, null).deliveryFee, 60);
    assert.equal(readPaySettings({ deliveryFee: 0 }, null).deliveryFee, 0);
    assert.equal(readPaySettings({ deliveryFee: 45 }, null).deliveryFee, 45);
    assert.equal(readPaySettings({ deliveryFee: -5 }, null).deliveryFee, 60);
    assert.equal(readPaySettings({ deliveryFee: "40" }, null).deliveryFee, 60);
    assert.equal(readPaySettings({ deliveryFee: 99_999 }, null).deliveryFee, 60);
  });

  test("2. a WhatsApp cart gets the shop's charge: unset ₹60, free ₹0, own ₹45", async () => {
    for (const [settings, fee] of [[undefined, 60], [{ deliveryFee: 0 }, 0], [{ deliveryFee: 45 }, 45]] as const) {
      const { c, cust } = await shopWith(settings);
      assert.equal(await deliveryFeeFor(c.id), fee);
      const o = await recordOrder(cust, `wamid.fee.${Date.now()}.${++seq}`, cart);
      assert.ok(o, "order saved");
      assert.equal(o.total, 200 + fee, `total with a ₹${fee} charge`);
      assert.equal(getOrderPricing(o.items as never, o.total).shipping, fee, "the order shows that charge");
    }
  });

  test("3. changing the setting leaves orders already saved as they were", async () => {
    const { c, cust } = await shopWith({ deliveryFee: 30 });
    const o = await recordOrder(cust, `wamid.fee.${Date.now()}.${++seq}`, cart);
    await db.client.update({ where: { id: c.id }, data: { paySettings: { deliveryFee: 0 } } });
    const again = await db.order.findUniqueOrThrow({ where: { id: o!.id } });
    assert.equal(again.total, 230);
    assert.equal(getOrderPricing(again.items as never, again.total).shipping, 30);
  });
});
