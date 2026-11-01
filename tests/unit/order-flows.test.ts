// Settings › Order steps reach WhatsApp (lib/order-flow.ts customerWords, flowShips): a counter / pickup or service
// shop never asks for a delivery address, adds no delivery charge, and its customers read "pay at the shop",
// "ready for pickup" and "collected"; an "I deliver myself" or courier shop keeps the address step, the charge and
// "cash on delivery". Meta is never called: fetch is a fake that keeps what each message asked WhatsApp to show.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { confirmCod } from "../../src/lib/cod";
import { db } from "../../src/lib/db";
import { startAddressStep } from "../../src/lib/delivery-address";
import { replyWithStatus } from "../../src/lib/order-assistant";
import { customerWords, flowShips, type OrderFlowKey } from "../../src/lib/order-flow";
import { recordOrder } from "../../src/lib/orders";
import { readPaySettings, shopDeliveryFee } from "../../src/lib/pay-settings";
import { sendPaymentChoicePrompt } from "../../src/lib/payments";

describe("order steps: the words and rules", () => {
  test("1. only deliver and courier shops ship: they alone get the delivery charge", () => {
    const s = readPaySettings({ deliveryFee: 45 }, null);
    const fee = (f: OrderFlowKey) => shopDeliveryFee(s, f);
    assert.deepEqual([fee("deliver"), fee("courier"), fee("pickup"), fee("service")], [45, 45, 0, 0]);
    assert.deepEqual((["deliver", "courier", "pickup", "service"] as OrderFlowKey[]).map(flowShips), [true, true, false, false]);
    assert.equal(customerWords("pickup").finished, "collected");
    assert.equal(customerWords("service").finished, "completed");
    assert.equal(customerWords("deliver").finished, "delivered");
    for (const f of ["deliver", "courier", "pickup", "service"] as OrderFlowKey[]) assert.ok(customerWords(f).cashButton.length <= 20, "a WhatsApp button title is 20 characters at most");
  });
});

type Sent = { url: string; body: { type?: string; interactive?: Record<string, unknown>; text?: { body?: string } } };

describe("order steps on WhatsApp", () => {
  let clientId: string;
  let customerId: string;
  const sent: Sent[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  const pay = { whatsappPay: true, upiOn: false, codOn: true, askAddress: true, deliveryFee: 40 };
  // Only what went to WhatsApp: the Google Sheet log is sent in the background and may land in between.
  const wa = () => sent.filter((s) => /graph\.facebook\.com/.test(s.url));
  const lastText = () => JSON.stringify(wa()[wa().length - 1]?.body ?? {});
  const allText = () => JSON.stringify(wa().map((s) => s.body));
  const fresh = (id: string) => db.order.findUniqueOrThrow({ where: { id } });
  const cart = { order: { product_items: [{ product_retailer_id: "oil", quantity: 2, item_price: 100, currency: "INR" }] } };
  const flow = (orderFlow: OrderFlowKey) => db.client.update({ where: { id: clientId }, data: { orderFlow } });
  const cust = async () => {
    const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    return { id: c.id, clientId: c.clientId, phone: c.phone, name: c.name, optedOut: c.optedOut, tags: c.tags };
  };

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.flow${++n}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const client = await db.client.create({ data: { name: `QA Flow Shop ${Date.now()}`, orderPrefix: "QF", paymentConfig: "qa-upi", paySettings: pay, quietFrom: null, quietTo: null } });
    clientId = client.id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: "qa-flow-phone", businessAccountId: "qa-flow-waba", token: "qa-fake-token", isDefault: true } });
  });

  beforeEach(async () => {
    sent.length = 0;
    await db.message.deleteMany({ where: { customer: { clientId } } });
    await db.order.deleteMany({ where: { clientId } });
    await db.reply.deleteMany({ where: { customer: { clientId } } });
    await db.customer.deleteMany({ where: { clientId } });
    const c = await db.customer.create({ data: { clientId, name: "Meena R", phone: "919990006666", locationRaw: "12, 3rd Street, Anna Nagar, Madurai - 625020", location: "Anna Nagar" } });
    customerId = c.id;
    await db.reply.create({ data: { customerId, text: "Cart", kind: "order" } }); // the cart opened the 24-hour window
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.message.deleteMany({ where: { customer: { clientId } } }).catch(() => {});
    await db.order.deleteMany({ where: { clientId } }).catch(() => {});
    await db.reply.deleteMany({ where: { customer: { clientId } } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId } }).catch(() => {});
    await db.whatsAppNumber.deleteMany({ where: { clientId } }).catch(() => {});
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
  });

  for (const f of ["pickup", "service"] as OrderFlowKey[]) {
    test(`2. ${f}: a WhatsApp cart has no delivery charge and no address is asked`, async () => {
      await flow(f);
      const o = await recordOrder({ id: customerId, clientId }, `wamid.cart.${f}.${Date.now()}`, cart);
      assert.equal(o!.total, 200, "items only");
      assert.equal(await startAddressStep(o!.id), "skip");
      assert.equal(wa().length, 0, "nothing sent about an address");
    });
  }

  test("3. deliver: the cart gets the ₹40 charge and the address is asked (unchanged)", async () => {
    await flow("deliver");
    const o = await recordOrder({ id: customerId, clientId }, `wamid.cart.deliver.${Date.now()}`, cart);
    assert.equal(o!.total, 240);
    assert.equal(await startAddressStep(o!.id), "asked");
    assert.match(lastText(), /deliver it to this address/);
  });

  test("4. pickup: the payment choice offers 'Pay at the shop' and shows no 'Deliver to'", async () => {
    await flow("pickup");
    const o = await db.order.create({ data: { ref: "QF-4", clientId, customerId, status: "NEW", total: 200, items: [{ id: "oil", name: "Coconut oil", quantity: 2, price: 100 }], note: "12, 3rd Street", addressConfirmedAt: new Date() } });
    assert.equal((await sendPaymentChoicePrompt(o.id)).ok, true);
    assert.match(lastText(), /Pay at the shop/);
    assert.doesNotMatch(lastText(), /Cash on delivery|Deliver to/);
  });

  test("5. deliver: the payment choice still says 'Cash on delivery'", async () => {
    await flow("deliver");
    const o = await db.order.create({ data: { ref: "QF-5", clientId, customerId, status: "NEW", total: 240, items: [{ id: "oil", name: "Coconut oil", quantity: 2, price: 100 }] } });
    await sendPaymentChoicePrompt(o.id);
    assert.match(lastText(), /Cash on delivery/);
  });

  test("6. pickup: cash chosen → confirmed with 'pay when you collect it', no address asked", async () => {
    await flow("pickup");
    const o = await db.order.create({ data: { ref: "QF-6", clientId, customerId, status: "NEW", total: 200, items: [] } });
    assert.equal(await confirmCod(o.id), true);
    assert.equal((await fresh(o.id)).status, "CONFIRMED");
    const t = allText();
    assert.match(t, /when you collect it/);
    assert.match(t, /ready for pickup/);
    assert.doesNotMatch(t, /delivery address|on delivery|on the way/);
  });

  test("7. service: cash chosen → 'Booking confirmed', pay at the visit", async () => {
    await flow("service");
    const o = await db.order.create({ data: { ref: "QF-7", clientId, customerId, status: "NEW", total: 500, items: [] } });
    await confirmCod(o.id);
    const t = allText();
    assert.match(t, /Booking confirmed/);
    assert.match(t, /at the visit/);
    assert.doesNotMatch(t, /delivery/i);
  });

  test("8. where is my order: pickup says ready for pickup and collected, never 'on its way' or 'delivered'", async () => {
    await flow("pickup");
    await db.order.create({ data: { ref: "QF-8", clientId, customerId, status: "CONFIRMED", paymentMethod: "cod", total: 200, items: [] } });
    await replyWithStatus(await cust(), { text: "where is my order" });
    assert.match(lastText(), /ready for pickup/);
    assert.match(lastText(), /when you collect it/);
    assert.doesNotMatch(lastText(), /on the way|on its way/);
    await db.order.updateMany({ where: { clientId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    sent.length = 0;
    await replyWithStatus(await cust(), { text: "QF-8" });
    assert.match(lastText(), /was collected on/);
  });

  test("9. where is my order: deliver keeps 'on the way' (unchanged)", async () => {
    await flow("deliver");
    await db.order.create({ data: { ref: "QF-9", clientId, customerId, status: "CONFIRMED", paymentMethod: "cod", total: 240, items: [] } });
    await replyWithStatus(await cust(), { text: "where is my order" });
    assert.match(lastText(), /as soon as it's on the way/);
  });
});
