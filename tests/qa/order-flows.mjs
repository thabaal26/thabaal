// Settings › Order steps in a real browser against the QA app (tests/qa/serve.mjs), for a counter / pickup shop:
// Settings has no Default image card and says no delivery charge is added; a cash order is confirmed with "collect it
// at our shop", has no dispatch or address, and "Collected, cash received" records the cash and tells the customer
// it was collected; New order starts with no delivery charge. Puts the QA shop's own order steps back after.
//   node tests/qa/order-flows.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost/.test(S.base) || !/localhost|127\.0\.0\.1/.test(S.dbUrl)) throw new Error("QA only");
const BASE = S.base;
const db = new PrismaClient({ datasources: { db: { url: S.dbUrl } } });
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
async function check(no, name, fn) {
  try {
    results.push({ no, name, pass: true, detail: (await fn()) ?? "" });
  } catch (e) {
    results.push({ no, name, pass: false, detail: String(e.message || e.stack || e).split("\n")[0].slice(0, 300) });
  }
}

const run = Date.now().toString().slice(-6);
const REF = `QA-PICK-${run}`;
const before = await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { orderFlow: true } });
await db.client.update({ where: { id: S.shopId }, data: { orderFlow: "pickup" } });
// The QA shop's number has no token, so sends go through the local provider's demo mode and are logged, not sent.
const setting = await db.setting.findUnique({ where: { id: 1 }, select: { provider: true, wahaUrl: true, wahaApiKey: true } });
if (setting?.wahaUrl || setting?.wahaApiKey) throw new Error("QA setting has a WAHA connection; refusing to send");
await db.setting.update({ where: { id: 1 }, data: { provider: "LOCAL" } });
const cust = await db.customer.create({ data: { clientId: S.shopId, name: "QA Pickup", phone: `9196${run}22`.slice(0, 12) } });
await db.reply.create({ data: { customerId: cust.id, text: "Hi", kind: "text" } }); // inside the 24-hour window
const order = await db.order.create({ data: { ref: REF, clientId: S.shopId, customerId: cust.id, status: "NEW", paymentMethod: "cod", total: 200, items: [{ id: "x", name: "QA Ghee", quantity: 2, price: 100 }] } });
const lastMessage = async () => (await db.message.findFirst({ where: { customerId: cust.id }, orderBy: { createdAt: "desc" } }))?.body ?? "";
const cleanup = async () => {
  await db.paymentEvent.deleteMany({ where: { orderId: order.id } }).catch(() => {});
  await db.order.deleteMany({ where: { customerId: cust.id } });
  await db.message.deleteMany({ where: { customerId: cust.id } });
  await db.reply.deleteMany({ where: { customerId: cust.id } });
  await db.customer.delete({ where: { id: cust.id } });
  await db.client.update({ where: { id: S.shopId }, data: { orderFlow: before.orderFlow } });
  await db.setting.update({ where: { id: 1 }, data: { provider: setting?.provider ?? "META" } });
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const m = await ctx.newPage();
m.on("pageerror", (e) => errors.push(String(e.message)));
m.on("dialog", (d) => d.accept());
const card = () => m.locator("article.card", { hasText: REF });
async function toast(re) {
  await m.locator('[role="status"] > div', { hasText: re }).last().waitFor({ timeout: 15_000 }).catch(() => {});
  return (await m.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ");
}
const openOrder = () => m.goto(`${BASE}/dashboard/orders?q=${encodeURIComponent(REF)}`, { waitUntil: "networkidle" });

await check(1, "Settings: no Default image card; Delivery charge says pickup adds none", async () => {
  await m.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  expect((await m.getByText("Upload default image").count()) === 0 && (await m.locator("#default-picture").count()) === 0, "Default image card still shown");
  expect(await m.locator("#delivery-charge-off").isVisible(), "no pickup note on Delivery charge");
  return "removed; note shown";
});

await check(2, "a cash order: 'Confirm COD order' tells the customer to collect it at the shop, no delivery words", async () => {
  await openOrder();
  await card().getByRole("button", { name: "Confirm COD order" }).click();
  const said = await toast(/sent|Simulated|logged|window|template|can't|isn't/i);
  const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(o.status === "CONFIRMED", "status " + o.status + " · " + said);
  const body = await lastMessage();
  expect(/collect it at our shop/.test(body) && /when you collect it/.test(body), "message: " + body.slice(0, 200));
  expect(!/delivery|on its way|arrives/i.test(body), "delivery words: " + body.slice(0, 200));
  return "confirmed";
});

await check(3, "confirmed: no dispatch and no address on the card; the next step is 'Collected, cash received ₹200'", async () => {
  await openOrder();
  const text = (await card().innerText()).replace(/\s+/g, " ");
  expect(!/Dispatch order|Ship order|Add address|Address needed|Deliver to/.test(text), "card: " + text.slice(0, 300));
  expect(await card().getByRole("button", { name: /Collected, cash received ₹200/ }).isVisible(), "no collected button: " + text.slice(0, 300));
  return "ok";
});

await check(4, "'Collected, cash received': the cash is recorded and the customer is told it was collected", async () => {
  await card().getByRole("button", { name: /Collected, cash received/ }).click();
  await toast(/Cash|recorded/i);
  const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(o.status === "DELIVERED", "status " + o.status);
  expect(Boolean(o.paidAt) && (o.paidAmount ?? 0) >= 200, `paid ${o.paidAmount} at ${o.paidAt}`);
  const body = await lastMessage();
  expect(/has been collected/.test(body), "message: " + body.slice(0, 200));
  return "₹200 recorded";
});

await check(5, "New order starts with no delivery charge for a pickup shop", async () => {
  await m.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
  await m.locator('button[aria-haspopup="dialog"]', { hasText: "New order" }).click();
  await m.fill("#nop", `98${run}77`.slice(0, 10));
  await m.fill("#noc", "QA Walk-in");
  await m.selectOption("#nos", "custom");
  await m.fill("#noc2", "QA Jar");
  await m.fill("#nop2", "100");
  await m.click("#noadd");
  await m.locator("#nosf").waitFor({ timeout: 10_000 });
  expect((await m.inputValue("#nosf")) === "0", "charge " + (await m.inputValue("#nosf")));
  return "₹0";
});

await check(6, "no browser errors", async () => {
  expect(!errors.length, errors.join(" | ").slice(0, 300));
  return "none";
});

await cleanup();
await browser.close();
await db.$disconnect();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
