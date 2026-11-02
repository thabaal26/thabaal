// Orders on another number (Payments › Payment settings › How orders work): a shop whose connected number only sends
// its messages. Whoever writes gets one reply with the main number and a "Chat to Order" button (a cart's items typed
// in), never a payment link or an order reminder from this number. Meta is never called: fetch is a fake.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { chatLink, elsewhereReply, ELSEWHERE_LABEL, orderText } from "../../src/lib/orders-elsewhere-core";
import { ordersElsewhere, replyOrdersElsewhere } from "../../src/lib/orders-elsewhere";
import { readPaySettings } from "../../src/lib/pay-settings";
import { sendPaymentRequestFor } from "../../src/lib/payments";

describe("orders on another number: wording and links", () => {
  test("1. the chat link types the order in; a cart lists its items", () => {
    assert.equal(orderText("Thenan Oils"), "Hi Thenan Oils, I'd like to order.");
    assert.equal(orderText("Thenan Oils", [{ name: "Gingelly Oil 1L", quantity: 2 }, { name: " Ghee 500ml ", quantity: 1 }]), "Hi Thenan Oils, I'd like to order:\n• 2 × Gingelly Oil 1L\n• 1 × Ghee 500ml");
    assert.equal(chatLink("918925390439", "Hi & order?"), "https://wa.me/918925390439?text=Hi%20%26%20order%3F");
  });

  test("2. the reply names the shop and the main number; the website only when there is one", () => {
    const r = elsewhereReply({ shop: "Thenan Oils", name: "Meena R", phone: "918925390439", website: "www.thenanoils.com" });
    assert.match(r, /^Hello Meena, thank you for messaging \*Thenan Oils\*! 🙏/);
    assert.match(r, /main number, \*\+91 89253 90439\*/);
    assert.match(r, /See all our products: www\.thenanoils\.com$/);
    const cart = elsewhereReply({ shop: "Thenan Oils", name: "+919876543210", phone: "918925390439", cart: true });
    assert.match(cart, /^Hello, thank you for your order at \*Thenan Oils\*!/);
    assert.match(cart, /your items are already typed in/);
    assert.doesNotMatch(cart, /See all our products/);
  });

  test("3. the main number is kept only when it is a real number", () => {
    assert.equal(readPaySettings({ orderPhone: "918925390439" }, null).orderPhone, "918925390439");
    for (const bad of ["", "12345", "91-8925-390439", null, 918925390439]) assert.equal(readPaySettings({ orderPhone: bad }, null).orderPhone, "", String(bad));
    assert.equal(readPaySettings({}, null).orderPhone, "");
  });
});

describe("orders on another number: what the customer gets", () => {
  let clientId: string;
  let customerId: string;
  const PNID = `qa-else-${Date.now()}`;
  const phone = `9199922${String(Date.now()).slice(-5)}`;
  const MAIN = "918925390439";
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  const cust = () => db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { id: true, clientId: true, phone: true, name: true, optedOut: true } });

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.else${++n}` }], data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const client = await db.client.create({
      data: { name: `QA Elsewhere Shop ${Date.now()}`, orderPrefix: "QE", website: "www.qa-shop.example", paymentConfig: "qa-upi", paySettings: { whatsappPay: true, codOn: true, orderPhone: MAIN } },
    });
    clientId = client.id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: PNID, businessAccountId: "qa-else-waba", token: "qa-fake-token", isDefault: true } });
    customerId = (await db.customer.create({ data: { clientId, phone, name: "Meena R" } })).id;
    await db.reply.create({ data: { customerId, text: "Hi", kind: "text" } });
  });

  beforeEach(() => {
    sent.length = 0;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.message.deleteMany({ where: { customerId } });
    await db.reply.deleteMany({ where: { customerId } });
    await db.order.deleteMany({ where: { clientId } });
    await db.customer.deleteMany({ where: { clientId } });
    await db.whatsAppNumber.deleteMany({ where: { clientId } });
    await db.client.delete({ where: { id: clientId } });
  });

  test("4. a message gets the main number and a Chat to Order button, logged in Chats; again within 6 hours, nothing", async () => {
    assert.equal(await ordersElsewhere(clientId), MAIN);
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, MAIN), true);
    assert.equal(sent.length, 1);
    const i = sent[0].body.interactive as { type: string; body: { text: string }; action: { parameters: { display_text: string; url: string } } };
    assert.equal(i.type, "cta_url");
    assert.equal(i.action.parameters.display_text, "Chat to Order");
    assert.ok(i.action.parameters.url.startsWith(`https://wa.me/${MAIN}?text=`));
    assert.match(i.body.text, /\+91 89253 90439/);
    assert.match(i.body.text, /www\.qa-shop\.example/);
    assert.equal(await db.message.count({ where: { customerId, templateName: ELSEWHERE_LABEL } }), 1);
    sent.length = 0;
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, MAIN), false);
    assert.equal(sent.length, 0);
  });

  test("4b. a tapped Chat to Order button always gets the reply, even right after another", async () => {
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "button" }, MAIN), true);
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "interactive", interactive: { type: "button_reply" } }, MAIN), true);
    assert.equal(sent.filter((s) => (s.body.interactive as { type?: string } | undefined)?.type === "cta_url").length, 2);
  });

  test("5. a cart always gets a reply, its items typed into the chat; no order is saved", async () => {
    const cart = { type: "order", order: { catalog_id: "qa-cat", product_items: [{ product_retailer_id: "GINGELLY-1L", quantity: 2 }, { product_retailer_id: "GHEE-500", quantity: "1" }] } };
    assert.equal(await replyOrdersElsewhere(await cust(), cart, MAIN), true);
    const msg = sent.find((s) => (s.body.interactive as { type?: string } | undefined)?.type === "cta_url");
    const url = (msg!.body.interactive as { action: { parameters: { url: string } } }).action.parameters.url;
    assert.equal(decodeURIComponent(url.split("?text=")[1]), `Hi ${(await db.client.findUniqueOrThrow({ where: { id: clientId } })).name}, I'd like to order:\n• 2 × GINGELLY-1L\n• 1 × GHEE-500`);
    assert.equal(await db.order.count({ where: { clientId } }), 0);
  });

  test("6. no payment link from this number, even for an order staff made", async () => {
    const o = await db.order.create({ data: { ref: `QE-${Date.now()}`, clientId, customerId, status: "NEW", total: 360, items: [{ id: "x", name: "QA Oil", quantity: 1, price: 300 }] } });
    const r = await sendPaymentRequestFor(o.id);
    assert.equal(r.ok, false);
    assert.match(r.message, /main number \(\+91 89253 90439\)/);
    assert.equal(sent.length, 0);
  });

  test("7. a window closed for 24 hours or an opted-out customer gets nothing", async () => {
    await db.reply.updateMany({ where: { customerId }, data: { receivedAt: new Date(Date.now() - 30 * 3600_000) } });
    await db.message.deleteMany({ where: { customerId } });
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, MAIN), false);
    assert.equal(await replyOrdersElsewhere({ ...(await cust()), optedOut: true }, { type: "order" }, MAIN), false);
    assert.equal(sent.length, 0);
  });
});
