// Cart checkout: with cash on delivery on, a new cart gets the "Pay now online / Cash on delivery" choice and
// no payment request yet; with it off, the "Review and pay" request goes out straight away. Meta is never called:
// fetch is replaced with a fake that answers like Meta and keeps what was sent.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { startCheckout } from "../../src/lib/payments";

describe("cart checkout: payment choice or pay now", () => {
  let clientId: string;
  let customerId: string;
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const realFetch = globalThis.fetch;

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.qa${sent.length}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const client = await db.client.create({
      data: { name: "QA Checkout Shop", orderPrefix: "QC", paymentConfig: "qa-upi", paySettings: { whatsappPay: true, upiOn: false, codOn: true } },
    });
    clientId = client.id;
    const customer = await db.customer.create({ data: { clientId, name: "Checkout Customer", phone: "919990006666" } });
    customerId = customer.id;
    // Its own number and a fake token, so sends go to the fake fetch above.
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: "qa-checkout-phone", businessAccountId: "qa-checkout-waba", token: "qa-fake-token", isDefault: true } });
    // The customer just wrote (sent the cart), so their 24-hour window is open.
    await db.reply.create({ data: { customerId, text: "Cart", kind: "order" } });
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.message.deleteMany({ where: { customer: { clientId } } }).catch(() => {});
    await db.order.deleteMany({ where: { clientId } }).catch(() => {});
    await db.reply.deleteMany({ where: { customerId } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId } }).catch(() => {});
    await db.whatsAppNumber.deleteMany({ where: { clientId } }).catch(() => {});
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
  });

  const cart = (ref: string) =>
    db.order.create({ data: { ref, clientId, customerId, status: "NEW", total: 560, items: [{ id: "oil", name: "Coconut oil 1L", quantity: 1, price: 500 }] } });
  const lastMessage = () => db.message.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } });

  test("COD on: the customer is asked to choose, and no payment request goes out yet", async () => {
    const o = await cart("QC-1");
    await startCheckout(o);
    const m = await lastMessage();
    assert.equal(m?.templateName, "Payment choice");
    assert.match(m?.body ?? "", /How would you like to pay\?/);
    assert.match(m?.body ?? "", /QC-1/);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentRequestedAt, null);
    // What WhatsApp was asked to show: two reply buttons for this order.
    const buttons = JSON.stringify(sent[sent.length - 1].body);
    assert.match(buttons, new RegExp(`pay_online:${o.id}`));
    assert.match(buttons, new RegExp(`pay_cod:${o.id}`));
    assert.match(buttons, /Pay now online/);
    assert.match(buttons, /Cash on delivery/);
  });

  test("COD off: the pay-now request goes out straight away", async () => {
    await db.client.update({ where: { id: clientId }, data: { paySettings: { whatsappPay: true, upiOn: false, codOn: false } } });
    const o = await cart("QC-2");
    await startCheckout(o);
    const m = await lastMessage();
    assert.equal(m?.templateName, "Payment request");
    assert.notEqual((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentRequestedAt, null);
  });

  test("COD on but the order is over the COD limit: pay-now only", async () => {
    await db.client.update({ where: { id: clientId }, data: { paySettings: { whatsappPay: true, upiOn: false, codOn: true, codMax: 300 } } });
    const o = await cart("QC-3");
    await startCheckout(o);
    assert.equal((await lastMessage())?.templateName, "Payment request");
  });
});
