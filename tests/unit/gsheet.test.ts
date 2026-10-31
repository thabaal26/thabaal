// Connect Google Sheets and the live sync, against an in-memory Google Sheet: Google is never called. Checks the
// tabs and their rows as a shop owner would read them, that rows are updated in place (never duplicated), that the
// logs only grow, that a sync with nothing new writes nothing, and what happens when Google access is removed.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { readState, signState } from "../../src/lib/gsheet/google";
import { addressId, customerRow, itemRows, phoneText, sheetDate, summaryGrid, TABS } from "../../src/lib/gsheet/layout";
import { connectSheet, logSheetActivity, sheetLinkView, syncClientSheet } from "../../src/lib/gsheet/sync";

process.env.AUTH_SECRET ||= "unit-auth-secret-0123456789";
process.env.GOOGLE_CLIENT_ID ||= "unit-client-id";
process.env.GOOGLE_CLIENT_SECRET ||= "unit-client-secret";

/* ---------- a tiny Google Sheet in memory ---------- */

type Grid = (string | number)[][];
const book = new Map<string, Grid>();
let tokenFails = false;
let calls = 0;
const colIndex = (l: string) => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function parse(range: string) {
  const m = /^'(.+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d*))?$/.exec(range);
  if (!m) throw new Error(`bad range ${range}`);
  return { title: m[1], col: colIndex(m[2]), row: Number(m[3]) - 1 };
}
const lastRow = (g: Grid) => {
  let n = g.length;
  while (n > 0 && !(g[n - 1] ?? []).some((v) => v !== "" && v != null)) n--;
  return n;
};
async function fakeGoogle(input: string | URL | Request, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  const body = init?.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null;
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
  calls++;
  if (url.startsWith("https://oauth2.googleapis.com/token"))
    return tokenFails ? new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) : ok({ access_token: "fake-access", expires_in: 3600 });
  if (url.startsWith("https://oauth2.googleapis.com/revoke")) return ok({});
  // Access removed in Google: every Sheets call is refused.
  if (tokenFails) return new Response(JSON.stringify({ error: { message: "Request had invalid authentication credentials." } }), { status: 401 });
  const u = new URL(url);
  const path = decodeURIComponent(u.pathname.replace("/v4/spreadsheets", ""));
  if (path === "" && init?.method === "POST") {
    for (const s of body.sheets) book.set(s.properties.title, []);
    return ok({ spreadsheetId: "fake-sheet", sheets: body.sheets.map((s: { properties: { title: string } }, i: number) => ({ properties: { sheetId: 100 + i, title: s.properties.title } })) });
  }
  if (path.endsWith(":batchUpdate") && !path.includes("/values")) return ok({ replies: [] });
  if (path === "/fake-sheet") return ok({ spreadsheetId: "fake-sheet" });
  if (path.endsWith("/values:batchGet")) {
    const ranges = u.searchParams.getAll("ranges");
    return ok({ valueRanges: ranges.map((r) => ({ values: [(book.get(parse(r).title) ?? []).slice(1, lastRow(book.get(parse(r).title) ?? [])).map((row) => String(row[0] ?? ""))] })) });
  }
  if (path.endsWith("/values:batchUpdate")) {
    for (const d of body.data) {
      const { title, col, row } = parse(d.range);
      const g = book.get(title)!;
      d.values.forEach((vals: (string | number)[], i: number) => {
        g[row + i] ??= [];
        vals.forEach((v, j) => (g[row + i][col + j] = v));
      });
    }
    return ok({});
  }
  if (path.includes(":append")) {
    const { title } = parse(path.split("/values/")[1].replace(":append", ""));
    const g = book.get(title)!;
    let at = lastRow(g);
    for (const r of body.values) g[at++] = r;
    return ok({});
  }
  if (path.endsWith("/values:batchClear")) {
    for (const r of body.ranges) {
      const { title, row } = parse(r);
      const g = book.get(title)!;
      g.length = Math.min(g.length, row);
    }
    return ok({});
  }
  return new Response(JSON.stringify({ error: { message: `unexpected ${init?.method} ${path}` } }), { status: 500 });
}
const rows = (title: string) => (book.get(title) ?? []).slice(1, lastRow(book.get(title) ?? []));
const col = (title: string, name: string) => TABS.find((t) => t.title === title)!.cols.findIndex((c) => c.h === name);

/* ---------- the shop ---------- */

describe("Google Sheets: connect and live sync", () => {
  let clientId: string;
  let customerId: string;
  const realFetch = globalThis.fetch;

  before(async () => {
    globalThis.fetch = fakeGoogle as typeof fetch;
    const c = await db.client.create({ data: { name: "QA Sheet Shop", orderPrefix: "GS", quietFrom: null, quietTo: null } });
    clientId = c.id;
  });
  beforeEach(async () => {
    book.clear();
    tokenFails = false;
    await db.sheetLog.deleteMany({ where: { clientId } });
    await db.sheetLink.deleteMany({ where: { clientId } });
    await db.paymentEvent.deleteMany({ where: { clientId } });
    await db.message.deleteMany({ where: { customer: { clientId } } });
    await db.reply.deleteMany({ where: { customer: { clientId } } });
    await db.order.deleteMany({ where: { clientId } });
    await db.customer.deleteMany({ where: { clientId } });
    const cu = await db.customer.create({ data: { clientId, name: "Meena R", phone: "919990008888", location: "Anna Nagar", locationRaw: "12, 3rd Street, Anna Nagar, Madurai - 625020", tags: ["vip"] } });
    customerId = cu.id;
    await connectSheet({ clientId, refreshToken: "fake-refresh", accessToken: "fake-access", expiresIn: 3600, email: "owner@example.com", by: "QA" });
  });
  after(async () => {
    globalThis.fetch = realFetch;
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
  });

  test("connecting makes one sheet with the eight tabs, headings in place, and the token stored encrypted or at least never in the view", async () => {
    assert.deepEqual([...book.keys()], ["Summary", "Customers", "Addresses", "Orders", "Order Items", "Payments", "Chats", "Activity"]);
    assert.equal(book.get("Customers")![0][0], "Phone");
    assert.equal(book.get("Orders")![0][0], "Order no");
    const view = await sheetLinkView(clientId);
    assert.equal(view?.email, "owner@example.com");
    assert.ok(!JSON.stringify(view).includes("fake-refresh"));
  });

  test("first sync fills every tab from what's in Thabaal", async () => {
    const o = await db.order.create({
      data: { ref: "GS-1001", clientId, customerId, waMessageId: "wamid.gs1", status: "CONFIRMED", paymentMethod: "cod", total: 560, items: [{ id: "oil-1l", name: "Coconut oil 1L", quantity: 1, price: 500 }, { id: "salt", name: "Rock salt", quantity: 2, price: 30 }], note: "12, 3rd Street, Anna Nagar, Madurai - 625020", addressConfirmedAt: new Date() },
    });
    await db.reply.create({ data: { customerId, text: "Hi", kind: "text", receivedAt: new Date(Date.now() - 60_000) } });
    await db.message.create({ data: { customerId, templateName: "Catalogue", body: "Hi Meena! Welcome to QA Sheet Shop", status: "SENT" } });
    await db.paymentEvent.create({ data: { clientId, orderId: o.id, source: "staff", status: "paid", amount: 100, utr: "412345678901", note: "Part payment" } });
    await logSheetActivity(clientId, { event: "Order placed", orderRef: "GS-1001", phone: "919990008888", customer: "Meena R", by: "Customer" });

    const r = await syncClientSheet(clientId);
    assert.equal(r.ran, true);

    const cust = rows("Customers");
    assert.equal(cust.length, 1);
    assert.equal(cust[0][0], "+91 99900 08888");
    assert.equal(cust[0][col("Customers", "Name")], "Meena R");
    assert.equal(cust[0][col("Customers", "Orders")], 1);
    assert.equal(cust[0][col("Customers", "Total spent")], 560);
    assert.equal(cust[0][col("Customers", "Messages")], "Allowed");

    const ord = rows("Orders");
    assert.equal(ord.length, 1);
    assert.equal(ord[0][0], "GS-1001");
    assert.match(String(ord[0][col("Orders", "Items")]), /1 × Coconut oil 1L, 2 × Rock salt/);
    assert.equal(ord[0][col("Orders", "Payment method")], "Cash on delivery");
    assert.equal(rows("Order Items").length, 2);
    assert.equal(rows("Order Items")[1][col("Order Items", "Line total")], 60);

    assert.equal(rows("Addresses").length, 1);
    assert.equal(rows("Addresses")[0][col("Addresses", "Pincode")], "625020");

    const chats = rows("Chats");
    assert.equal(chats.length, 2);
    assert.equal(chats[0][col("Chats", "Direction")], "Customer → Shop"); // oldest first
    assert.equal(chats[1][col("Chats", "By")], "Auto: Catalogue");

    assert.equal(rows("Payments").length, 1);
    assert.equal(rows("Payments")[0][col("Payments", "Reference")], "412345678901");
    assert.equal(rows("Activity").length, 1);
    assert.equal(await db.sheetLog.count({ where: { clientId } }), 0); // sent lines are cleared

    assert.match(String(book.get("Summary")![0][0]), /QA Sheet Shop · live sheet/);
  });

  test("a change updates the same row; new things are added below; a sync with nothing new writes nothing", async () => {
    const o = await db.order.create({ data: { ref: "GS-1002", clientId, customerId, status: "NEW", total: 500, items: [{ id: "oil", name: "Coconut oil 1L", quantity: 1, price: 500 }, { id: "x", name: "Extra", quantity: 1, price: 0 }] } });
    await syncClientSheet(clientId);
    assert.equal(rows("Orders").length, 1);
    assert.equal(rows("Order Items").length, 2);

    await db.order.update({ where: { id: o.id }, data: { status: "DELIVERED", deliveredAt: new Date(), paidAt: new Date(), paymentMethod: "upi", items: [{ id: "oil", name: "Coconut oil 1L", quantity: 1, price: 500 }] } });
    const other = await db.customer.create({ data: { clientId, name: "Ravi", phone: "919990007777" } });
    await db.reply.create({ data: { customerId: other.id, text: "price list?", kind: "text" } });
    await syncClientSheet(clientId);

    const ord = rows("Orders");
    assert.equal(ord.length, 1, "the order was updated in place, not added again");
    assert.equal(ord[0][col("Orders", "Payment status")], "Paid");
    assert.match(String(ord[0][col("Orders", "Order status")]), /Delivered/);
    const lines = rows("Order Items");
    assert.equal(lines.length, 2);
    assert.equal(lines[1][col("Order Items", "Product")], "(removed from the order)");
    assert.equal(rows("Customers").length, 2);
    assert.equal(rows("Chats").length, 1);

    const before = calls;
    const sizes = [...book.values()].map((g) => lastRow(g));
    await syncClientSheet(clientId);
    assert.deepEqual([...book.values()].map((g) => lastRow(g)), sizes, "nothing new: no rows added");
    assert.ok(calls - before <= 2, "nothing new: hardly any calls to Google");
  });

  test("only one sync runs at a time for a business", async () => {
    await db.reply.create({ data: { customerId, text: "hello", kind: "text" } });
    const [a, b] = await Promise.all([syncClientSheet(clientId), syncClientSheet(clientId)]);
    assert.equal([a.ran, b.ran].filter(Boolean).length, 1);
    await syncClientSheet(clientId); // the one that was turned away left it marked to run again
    assert.equal(rows("Chats").length, 1);
  });

  test("Google access removed: the sync stops with a plain reason, and nothing is lost for later", async () => {
    tokenFails = true;
    await db.reply.create({ data: { customerId, text: "anyone there?", kind: "text" } });
    await syncClientSheet(clientId);
    const view = await sheetLinkView(clientId);
    assert.equal(view?.status, "error");
    assert.match(view?.lastError ?? "", /Connect Google Sheets again/);
    assert.equal(rows("Chats").length, 0);
  });

  test("activity is only kept while a sheet is connected", async () => {
    await db.sheetLink.update({ where: { clientId }, data: { status: "off" } });
    assert.equal(await logSheetActivity(clientId, { event: "Order placed" }), false);
    assert.equal(await db.sheetLog.count({ where: { clientId } }), 0);
  });
});

describe("Google Sheets: the sign-in note and the sheet's wording", () => {
  test("the sign-in note can't be forged, reused for another person, or used late", () => {
    const s = signState({ clientId: "c1", userId: "u1" });
    assert.deepEqual(readState(s), { clientId: "c1", userId: "u1" });
    const [body, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), c: "c2" })).toString("base64url");
    assert.equal(readState(`${forged}.${sig}`), null);
    assert.equal(readState(s, Date.now() + 16 * 60_000), null);
    assert.equal(readState("nonsense"), null);
  });

  test("dates are real sheet dates in India time; phones read as phones", () => {
    assert.equal(sheetDate(new Date("2026-10-31T18:30:00Z")), 46327); // midnight 1 Nov 2026 IST
    assert.equal(phoneText("919876543210"), "+91 98765 43210");
    assert.equal(phoneText("14155550100"), "+14155550100");
  });

  test("a customer known only by number gets '-' for a name; tags hide the source tag", () => {
    const r = customerRow({ phone: "919876543210", name: "+91 98765 43210", area: null, address: null, mapUrl: null, orders: 0, spent: 0, firstOrder: null, lastOrder: null, lastMessage: null, since: new Date(), tags: ["src:ad", "vip"], cameFrom: "WhatsApp ad", optedOut: true, unreachable: false });
    assert.equal(r[1], "-");
    assert.equal(r[12], "vip");
    assert.equal(r[14], "Opted out");
    assert.equal(r[7], null); // no average with no orders
  });

  test("the same address always gets the same id; a different one, a different id", () => {
    assert.equal(addressId("91999", "12, North St, Anna Nagar"), addressId("91999", "12 north st anna nagar"));
    assert.notEqual(addressId("91999", "12, North St"), addressId("91999", "14, North St"));
  });

  test("order lines number from 1 and removed lines are marked", () => {
    const x = { ref: "GS-1", createdAt: new Date(), updatedAt: new Date(), customer: "Meena", phone: "91999", items: [{ name: "Oil", quantity: 2, price: 100 }], total: 200, paid: 0, due: 200, method: "-", payStatus: "Not paid", status: "Order received", address: null, mapUrl: null, deliveredAt: null, source: "WhatsApp cart" };
    const lines = itemRows(x, 3);
    assert.deepEqual(lines.map((l) => l.key), ["GS-1 #1", "GS-1 #2", "GS-1 #3"]);
    assert.equal(lines[0].row[9], 200);
    assert.equal(lines[2].row[5], "(removed from the order)");
  });

  test("the summary has the shop's name, its figures in rupees, and lists that say so when empty", () => {
    const g = summaryGrid({
      shop: "Hubbath",
      updated: new Date(),
      today: { orders: 3, sales: 1500, newCustomers: 1, chats: 12 },
      month: { label: "November 2026", orders: 40, sales: 52000, online: 30000, cod: 22000, newCustomers: 9 },
      waiting: { carts: 2, cartValue: 900, codToCollect: 1200, codOrders: 2, toDispatch: 5 },
      allTime: { customers: 120, orders: 300, sales: 410000 },
      topProducts: [],
      topCustomers: [],
    });
    assert.equal(g[0][0], "Hubbath · live sheet");
    assert.ok(g.some((r) => r[0] === "Sales" && r[1] === "₹52,000"));
    assert.ok(g.some((r) => r[3] === "No sales yet this month"));
    assert.ok(g.every((r) => r.length === 6));
  });
});
