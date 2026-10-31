// The delivery address step of a WhatsApp cart, scenario by scenario, as a customer would do it. Meta is never
// called: fetch is replaced with a fake that answers like Meta and keeps what each message asked WhatsApp to show.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { addressGivenByStaff, askNewAddress, confirmSavedAddress, handleAddressReply, sendAddressFallback, startAddressStep } from "../../src/lib/delivery-address";
import { startCheckout } from "../../src/lib/payments";

type Sent = { url: string; body: { type?: string; interactive?: Record<string, unknown>; text?: { body?: string } } };

describe("delivery address step", () => {
  let clientId: string;
  let customerId: string;
  const sent: Sent[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;

  const pay = (extra: Record<string, unknown> = {}) => ({ whatsappPay: true, upiOn: false, codOn: true, askAddress: true, ...extra });
  const last = () => sent[sent.length - 1]?.body;
  const lastText = () => JSON.stringify(last());
  const cart = async (ref: string) =>
    db.order.create({ data: { ref, clientId, customerId, status: "NEW", total: 560, items: [{ id: "oil", name: "Coconut oil 1L", quantity: 1, price: 500 }] } });
  const fresh = (id: string) => db.order.findUniqueOrThrow({ where: { id } });
  const answer = (values: Record<string, string>) => ({ type: "interactive", interactive: { type: "nfm_reply", nfm_reply: { name: "address_message", response_json: JSON.stringify({ values }) } } });
  const good = { name: "Meena R", phone_number: "+919990007777", in_pin_code: "625020", house_number: "12", address: "3rd Street", landmark_area: "Anna Nagar", city: "Madurai", state: "Tamil Nadu" };

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.addr${++n}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const client = await db.client.create({ data: { name: "QA Address Shop", orderPrefix: "QD", paymentConfig: "qa-upi", paySettings: pay() } });
    clientId = client.id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: "qa-address-phone", businessAccountId: "qa-address-waba", token: "qa-fake-token", isDefault: true } });
  });

  beforeEach(async () => {
    sent.length = 0;
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay() } });
    await db.message.deleteMany({ where: { customer: { clientId } } });
    await db.order.deleteMany({ where: { clientId } });
    await db.reply.deleteMany({ where: { customer: { clientId } } });
    await db.customer.deleteMany({ where: { clientId } });
    const c = await db.customer.create({ data: { clientId, name: "+919990007777", phone: "919990007777" } });
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

  test("new customer: the address form goes first (with their number filled in), no payment yet", async () => {
    const o = await cart("QD-1");
    assert.equal(await startAddressStep(o.id), "asked");
    assert.equal(sent.length, 1);
    assert.equal(last().interactive?.type, "address_message");
    assert.match(lastText(), /"phone_number":"\+919990007777"/);
    assert.match(lastText(), /"country":"IN"/);
    const after = await fresh(o.id);
    assert.ok(after.addressAskedAt);
    assert.equal(after.paymentRequestedAt, null);
  });

  test("they fill in the form: address saved on the customer and the order, then the payment choice shows it", async () => {
    const o = await cart("QD-2");
    await startAddressStep(o.id);
    assert.equal(await handleAddressReply({ id: customerId }, answer(good), "Delivery address"), true);
    const after = await fresh(o.id);
    assert.ok(after.addressConfirmedAt);
    assert.match(after.note ?? "", /12, 3rd Street, Anna Nagar, Madurai, Tamil Nadu - 625020/);
    const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    assert.equal(c.name, "Meena R"); // the name from the form replaces the bare number
    assert.match(c.locationRaw ?? "", /625020/);
    assert.equal(last().interactive?.type, "button");
    assert.match(lastText(), /pay_online:/);
    assert.match(lastText(), /Deliver to: 12, 3rd Street/);
  });

  test("a wrong pincode: the form comes back with the field marked and their answers kept", async () => {
    const o = await cart("QD-3");
    await startAddressStep(o.id);
    await handleAddressReply({ id: customerId }, answer({ ...good, in_pin_code: "62502" }), "x");
    assert.equal(last().interactive?.type, "address_message");
    assert.match(lastText(), /validation_errors/);
    assert.match(lastText(), /3rd Street/);
    assert.equal((await fresh(o.id)).addressConfirmedAt, null);
  });

  test("repeat customer: 'deliver here?' with the saved address; Yes goes on to payment, a second tap does nothing", async () => {
    await db.customer.update({ where: { id: customerId }, data: { name: "Meena R", locationRaw: "12, 3rd Street, Anna Nagar, Madurai - 625020", location: "Anna Nagar" } });
    const o = await cart("QD-4");
    await startAddressStep(o.id);
    assert.equal(last().interactive?.type, "button");
    assert.match(lastText(), /addr_ok:/);
    assert.match(lastText(), /addr_new:/);
    assert.match(lastText(), /Anna Nagar/);
    await confirmSavedAddress(o.id, customerId);
    assert.ok((await fresh(o.id)).addressConfirmedAt);
    assert.match(lastText(), /pay_cod:/);
    const count = sent.length;
    await confirmSavedAddress(o.id, customerId);
    assert.equal(sent.length, count);
  });

  test('repeat customer types "same" instead of tapping: taken as Yes', async () => {
    await db.customer.update({ where: { id: customerId }, data: { locationRaw: "12, 3rd Street, Anna Nagar, Madurai - 625020" } });
    const o = await cart("QD-5");
    await startAddressStep(o.id);
    assert.equal(await handleAddressReply({ id: customerId }, { type: "text" }, "same"), true);
    assert.ok((await fresh(o.id)).addressConfirmedAt);
  });

  test("repeat customer taps New address: the form opens; the new answer replaces the old address", async () => {
    await db.customer.update({ where: { id: customerId }, data: { locationRaw: "Old house, Sellur, Madurai - 625002" } });
    const o = await cart("QD-6");
    await startAddressStep(o.id);
    await askNewAddress(o.id, customerId);
    assert.equal(last().interactive?.type, "address_message");
    await handleAddressReply({ id: customerId }, answer(good), "x");
    assert.match((await fresh(o.id)).note ?? "", /Anna Nagar/);
  });

  test("they type the address in the chat instead of using the form", async () => {
    const o = await cart("QD-7");
    await startAddressStep(o.id);
    const used = await handleAddressReply({ id: customerId }, { type: "text" }, "No 12, 3rd Street, Anna Nagar, Madurai 625020");
    assert.equal(used, true);
    assert.ok((await fresh(o.id)).addressConfirmedAt);
    assert.match(lastText(), /How would you like to pay/);
  });

  test("a question typed while we wait is not taken as an address", async () => {
    const o = await cart("QD-8");
    await startAddressStep(o.id);
    assert.equal(await handleAddressReply({ id: customerId }, { type: "text" }, "how much is delivery?"), false);
    assert.equal((await fresh(o.id)).addressConfirmedAt, null);
  });

  test("they share their location: used as the address, with a map link on the order", async () => {
    const o = await cart("QD-9");
    await startAddressStep(o.id);
    await handleAddressReply({ id: customerId }, { type: "location", location: { latitude: 9.93, longitude: 78.12, name: "Home", address: "Anna Nagar, Madurai" } }, "Location");
    const after = await fresh(o.id);
    assert.ok(after.addressConfirmedAt);
    assert.equal(after.mapUrl, "https://maps.google.com/?q=9.93,78.12");
  });

  test("old WhatsApp can't show the form (error 1026): 'type it or share your location' goes instead", async () => {
    const o = await cart("QD-10");
    await startAddressStep(o.id);
    assert.equal(await sendAddressFallback(customerId), true);
    assert.equal(last().interactive?.type, "location_request_message");
    assert.match(lastText(), /type your full address/);
    assert.ok(o.id);
  });

  test("they had already chosen cash on delivery: the address is just confirmed, no second payment question", async () => {
    const o = await cart("QD-11");
    await startAddressStep(o.id);
    await db.order.update({ where: { id: o.id }, data: { paymentMethod: "cod", status: "CONFIRMED" } });
    await handleAddressReply({ id: customerId }, answer(good), "x");
    assert.equal(last().type, "text");
    assert.match(lastText(), /Order \*QD-11\* will be delivered to/);
    assert.doesNotMatch(lastText(), /pay_online/);
    assert.ok((await fresh(o.id)).addressConfirmedAt);
  });

  test('they typed "COD" before giving the address: after the address, no second payment question', async () => {
    const o = await cart("QD-16");
    await startAddressStep(o.id);
    await db.order.update({ where: { id: o.id }, data: { paymentMethod: "cod" } });
    await handleAddressReply({ id: customerId }, answer(good), "x");
    // Typed "COD" + the address = the cash-on-delivery order is confirmed, in one message.
    assert.match(lastText(), /cash on delivery order \*QD-16\*/);
    assert.doesNotMatch(lastText(), /pay_online/);
    const after = await fresh(o.id);
    assert.equal(after.status, "CONFIRMED");
    assert.equal(after.paymentMethod, "cod");
  });

  test("an address sent for an old, replaced cart goes to the new cart", async () => {
    const old = await cart("QD-12");
    await startAddressStep(old.id);
    await db.order.update({ where: { id: old.id }, data: { status: "CANCELLED" } });
    const o = await cart("QD-13");
    await startAddressStep(o.id);
    await handleAddressReply({ id: customerId }, answer(good), "x");
    assert.ok((await fresh(o.id)).addressConfirmedAt);
    assert.equal((await fresh(old.id)).addressConfirmedAt, null);
  });

  test("staff add the address after a call: the waiting order goes on to payment; a second save sends nothing", async () => {
    const o = await cart("QD-17");
    await startAddressStep(o.id);
    await db.order.update({ where: { id: o.id }, data: { note: "Door 4, Sellur, Madurai - 625002" } });
    assert.equal(await addressGivenByStaff(o.id), true);
    assert.match(lastText(), /Deliver to: Door 4, Sellur/);
    const count = sent.length;
    assert.equal(await addressGivenByStaff(o.id), false);
    assert.equal(sent.length, count);
  });

  test("setting off: the cart goes straight to payment", async () => {
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay({ askAddress: false }) } });
    const o = await cart("QD-14");
    assert.equal(await startAddressStep(o.id), "skip");
    await startCheckout(o);
    assert.match(lastText(), /pay_online:/);
  });

  test("COD only for some areas: the area from the address decides, after the address", async () => {
    await db.client.update({ where: { id: clientId }, data: { paySettings: pay({ codAreas: "Chennai" }) } });
    const o = await cart("QD-15");
    await startAddressStep(o.id);
    await handleAddressReply({ id: customerId }, answer(good), "x"); // Madurai: no COD
    assert.doesNotMatch(lastText(), /pay_cod:/);
    assert.match(lastText(), /order_details|Review and pay/);
  });
});
