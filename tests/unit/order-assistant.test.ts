// The WhatsApp order assistant, scenario by scenario, as customers actually behave. Meta is never called: fetch
// is replaced with a fake that answers like Meta and keeps what each message asked WhatsApp to show.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { autoSendCatalogue } from "../../src/lib/catalog";
import { confirmCod } from "../../src/lib/cod";
import { expireUnfinishedOrders, nudgeUnfinishedOrders } from "../../src/lib/cart-followups";
import { busyForOffers, handleAssistantButton, handleAssistantText, handleCancelRequest, noteSource, replyWithStatus } from "../../src/lib/order-assistant";
import { afterNewOrder } from "../../src/lib/order-intake";
import { recordPaymentFailure } from "../../src/lib/payments";

type Sent = { body: { type?: string; interactive?: Record<string, unknown>; text?: { body?: string } } };
const HOUR = 3_600_000;

describe("WhatsApp order assistant", () => {
  let clientId: string;
  let customerId: string;
  const sent: Sent[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  const pay = (extra: Record<string, unknown> = {}) => ({ whatsappPay: true, upiOn: false, codOn: true, askAddress: true, ...extra });
  const last = () => sent[sent.length - 1]?.body;
  const lastText = () => JSON.stringify(last() ?? {});
  const cust = () => db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const fresh = (id: string) => db.order.findUniqueOrThrow({ where: { id } });
  const order = (ref: string, data: Record<string, unknown> = {}) =>
    db.order.create({
      data: { ref, clientId, customerId, waMessageId: `wamid.${ref}`, status: "NEW", total: 560, items: [{ id: "oil", name: "Coconut oil 1L", quantity: 1, price: 500 }], ...data },
    });
  const asCust = async () => {
    const c = await cust();
    return { id: c.id, clientId: c.clientId, phone: c.phone, name: c.name, optedOut: c.optedOut, tags: c.tags };
  };
  const shopClock = (offsetH: number) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() + offsetH * HOUR));

  before(async () => {
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push({ body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.oa${++n}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const client = await db.client.create({ data: { name: "QA Assistant Shop", orderPrefix: "QS", paymentConfig: "qa-upi", paySettings: pay(), quietFrom: null, quietTo: null } });
    clientId = client.id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: "qa-assistant-phone", businessAccountId: "qa-assistant-waba", token: "qa-fake-token", isDefault: true } });
  });

  beforeEach(async () => {
    sent.length = 0;
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay() } });
    await db.message.deleteMany({ where: { customer: { clientId } } });
    await db.order.deleteMany({ where: { clientId } });
    await db.reply.deleteMany({ where: { customer: { clientId } } });
    await db.customer.deleteMany({ where: { clientId } });
    const c = await db.customer.create({ data: { clientId, name: "Meena R", phone: "919990008888", locationRaw: "12, 3rd Street, Anna Nagar, Madurai - 625020", location: "Anna Nagar" } });
    customerId = c.id;
    await db.reply.create({ data: { customerId, text: "Hi", kind: "text" } }); // their message opened the 24-hour window
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

  /* ---------- "Where is my order?" ---------- */

  test("where is my order: waiting for payment says how much and what to tap", async () => {
    await order("QS-1", { paymentRequestedAt: new Date() });
    assert.equal(await handleAssistantText(await asCust(), { type: "text" }, "where is my order?", "text", { greeting: false }), true);
    assert.match(lastText(), /waiting for payment of \*₹560\*/);
    assert.match(lastText(), /Review and pay/);
  });

  test("where is my order: on its way, with the dispatch details staff entered", async () => {
    await order("QS-2", { status: "DISPATCHED", paymentMethod: "cod", internalNote: "Dispatched 31/10/2026: today 6 pm with Ravi (98400 00000)" });
    await replyWithStatus(await asCust());
    assert.match(lastText(), /on its way/);
    assert.match(lastText(), /Expected: today 6 pm with Ravi/);
    assert.match(lastText(), /keep \*₹560\* ready/);
  });

  test("where is my order with no order: asks for the other number, no catalogue", async () => {
    await replyWithStatus(await asCust());
    assert.match(lastText(), /couldn't find an open order/);
  });

  test("'hi' while an order is being prepared gets its status, not the catalogue; asked twice in 10 minutes, once", async () => {
    await order("QS-3", { status: "CONFIRMED", paymentMethod: "cod" });
    assert.equal(await handleAssistantText(await asCust(), { type: "text" }, "hi", "text", { greeting: true }), true);
    assert.match(lastText(), /Hello Meena, your order \*QS-3\* is confirmed and being prepared/);
    const count = sent.length;
    await handleAssistantText(await asCust(), { type: "text" }, "order status?", "text", { greeting: false });
    assert.equal(sent.length, count);
  });

  test("'hi' a week after delivery is a new conversation: the catalogue answers it", async () => {
    await order("QS-4", { status: "DELIVERED", deliveredAt: new Date(Date.now() - 5 * 24 * HOUR), paidAt: new Date() });
    assert.equal(await handleAssistantText(await asCust(), { type: "text" }, "hello", "text", { greeting: true, trigger: "greeting" }), false);
  });

  /* ---------- Cancel ---------- */

  test("cancel before packing: asks first; Yes cancels with points back; a second tap does nothing", async () => {
    const o = await order("QS-5", { pointsRedeemed: 100 });
    assert.equal(await handleCancelRequest(await asCust(), "cancel my order"), true);
    assert.match(lastText(), /ocancel_yes:/);
    await handleAssistantButton(await asCust(), `ocancel_yes:${o.id}`, "Yes, cancel it");
    assert.equal((await fresh(o.id)).status, "CANCELLED");
    assert.match(lastText(), /is cancelled\. Your 100 loyalty points are back/);
    const count = sent.length;
    await handleAssistantButton(await asCust(), `ocancel_yes:${o.id}`, "Yes, cancel it");
    assert.equal(sent.length, count);
  });

  test("cancel after paying: staff are asked to call, nothing is cancelled", async () => {
    const o = await order("QS-6", { status: "PAID", paidAt: new Date(), paidAmount: 560 });
    await handleCancelRequest(await asCust(), "cancel");
    assert.match(lastText(), /already paid, so our team will call you/);
    const after = await fresh(o.id);
    assert.equal(after.status, "PAID");
    assert.match(after.internalNote ?? "", /asked to cancel/);
  });

  test('"cancel" with no order is not taken as an order cancel (STOP rules apply as before)', async () => {
    assert.equal(await handleCancelRequest(await asCust(), "cancel"), false);
  });

  test('"No, keep it" keeps the order', async () => {
    const o = await order("QS-7");
    await handleAssistantButton(await asCust(), `ocancel_no:${o.id}`, "No, keep it");
    assert.equal((await fresh(o.id)).status, "NEW");
    assert.match(lastText(), /keep order \*QS-7\* going/);
  });

  /* ---------- After delivery ---------- */

  test("delivered: All good thanks them with their points; Report a problem alerts staff and pauses offers", async () => {
    const o = await order("QS-8", { status: "DELIVERED", paidAt: new Date(), paidAmount: 2000, total: 2000 });
    await handleAssistantButton(await asCust(), `fb_ok:${o.id}`, "👍 All good");
    assert.match(lastText(), /glad everything arrived well/);
    assert.match(lastText(), /loyalty points/);
    await handleAssistantButton(await asCust(), `fb_bad:${o.id}`, "⚠️ Report a problem");
    assert.match(lastText(), /send a photo/);
    assert.ok((await cust()).tags.includes("issue-open"));
    assert.equal((await busyForOffers([customerId])).get(customerId), "Reported a problem with an order");
  });

  /* ---------- Who / wrong number ---------- */

  test("wrong number: apologises once and really stops all messages", async () => {
    await handleAssistantText(await asCust(), { type: "text" }, "wrong number", "text", { greeting: false });
    assert.match(lastText(), /removed this number/);
    assert.equal((await cust()).optedOut, true);
  });

  test("'who is this?' gets a short introduction, not an opt-out", async () => {
    await handleAssistantText(await asCust(), { type: "text" }, "Who is this?", "text", { greeting: false });
    assert.match(lastText(), /this is \*QA Assistant Shop\* on WhatsApp/);
    const c = await cust();
    assert.equal(c.optedOut, false);
    assert.ok(c.tags.includes("asked-who"));
  });

  /* ---------- Typed lists, voice notes, photos ---------- */

  test("an order typed as a list: 'our team will put it together', once in 2 hours", async () => {
    assert.equal(await handleAssistantText(await asCust(), { type: "text" }, "2 kg rice, 1 l coconut oil", "text", { greeting: false }), true);
    assert.match(lastText(), /put your order together/);
    const count = sent.length;
    await handleAssistantText(await asCust(), { type: "text" }, "also 1 packet salt", "text", { greeting: false });
    assert.equal(sent.length, count);
  });

  test("a voice note gets 'our team will listen and reply'", async () => {
    await handleAssistantText(await asCust(), { type: "audio" }, "[Voice note]", "media", { greeting: false });
    assert.match(lastText(), /voice message, Meena! Our team will listen/);
  });

  /* ---------- Shop hours, staff chatting ---------- */

  test("outside shop hours: one reply saying when the shop opens", async () => {
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay({ hoursOn: true, openAt: shopClock(1), closeAt: shopClock(2) }) } });
    await handleAssistantText(await asCust(), { type: "text" }, "do you have ghee?", "text", { greeting: false });
    assert.match(lastText(), /closed right now\. We open at/);
    const count = sent.length;
    await handleAssistantText(await asCust(), { type: "text" }, "hello?", "text", { greeting: false });
    assert.equal(sent.length, count);
  });

  test("while staff are chatting, no automatic replies", async () => {
    await db.message.create({ data: { customerId, templateName: "Typed reply", body: "Hi Meena!", status: "SENT" } });
    assert.equal(await handleAssistantText(await asCust(), { type: "text" }, "2 kg rice", "text", { greeting: false, staff: true }), false);
    assert.equal(sent.length, 0);
  });

  /* ---------- One-tap reorder ---------- */

  test("'reorder': same as last time? Yes makes the order and asks to confirm the saved address", async () => {
    const lastOrder = await order("QS-9", { status: "DELIVERED", paidAt: new Date(Date.now() - 20 * 24 * HOUR), createdAt: new Date(Date.now() - 20 * 24 * HOUR) });
    await handleAssistantText(await asCust(), { type: "text" }, "reorder", "text", { greeting: false });
    assert.match(lastText(), /reorder_yes:/);
    assert.match(lastText(), /• 1 × Coconut oil 1L/);
    await handleAssistantButton(await asCust(), `reorder_yes:${lastOrder.id}`, "✅ Yes, same order", "wamid.tap1");
    const made = await db.order.findFirstOrThrow({ where: { customerId, internalNote: { contains: "One-tap reorder" } } });
    assert.equal(made.total, 560);
    assert.match(lastText(), /addr_ok:/);
    // The same tap delivered twice makes one order.
    await handleAssistantButton(await asCust(), `reorder_yes:${lastOrder.id}`, "✅ Yes, same order", "wamid.tap1");
    assert.equal(await db.order.count({ where: { customerId, internalNote: { contains: "One-tap reorder" } } }), 1);
  });

  /* ---------- A second cart ---------- */

  test("second cart while an unconfirmed one is open: the old one is replaced, no question", async () => {
    const old = await order("QS-10");
    const now = await order("QS-11");
    await afterNewOrder(now);
    assert.equal((await fresh(old.id)).status, "CANCELLED");
    assert.doesNotMatch(lastText(), /cart_add/);
  });

  test("second cart while a COD order is being prepared: never cancelled; Add puts the items into it", async () => {
    const old = await order("QS-12", { status: "CONFIRMED", paymentMethod: "cod" });
    const now = await order("QS-13", { items: [{ id: "ghee", name: "Ghee 500ml", quantity: 1, price: 300 }], total: 360 });
    await afterNewOrder(now);
    assert.equal((await fresh(old.id)).status, "CONFIRMED");
    assert.match(lastText(), new RegExp(`cart_add:${now.id}:${old.id}`));
    await handleAssistantButton(await asCust(), `cart_add:${now.id}:${old.id}`, "➕ Add to QS-12");
    const merged = await fresh(old.id);
    assert.equal(merged.total, 860);
    assert.equal((merged.items as unknown[]).length, 2);
    assert.equal((await fresh(now.id)).status, "CANCELLED");
    assert.match(lastText(), /New total: ₹860\*/);
    // The other button afterwards changes nothing.
    const count = sent.length;
    await handleAssistantButton(await asCust(), `cart_sep:${now.id}`, "🆕 Separate order");
    assert.equal(sent.length, count);
  });

  test("second cart while a paid order is being prepared: Add ships together, paid on its own", async () => {
    const old = await order("QS-14", { status: "PAID", paidAt: new Date(), paidAmount: 560, note: "12, 3rd Street, Anna Nagar, Madurai - 625020" });
    const now = await order("QS-15");
    await afterNewOrder(now);
    await handleAssistantButton(await asCust(), `cart_add:${now.id}:${old.id}`, "➕ Add to QS-14");
    const after = await fresh(now.id);
    assert.ok(after.addressConfirmedAt);
    assert.match(after.internalNote ?? "", /Ship together with QS-14/);
    assert.match(lastText(), /pay_online:/);
  });

  test("Separate order goes on to the address step", async () => {
    const old = await order("QS-16", { status: "CONFIRMED", paymentMethod: "cod" });
    const now = await order("QS-17");
    await afterNewOrder(now);
    await handleAssistantButton(await asCust(), `cart_sep:${now.id}`, "🆕 Separate order");
    assert.match(lastText(), /addr_ok:/);
    assert.equal((await fresh(old.id)).status, "CONFIRMED");
  });

  /* ---------- Payments ---------- */

  test("UPI failed: Try again and Cash on delivery buttons; no COD button when the order is over the COD limit", async () => {
    const o = await order("QS-18", { paymentRequestedAt: new Date() });
    await recordPaymentFailure(o.id, "UPI timeout");
    assert.match(lastText(), /didn't go through \(UPI timeout\)/);
    assert.match(lastText(), /pay_online:/);
    assert.match(lastText(), /pay_cod:/);
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay({ codMax: 300 }) } });
    await recordPaymentFailure(o.id, "UPI timeout");
    assert.doesNotMatch(lastText(), /pay_cod:/);
  });

  test("cash on delivery confirmed: one message with the amount and the address", async () => {
    const o = await order("QS-19", { note: "12, 3rd Street, Anna Nagar, Madurai - 625020" });
    await confirmCod(o.id);
    assert.equal(sent.length, 1);
    assert.match(lastText(), /Order confirmed/);
    assert.match(lastText(), /Amount to pay on delivery: \*₹560\*/);
    assert.equal((await fresh(o.id)).status, "CONFIRMED");
  });

  /* ---------- Unfinished orders ---------- */

  test("unfinished order: a nudge after 3 hours about the one thing missing, then the last one at 22 hours", async () => {
    const o = await order("QS-20", { createdAt: new Date(Date.now() - 4 * HOUR), addressAskedAt: new Date(Date.now() - 4 * HOUR) });
    await nudgeUnfinishedOrders(new Date());
    assert.match(lastText(), /almost done/);
    assert.equal((await fresh(o.id)).nudgeCount, 1);
    const count = sent.length;
    await nudgeUnfinishedOrders(new Date());
    assert.equal(sent.length, count); // the last one waits for 22 hours
    await db.order.update({ where: { id: o.id }, data: { createdAt: new Date(Date.now() - 22.5 * HOUR), nudgedAt: new Date(Date.now() - 5 * HOUR) } });
    await nudgeUnfinishedOrders(new Date());
    assert.match(lastText(), /quick reminder/);
    const after = await fresh(o.id);
    assert.equal(after.nudgeCount, 2);
    assert.ok(after.paymentReminderAt); // the paid day-1 reminder isn't sent on top
  });

  test("reminders off: no nudges", async () => {
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay({ nudgeOn: false }) } });
    await order("QS-21", { createdAt: new Date(Date.now() - 4 * HOUR) });
    await nudgeUnfinishedOrders(new Date());
    assert.equal(sent.length, 0);
  });

  test("expiry: an unfinished WhatsApp cart closes after 3 days; COD and staff-made orders don't", async () => {
    const old = new Date(Date.now() - 4 * 24 * HOUR);
    const cart = await order("QS-22", { createdAt: old });
    const cod = await order("QS-23", { createdAt: old, paymentMethod: "cod" });
    const manual = await order("QS-24", { createdAt: old, waMessageId: null });
    await expireUnfinishedOrders(new Date());
    const c = await fresh(cart.id);
    assert.equal(c.status, "CANCELLED");
    assert.match(c.internalNote ?? "", /Expired: not completed within 3 days/);
    assert.equal((await fresh(cod.id)).status, "NEW");
    assert.equal((await fresh(manual.id)).status, "NEW");
  });

  test("expiry set to 7 days keeps a 4-day-old cart", async () => {
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay({ cartExpiryDays: 7 }) } });
    const cart = await order("QS-25", { createdAt: new Date(Date.now() - 4 * 24 * HOUR) });
    await expireUnfinishedOrders(new Date());
    assert.equal((await fresh(cart.id)).status, "NEW");
  });

  /* ---------- Offers and sources ---------- */

  test("offers skip someone with an order in progress, or who tapped Stop promotions", async () => {
    await order("QS-26", { status: "CONFIRMED", paymentMethod: "cod" });
    assert.equal((await busyForOffers([customerId])).get(customerId), "Has an order in progress");
    await db.order.deleteMany({ where: { clientId } });
    assert.equal(await handleAssistantButton(await asCust(), "Stop promotions", "Stop promotions"), true);
    assert.match(lastText(), /won't receive offers/);
    assert.ok((await cust()).tags.includes("no-offers"));
    assert.equal((await cust()).optedOut, false); // order messages still reach them
    assert.equal((await busyForOffers([customerId])).get(customerId), "Asked for no offers");
  });

  test("where a customer came from: a Click-to-WhatsApp ad, or a '(via instagram)' link", async () => {
    await noteSource(customerId, { referral: { source_type: "ad", headline: "Diwali oils" } }, "Hi");
    assert.ok((await cust()).tags.includes("src:ad"));
    assert.match((await cust()).optInSource ?? "", /WhatsApp ad: Diwali oils|Inbound/);
    await noteSource(customerId, {}, "Hi, I want to order (via instagram)");
    assert.equal((await cust()).tags.filter((t) => t.startsWith("src:")).length, 1); // the first source stays
  });

  /* ---------- Every kind of message, in the shop's own name ---------- */

  const say = async (text: string, extra: { greeting?: boolean; trigger?: "greeting" | "asked" | "prices" | null } = {}) =>
    handleAssistantText(await asCust(), { type: "text" }, text, "text", { greeting: false, ...extra });
  const catalogueBody = () => String((last()?.interactive as { body?: { text?: string } } | undefined)?.body?.text ?? "");

  test("'hi' from a new customer: the catalogue with 'Welcome to <this shop>'", async () => {
    assert.equal(await say("hi", { greeting: true, trigger: "greeting" }), false); // the catalogue answers a hello
    await autoSendCatalogue(customerId, "greeting");
    assert.equal((last()?.interactive as { type?: string })?.type, "catalog_message");
    assert.match(catalogueBody(), /^Hi Meena! 👋 Welcome to \*QA Assistant Shop\*\./);
  });

  test("'hi' from someone who ordered before: 'Welcome back', with Reorder", async () => {
    await order("QS-40", { status: "DELIVERED", deliveredAt: new Date(Date.now() - 10 * 24 * HOUR), paidAt: new Date() });
    await autoSendCatalogue(customerId, "greeting");
    assert.match(catalogueBody(), /^Welcome back, Meena! 👋 Lovely to hear from you again at \*QA Assistant Shop\*/);
    assert.match(catalogueBody(), /reply \*Reorder\*/);
  });

  test("no catalogue connected: a hello still gets the shop's welcome, as text", async () => {
    const ok = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.interactive?.type === "catalog_message")
        return new Response(JSON.stringify({ error: { message: "No catalog", code: 131009 } }), { status: 400, headers: { "Content-Type": "application/json" } });
      return ok(url, init);
    }) as typeof fetch;
    try {
      await autoSendCatalogue(customerId, "greeting");
    } finally {
      globalThis.fetch = ok;
    }
    assert.match(lastText(), /Welcome to \*QA Assistant Shop\*/);
    assert.match(lastText(), /How can we help you today/);
    assert.ok(await db.message.findFirst({ where: { customerId, templateName: "Welcome" } }));
  });

  test("'hi' at night: one message (the welcome says when we open), no separate closed reply", async () => {
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay({ hoursOn: true, openAt: shopClock(1), closeAt: shopClock(2) }) } });
    assert.equal(await say("hi", { greeting: true, trigger: "greeting" }), false);
    assert.equal(sent.length, 0);
    await autoSendCatalogue(customerId, "greeting");
    assert.equal(sent.length, 1);
    assert.match(catalogueBody(), /closed right now and open at/);
  });

  test("'damaged': sorry, a photo please; noted on the order for staff, offers pause; said twice, answered once", async () => {
    const o = await order("QS-41", { status: "DELIVERED", deliveredAt: new Date(), paidAt: new Date() });
    assert.equal(await say("the oil bottle came damaged"), true);
    assert.match(lastText(), /really sorry about this, Meena.*send a photo.*QA Assistant Shop\* team/);
    assert.ok((await cust()).tags.includes("issue-open"));
    assert.match((await fresh(o.id)).internalNote ?? "", /Customer reported a problem on WhatsApp .*"the oil bottle came damaged"/);
    assert.equal((await busyForOffers([customerId])).get(customerId), "Reported a problem with an order");
    const count = sent.length;
    await say("it is leaking everywhere");
    assert.equal(sent.length, count);
  });

  test("'not received' while it's on its way: the order's status, not a complaint", async () => {
    await order("QS-42", { status: "DISPATCHED", paidAt: new Date() });
    await say("I have not received my order");
    assert.match(lastText(), /on its way/);
    assert.ok(!(await cust()).tags.includes("issue-open"));
  });

  test("'not received' after it was marked delivered: treated as a problem", async () => {
    await order("QS-43", { status: "DELIVERED", deliveredAt: new Date(), paidAt: new Date() });
    await say("I didn't get my parcel");
    assert.match(lastText(), /really sorry/);
    assert.ok((await cust()).tags.includes("issue-open"));
  });

  test("'call me': someone will call, with the shop's number; the customer is tagged for a call back", async () => {
    await db.client.update({ where: { id: clientId }, data: { supportPhone: "98400 12345" } });
    await say("please call me");
    assert.match(lastText(), /Someone from \*QA Assistant Shop\* will call you on this number shortly/);
    assert.match(lastText(), /98400 12345/);
    assert.ok((await cust()).tags.includes("callback"));
    await db.client.update({ where: { id: clientId }, data: { supportPhone: null } });
  });

  test("delivery and payment questions are answered from the shop's own settings, once in 30 minutes", async () => {
    await say("do you deliver to KK Nagar?");
    assert.match(lastText(), /Yes, we deliver/);
    assert.match(lastText(), /Cash on delivery is available/);
    const count = sent.length;
    await say("do you deliver to Anna Nagar?");
    assert.equal(sent.length, count);
    await say("is COD available");
    assert.match(lastText(), /you can pay online right here in WhatsApp/);
  });

  test("'ok', 👍 or a sticker: no reply at all (and no catalogue)", async () => {
    assert.equal(await say("ok"), true);
    assert.equal(await say("👍", { greeting: true }), true);
    assert.equal(await handleAssistantText(await asCust(), { type: "sticker" }, "[Sticker]", "media", { greeting: false }), true);
    assert.equal(sent.length, 0);
  });

  test("'thank you': one warm line with the shop's name; a second within 6 hours, nothing", async () => {
    await say("thank you so much");
    assert.match(lastText(), /most welcome, Meena! 😊 Thank you for choosing \*QA Assistant Shop\*/);
    const count = sent.length;
    await say("thanks");
    assert.equal(sent.length, count);
  });

  test("anything else: 'thanks for reaching out, our team will reply shortly', once in 6 hours", async () => {
    assert.equal(await say("do you have ghee?"), true);
    assert.match(lastText(), /Thanks for reaching out to \*QA Assistant Shop\*, Meena! 🙏 Our team will reply shortly/);
    const count = sent.length;
    await say("and also sesame oil?");
    assert.equal(sent.length, count);
  });

  test("a video or a file gets 'our team will take a look'", async () => {
    await handleAssistantText(await asCust(), { type: "document" }, "[Document]", "media", { greeting: false });
    assert.match(lastText(), /Thank you for the file, Meena! Our team will take a look/);
  });
});
