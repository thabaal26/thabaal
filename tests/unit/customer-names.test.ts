// A customer's name fills in by itself (lib/customer-name.ts): from their WhatsApp profile name on any message, the
// name in the address form, or a "Name: …" line in an address they type; older customers get theirs from what they
// already sent. Only a name that is still their number is replaced: a real name (or one staff typed) never is.
// Meta is never called: fetch is a fake.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { backfillCustomerNames, cleanPersonName, fillCustomerName, isPlaceholderName, nameFromText } from "../../src/lib/customer-name";
import { db } from "../../src/lib/db";
import { handleAddressReply, startAddressStep } from "../../src/lib/delivery-address";
import { recordReply } from "../../src/lib/replies";

describe("customer names: what counts as a name", () => {
  test("1. a number (with or without +, spaces) is not a name yet; anything with letters is", () => {
    for (const n of ["", "+919876543210", "919876543210", "+91 98765 43210", null]) assert.equal(isPlaceholderName(n), true, String(n));
    for (const n of ["Meena", "R", "மீனா"]) assert.equal(isPlaceholderName(n), false, n);
  });

  test("2. WhatsApp names are cleaned: emoji and symbols go, junk is not a name, Tamil works", () => {
    assert.equal(cleanPersonName("Meena R 🌸"), "Meena R");
    assert.equal(cleanPersonName("  Mom ❤️ "), "Mom");
    assert.equal(cleanPersonName("மீனா ராஜ்"), "மீனா ராஜ்");
    assert.equal(cleanPersonName("Dr. S. Ravi"), "Dr. S. Ravi");
    for (const junk of ["~", "🌸🌸", ".", "9876543210", "A", "", null]) assert.equal(cleanPersonName(junk), null, String(junk));
    assert.equal(cleanPersonName("x".repeat(90))?.length, 60);
  });

  test("3. a typed address names someone only with a label", () => {
    assert.equal(nameFromText("Name: Ravi Kumar\nNo 12, 3rd Street, Madurai 625020"), "Ravi Kumar");
    assert.equal(nameFromText("No 12, 3rd Street, name - Selvi, Madurai"), "Selvi");
    assert.equal(nameFromText("பெயர்: மீனா\n12, அண்ணா நகர்"), "மீனா");
    assert.equal(nameFromText("No 12, 3rd Street, Anna Nagar, Madurai 625020"), null);
    assert.equal(nameFromText("what is the name of the oil?"), null);
  });
});

type Sent = { url: string };

describe("customer names: filled in by themselves", () => {
  let clientId: string;
  const sent: Sent[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  const PNID = `qa-names-${Date.now()}`;
  const phone = () => `9199900${String(Date.now()).slice(-4)}${++n}`.slice(0, 12);
  const name = async (p: string) => (await db.customer.findUniqueOrThrow({ where: { clientId_phone: { clientId, phone: p } } })).name;
  const hi = (p: string, profileName: string | null) => recordReply({ phone: p, text: "Hi", kind: "text", phoneNumberId: PNID, profileName });

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      sent.push({ url: String(url) });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.names${++n}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const client = await db.client.create({ data: { name: `QA Names Shop ${Date.now()}`, orderPrefix: "QN", paymentConfig: "qa-upi", paySettings: { whatsappPay: true, codOn: true, askAddress: true } } });
    clientId = client.id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: PNID, businessAccountId: "qa-names-waba", token: "qa-fake-token", isDefault: true } });
  });

  beforeEach(() => {
    sent.length = 0;
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

  test("4. a new number with a real WhatsApp name is saved with that name", async () => {
    const p = phone();
    await hi(p, "Meena R 🌸");
    assert.equal(await name(p), "Meena R");
  });

  test("5. a new number with a junk WhatsApp name (or none) shows its number until a name comes", async () => {
    const p = phone();
    await hi(p, "~");
    assert.equal(await name(p), `+${p}`);
    const q = phone();
    await hi(q, null);
    assert.equal(await name(q), `+${q}`);
  });

  test("6. an older customer known only by number gets their WhatsApp name on their next message", async () => {
    const p = phone();
    await db.customer.create({ data: { clientId, phone: p, name: `+${p}` } });
    await hi(p, "Kavitha S");
    assert.equal(await name(p), "Kavitha S");
  });

  test("7. a real name is never replaced: not by WhatsApp's name, not by a form name", async () => {
    const p = phone();
    const c = await db.customer.create({ data: { clientId, phone: p, name: "Anitha (staff typed)" } });
    await hi(p, "Different Name");
    assert.equal(await name(p), "Anitha (staff typed)");
    assert.equal(await fillCustomerName(c.id, "Her Mother"), false);
    assert.equal(await name(p), "Anitha (staff typed)");
  });

  test("8. a number-only customer types an address with 'Name: …': that name is saved", async () => {
    const p = phone();
    const c = await db.customer.create({ data: { clientId, phone: p, name: `+${p}` } });
    await db.reply.create({ data: { customerId: c.id, text: "Cart", kind: "order" } });
    const o = await db.order.create({ data: { ref: `QN-${n}`, clientId, customerId: c.id, status: "NEW", total: 560, items: [{ id: "oil", name: "Coconut oil", quantity: 1, price: 500 }] } });
    assert.equal(await startAddressStep(o.id), "asked");
    assert.equal(await handleAddressReply({ id: c.id }, { type: "text" }, "Name: Ravi Kumar\nNo 12, 3rd Street, Anna Nagar, Madurai 625020"), true);
    assert.equal(await name(p), "Ravi Kumar");
    assert.ok((await db.order.findUniqueOrThrow({ where: { id: o.id } })).addressConfirmedAt);
  });

  test("9. the name in the WhatsApp address form names a number-only customer", async () => {
    const p = phone();
    const c = await db.customer.create({ data: { clientId, phone: p, name: `+${p}` } });
    await db.reply.create({ data: { customerId: c.id, text: "Cart", kind: "order" } });
    const o = await db.order.create({ data: { ref: `QN-${n}`, clientId, customerId: c.id, status: "NEW", total: 560, items: [{ id: "oil", name: "Coconut oil", quantity: 1, price: 500 }] } });
    await startAddressStep(o.id);
    const values = { name: "Lakshmi N", phone_number: `+${p}`, in_pin_code: "625020", house_number: "12", address: "3rd Street", landmark_area: "Anna Nagar", city: "Madurai", state: "Tamil Nadu" };
    await handleAddressReply({ id: c.id }, { type: "interactive", interactive: { type: "nfm_reply", nfm_reply: { name: "address_message", response_json: JSON.stringify({ values }) } } }, "x");
    assert.equal(await name(p), "Lakshmi N");
  });

  test("10. older number-only customers get the name they already sent: form first, else a 'Name:' message", async () => {
    const a = phone();
    const ca = await db.customer.create({ data: { clientId, phone: a, name: `+${a}`, deliveryAddress: { name: "Selvi P", address: "No 4", savedAt: new Date().toISOString() } } });
    const b = phone();
    const cb = await db.customer.create({ data: { clientId, phone: b, name: `+${b}` } });
    await db.reply.create({ data: { customerId: cb.id, text: "name: Gopal R, 22 Temple Street, Sellur", kind: "text" } });
    const c = phone();
    await db.customer.create({ data: { clientId, phone: c, name: "Real Name", deliveryAddress: { name: "Someone Else" } } });
    const d = phone();
    await db.customer.create({ data: { clientId, phone: d, name: `+${d}`, deliveryAddress: { name: "🌸" } } });
    await backfillCustomerNames();
    assert.equal(await name(a), "Selvi P");
    assert.equal(await name(b), "Gopal R");
    assert.equal(await name(c), "Real Name");
    assert.equal(await name(d), `+${d}`, "nothing usable: stays the number");
    assert.ok(ca && cb);
  });
});
