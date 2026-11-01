// Saved delivery addresses (lib/address-book.ts, lib/address-book-server.ts, lib/delivery-address.ts): every address
// a customer uses is kept (newest first, up to 5); with two or more, WhatsApp asks "Which address?" and the pick (a
// tap or its number) goes on the order and becomes their latest. Meta is never called: fetch is a fake that keeps
// what each message asked WhatsApp to show.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { addressKey, pickedNumber, withAddress, type SavedAddress } from "../../src/lib/address-book";
import { addressBook, rememberAddress } from "../../src/lib/address-book-server";
import { db } from "../../src/lib/db";
import { confirmSavedAddress, handleAddressReply, startAddressStep } from "../../src/lib/delivery-address";

const HOME = "12, 3rd Street, Anna Nagar, Madurai - 625020";
const OFFICE = "45, Bypass Road, KK Nagar, Madurai - 625020";
const MOTHER = "7, Temple Street, Sellur, Madurai - 625002";

describe("saved addresses: the list", () => {
  test("1. the same address however it's written is one entry; newest on top; only 5 kept", () => {
    let list: SavedAddress[] = [];
    list = withAddress(list, { text: HOME, area: "Anna Nagar" }, new Date("2026-10-01"));
    list = withAddress(list, { text: OFFICE }, new Date("2026-10-02"));
    list = withAddress(list, { text: "12 3rd street anna nagar madurai 625020" }, new Date("2026-10-03"));
    assert.equal(list.length, 2);
    assert.equal(list[0].text, "12 3rd street anna nagar madurai 625020");
    assert.equal(list[0].area, "Anna Nagar", "the area stays with the address");
    for (let i = 0; i < 6; i++) list = withAddress(list, { text: `${i} New Street, Madurai` });
    assert.equal(list.length, 5);
    assert.equal(addressKey(HOME), addressKey("12 3RD STREET, ANNA NAGAR, MADURAI 625020"));
  });

  test("2. a reply with a number picks that address; anything else doesn't", () => {
    assert.equal(pickedNumber("2", 3), 1);
    assert.equal(pickedNumber(" 1st ", 3), 0);
    assert.equal(pickedNumber("address 3", 3), 2);
    assert.equal(pickedNumber("4", 3), null);
    assert.equal(pickedNumber("12, 3rd Street", 3), null);
  });
});

type Sent = { url: string; body: { type?: string; interactive?: Record<string, unknown> } };

describe("saved addresses: on WhatsApp and the customer", () => {
  let clientId: string;
  let customerId: string;
  const sent: Sent[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  const pay = { whatsappPay: true, upiOn: false, codOn: true, askAddress: true };
  // Only what went to WhatsApp: the Google Sheet log is sent in the background and may land in between.
  const wa = () => sent.filter((s) => /graph\.facebook\.com/.test(s.url));
  const last = () => wa()[wa().length - 1]?.body;
  const lastText = () => JSON.stringify(last());
  const cart = async (ref: string) =>
    db.order.create({ data: { ref, clientId, customerId, status: "NEW", total: 560, items: [{ id: "oil", name: "Coconut oil 1L", quantity: 1, price: 500 }] } });
  const fresh = (id: string) => db.order.findUniqueOrThrow({ where: { id } });
  const customer = () => db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const save = async (...texts: string[]) => {
    for (const t of texts.reverse()) await rememberAddress(customerId, { text: t });
    await db.customer.update({ where: { id: customerId }, data: { locationRaw: texts[texts.length - 1] } });
  };

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.book${++n}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const client = await db.client.create({ data: { name: `QA Address Book ${Date.now()}`, orderPrefix: "QB", paymentConfig: "qa-upi", paySettings: pay } });
    clientId = client.id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: "qa-book-phone", businessAccountId: "qa-book-waba", token: "qa-fake-token", isDefault: true } });
  });

  beforeEach(async () => {
    sent.length = 0;
    await db.message.deleteMany({ where: { customer: { clientId } } });
    await db.order.deleteMany({ where: { clientId } });
    await db.reply.deleteMany({ where: { customer: { clientId } } });
    await db.customer.deleteMany({ where: { clientId } });
    const c = await db.customer.create({ data: { clientId, name: "Meena R", phone: "919990008888" } });
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

  test("3. two saved: 'Which address?' with both as buttons and New address", async () => {
    await save(HOME, OFFICE);
    const o = await cart("QB-1");
    assert.equal(await startAddressStep(o.id), "asked");
    assert.equal(last().interactive?.type, "button");
    const t = lastText();
    assert.match(t, /Which address shall we deliver it to/);
    assert.match(t, /1\. 12, 3rd Street/);
    assert.match(t, /2\. 45, Bypass Road/);
    assert.equal((t.match(/addr_pick:/g) ?? []).length, 2);
    assert.match(t, /addr_new:/);
    assert.equal((await fresh(o.id)).addressConfirmedAt, null, "nothing chosen yet");
  });

  test("4. they tap the second: it goes on the order, becomes their latest, then payment", async () => {
    await save(HOME, OFFICE);
    const o = await cart("QB-2");
    await startAddressStep(o.id);
    await confirmSavedAddress(o.id, customerId, addressKey(OFFICE));
    const after = await fresh(o.id);
    assert.ok(after.addressConfirmedAt);
    assert.equal(after.note, OFFICE);
    assert.equal((await customer()).locationRaw, OFFICE);
    assert.equal((await addressBook(customerId))[0].text, OFFICE, "on top of the list now");
    assert.equal((await addressBook(customerId)).length, 2, "the other is still saved");
    assert.match(lastText(), /pay_cod:/);
    const count = wa().length;
    await confirmSavedAddress(o.id, customerId, addressKey(HOME));
    assert.equal(wa().length, count, "a second tap changes nothing");
    assert.equal((await fresh(o.id)).note, OFFICE);
  });

  test('5. they reply "2": the second address; "yes" doesn\'t say which, so the question comes again', async () => {
    await save(HOME, OFFICE);
    const o = await cart("QB-3");
    await startAddressStep(o.id);
    const asked = wa().length;
    assert.equal(await handleAddressReply({ id: customerId }, { type: "text" }, "yes"), true);
    assert.equal(wa().length, asked + 1);
    assert.match(lastText(), /Which address/);
    assert.equal((await fresh(o.id)).addressConfirmedAt, null);
    assert.equal(await handleAddressReply({ id: customerId }, { type: "text" }, "2"), true);
    assert.equal((await fresh(o.id)).note, OFFICE);
  });

  test("6. three or more saved: a list to choose from (with areas), and New address", async () => {
    await rememberAddress(customerId, { text: MOTHER, area: "Sellur" });
    await rememberAddress(customerId, { text: OFFICE, area: "KK Nagar" });
    await rememberAddress(customerId, { text: HOME, area: "Anna Nagar" });
    await db.customer.update({ where: { id: customerId }, data: { locationRaw: HOME } });
    const o = await cart("QB-4");
    await startAddressStep(o.id);
    assert.equal(last().interactive?.type, "list");
    const t = lastText();
    assert.equal((t.match(/addr_pick:/g) ?? []).length, 3);
    assert.match(t, /"title":"1\. Anna Nagar"/);
    assert.match(t, /"title":"3\. Sellur"/);
    assert.match(t, /addr_new:/);
    await confirmSavedAddress(o.id, customerId, addressKey(MOTHER));
    assert.equal((await fresh(o.id)).note, MOTHER);
    assert.equal((await customer()).location, "Sellur");
  });

  test("7. one saved: the usual 'deliver to this address?' Yes / New address", async () => {
    await save(HOME);
    const o = await cart("QB-5");
    await startAddressStep(o.id);
    assert.match(lastText(), /addr_ok:/);
    assert.doesNotMatch(lastText(), /addr_pick:/);
  });

  test("8. a customer from before the list: their profile address and past orders' addresses count", async () => {
    await db.customer.update({ where: { id: customerId }, data: { locationRaw: HOME, location: "Anna Nagar" } });
    await db.order.create({ data: { ref: "QB-OLD1", clientId, customerId, status: "DELIVERED", total: 300, items: [], note: OFFICE, createdAt: new Date(Date.now() - 20 * 86_400_000) } });
    await db.order.create({ data: { ref: "QB-OLD2", clientId, customerId, status: "DELIVERED", total: 300, items: [], note: "please call before coming", createdAt: new Date(Date.now() - 10 * 86_400_000) } });
    const book = await addressBook(customerId);
    assert.deepEqual(book.map((a) => a.text), [HOME, OFFICE], "the profile address first, a note that isn't an address left out");
    // The first save keeps those older ones.
    await rememberAddress(customerId, { text: MOTHER });
    assert.deepEqual((await addressBook(customerId)).map((a) => a.text).slice(0, 3), [MOTHER, HOME, OFFICE]);
  });

  test("9. a new address typed on WhatsApp joins the list; the old ones stay", async () => {
    await save(HOME);
    const o = await cart("QB-6");
    await startAddressStep(o.id);
    await handleAddressReply({ id: customerId }, { type: "text" }, "No 45, Bypass Road, KK Nagar, Madurai 625020");
    assert.ok((await fresh(o.id)).addressConfirmedAt);
    const book = await addressBook(customerId);
    assert.equal(book.length, 2);
    assert.match(book[0].text, /Bypass Road/);
    assert.equal(book[1].text, HOME);
  });

  test("10. a tap on an address no longer saved asks again with what is saved now", async () => {
    await save(HOME, OFFICE);
    const o = await cart("QB-7");
    await startAddressStep(o.id);
    const asked = wa().length;
    await confirmSavedAddress(o.id, customerId, "nosuchkey");
    assert.equal(wa().length, asked + 1);
    assert.match(lastText(), /Which address/);
    assert.equal((await fresh(o.id)).addressConfirmedAt, null);
  });
});
