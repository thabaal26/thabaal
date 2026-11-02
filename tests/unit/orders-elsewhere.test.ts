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
  const CHAT = { phone: MAIN, by: "chat" as const };
  const CALL = { phone: MAIN, by: "call" as const };
  const PRODUCTS = [
    { retailer_id: "OIL-1", name: "Gingelly oil", price: "₹ 460.00", availability: "in stock" },
    { retailer_id: "OIL-2", name: "Groundnut oil 1l", price: "₹ 360.00", availability: "in stock" },
    { retailer_id: "GHEE", name: "Ghee 100ml", price: "₹ 150.00", availability: "in stock" },
    { retailer_id: "PANEER", name: "Paneer 200g", price: "₹ 120.00", availability: "in stock" },
    { retailer_id: "RAGI", name: "Ragi Flour", price: "₹ 90.00", availability: "in stock" },
    { retailer_id: "GONE", name: "Almond oil", price: "₹ 320.00", availability: "out of stock" },
  ];
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  const cust = () => db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { id: true, clientId: true, phone: true, name: true, optedOut: true } });

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });
      // The shop's catalogue (read only): not a send.
      if (u.includes("/product_catalogs")) return json({ data: [{ id: "qa-cat-1" }] });
      if (u.includes("qa-cat-1/products")) return json({ data: PRODUCTS });
      sent.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return json({ messages: [{ id: `wamid.else${++n}` }], data: [] });
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

  test("4. a message gets the main number and a Chat to Order button, logged in Chats; a second one sent with it, nothing", async () => {
    assert.deepEqual(await ordersElsewhere(clientId), CHAT);
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CHAT), true);
    assert.equal(sent.length, 1);
    const i = sent[0].body.interactive as { type: string; body: { text: string }; action: { parameters: { display_text: string; url: string } } };
    assert.equal(i.type, "cta_url");
    assert.equal(i.action.parameters.display_text, "Chat to Order");
    assert.ok(i.action.parameters.url.startsWith(`https://wa.me/${MAIN}?text=`));
    assert.match(i.body.text, /\+91 89253 90439/);
    assert.match(i.body.text, /www\.qa-shop\.example/);
    assert.equal(await db.message.count({ where: { customerId, templateName: ELSEWHERE_LABEL } }), 1);
    sent.length = 0;
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CHAT), false);
    assert.equal(sent.length, 0);
  });

  test("4b. a tapped Chat to Order button always gets the reply, even right after another", async () => {
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "button" }, CHAT), true);
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "interactive", interactive: { type: "button_reply" } }, CHAT), true);
    assert.equal(sent.filter((s) => (s.body.interactive as { type?: string } | undefined)?.type === "cta_url").length, 2);
  });

  test("5. a cart always gets a reply, its items typed into the chat; no order is saved", async () => {
    const cart = { type: "order", order: { catalog_id: "qa-cat", product_items: [{ product_retailer_id: "GINGELLY-1L", quantity: 2 }, { product_retailer_id: "GHEE-500", quantity: "1" }] } };
    assert.equal(await replyOrdersElsewhere(await cust(), cart, CHAT), true);
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

  // Our replies so far happened a while ago (a minute), as when the customer writes again later.
  const earlier = () => db.message.updateMany({ where: { customerId }, data: { createdAt: new Date(Date.now() - 2 * 60_000) } });
  const lastText = () => String((sent[sent.length - 1].body.text as { body: string }).body);

  test("6b. by call: View Products and price questions get the price list, ending with call or WhatsApp", async () => {
    await db.message.deleteMany({ where: { customerId } });
    // The campaign's "View Products" reply button.
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "button" }, CALL, "View Products"), true);
    const list = lastText();
    assert.equal(sent[0].body.type, "text", "plain text, no buttons");
    assert.match(list, /^🛒 \*QA Elsewhere Shop \d+ – Price List\*/);
    assert.match(list, /🫒 \*Oils\*\n• Gingelly oil – ₹460\n• Groundnut oil 1l – ₹360/);
    assert.match(list, /🧈 \*Ghee & Dairy\*\n• Ghee 100ml – ₹150\n• Paneer 200g – ₹120/);
    assert.match(list, /• Ragi Flour – ₹90/);
    assert.doesNotMatch(list, /Almond oil|View catalog/, "out of stock left out; no catalogue to order in");
    assert.match(list, /📞 To order, call or WhatsApp \*\+91 89253 90439\*$/);
    // Asked again in words, right away: the list again.
    for (const ask of ["price list please", "How much is ghee?", "ghee evlo"]) assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CALL, ask), true, ask);
    assert.equal(sent.length, 4);
    assert.ok(sent.every((s) => (s.body.interactive as { type?: string } | undefined)?.type !== "cta_url"));
  });

  test("6c. by call: Hi, a question or a photo always gets 'call or WhatsApp'; a burst gets one reply; ok after it, none", async () => {
    await earlier();
    // "Hi" a minute after the price list: answered (it was swallowed by a 6-hour gap before).
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CALL, "Hi"), true);
    assert.match(lastText(), /^Hello Meena, thank you for messaging \*QA Elsewhere Shop \d+\*! 🙏\n\nTo order, call or WhatsApp us on \*\+91 89253 90439\*\.$/);
    // Sent together with it: one reply is enough.
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CALL, "anyone there?"), false);
    // "ok" / 👍 right after our reply: quiet.
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CALL, "ok"), false);
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CALL, "👍"), false);
    // Later, a question or a photo: answered again.
    await earlier();
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CALL, "Is delivery available in Anna Nagar?"), true);
    await earlier();
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "image" }, CALL, "[Photo]"), true);
    assert.match(lastText(), /To order, call or WhatsApp us on/);
  });

  test("6d. by call: a cart lists its items with call or WhatsApp, every time; never an order", async () => {
    const cartMsg = { type: "order", order: { catalog_id: "qa-cat", product_items: [{ product_retailer_id: "GHEE", quantity: 2 }] } };
    assert.equal(await replyOrdersElsewhere(await cust(), cartMsg, CALL), true);
    assert.match(lastText(), /• 2 × GHEE\n\nTo order these, call or WhatsApp us on \*\+91 89253 90439\*\.$/);
    assert.equal(await replyOrdersElsewhere(await cust(), cartMsg, CALL), true, "a second cart right away is answered too");
    assert.equal(await db.order.count({ where: { clientId } }), 1, "only the order staff made in test 6");
  });

  test("7. a window closed for 24 hours or an opted-out customer gets nothing", async () => {
    await db.reply.updateMany({ where: { customerId }, data: { receivedAt: new Date(Date.now() - 30 * 3600_000) } });
    await db.message.deleteMany({ where: { customerId } });
    assert.equal(await replyOrdersElsewhere(await cust(), { type: "text" }, CHAT), false);
    assert.equal(await replyOrdersElsewhere({ ...(await cust()), optedOut: true }, { type: "order" }, CHAT), false);
    assert.equal(sent.length, 0);
  });
});
