// Loyalty points at checkout in a real browser against the QA app (tests/qa/serve.mjs): By hand, an unpaid order shows
// what the customer can use with a Use button, and Remove takes it back; Payments › Settings can turn using points off
// (the Use button goes, points still count) and back on, and switch Automatic / By hand. Puts the QA shop back after.
//   node tests/qa/points-checkout.mjs
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
const REF = `QA-PTS-${run}`;
const before = await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { loyaltyRedeemOn: true, loyaltyAutoRedeem: true } });
await db.client.update({ where: { id: S.shopId }, data: { loyaltyRedeemOn: true, loyaltyAutoRedeem: false } });
const cust = await db.customer.create({ data: { clientId: S.shopId, name: "QA Points Buyer", phone: `9194${run}33`.slice(0, 12) } });
// Two delivered, paid orders of ₹5,000: enough points for a discount by any of the shop's rules.
for (const n of [1, 2])
  await db.order.create({ data: { ref: `${REF}-P${n}`, clientId: S.shopId, customerId: cust.id, status: "DELIVERED", total: 5000, paidAt: new Date(), paidAmount: 5000, items: [{ id: "x", name: "Oil tin", quantity: 1, price: 4940 }] } });
const order = await db.order.create({ data: { ref: REF, clientId: S.shopId, customerId: cust.id, status: "NEW", total: 1060, items: [{ id: "g", name: "QA Ghee", quantity: 1, price: 1000 }] } });
const fresh = () => db.order.findUniqueOrThrow({ where: { id: order.id } });
const shop = () => db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { loyaltyRedeemOn: true, loyaltyAutoRedeem: true } });
const cleanup = async () => {
  await db.order.deleteMany({ where: { customerId: cust.id } });
  await db.customer.delete({ where: { id: cust.id } });
  await db.client.update({ where: { id: S.shopId }, data: before });
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const m = await ctx.newPage();
m.on("pageerror", (e) => errors.push(String(e.message)));
const card = () => m.locator("article.card", { hasText: REF }).first();
const openOrder = () => m.goto(`${BASE}/dashboard/orders?q=${encodeURIComponent(REF)}`, { waitUntil: "networkidle" });
async function toast(re) {
  await m.locator('[role="status"] > div', { hasText: re }).last().waitFor({ timeout: 15_000 }).catch(() => {});
  return (await m.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ");
}
const waitFor = async (fn, ms = 10_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
};

await check(1, "By hand: the unpaid order shows what the customer can use, with a Use button", async () => {
  await openOrder();
  const row = card().locator(".points-row");
  await row.waitFor({ timeout: 15_000 });
  const t = (await row.innerText()).replace(/\s+/g, " ");
  // The amount follows the QA shop's own earning rules: whatever it is, it's offered in ₹25 steps with a Use button.
  expect(/Can use up to ₹\d+ in loyalty points \(\d+ pts\)/.test(t), "row: " + t);
  expect(await row.getByRole("button", { name: /^Use ₹\d+$/ }).isVisible(), "no Use button");
  return t.slice(0, 80);
});

await check(2, "Use ₹50 (picked in the dropdown): the total drops and the card shows the points used", async () => {
  const row = card().locator(".points-row");
  await row.locator("select").selectOption("50");
  await row.getByRole("button", { name: /^Use ₹50$/ }).click();
  await toast(/Used 100 points/);
  const o = await waitFor(async () => ((await fresh()).pointsRedeemed === 100 ? fresh() : null));
  expect(o && o.total === 1010, `total ${o?.total}, points ${o?.pointsRedeemed}`);
  await openOrder();
  const t = (await card().locator(".points-row").innerText()).replace(/\s+/g, " ");
  expect(/Loyalty points used: 100 pts · −₹50/.test(t), "row: " + t);
  return "₹1,010";
});

await check(3, "Remove points: the points come back and the total is as before", async () => {
  await card().locator(".points-row").getByRole("button", { name: "Remove points" }).click();
  await toast(/Points removed/);
  const o = await waitFor(async () => ((await fresh()).pointsRedeemed === 0 ? fresh() : null));
  expect(o && o.total === 1060, `total ${o?.total}`);
  return "₹1,060";
});

await check(4, "Payments › Settings: turning 'Customers can use their points' off hides Automatic / By hand and says points still add up", async () => {
  await m.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  const box = m.locator("#points-at-checkout");
  await box.scrollIntoViewIfNeeded();
  await box.getByRole("switch", { name: "Customers can use their points" }).click();
  await toast(/Using points is off/);
  expect((await waitFor(async () => (await shop()).loyaltyRedeemOn === false)) === true, "still on");
  const t = (await box.innerText()).replace(/\s+/g, " ");
  expect(/points still add up/.test(t) && !(await box.getByRole("radio", { name: "Automatic" }).count()), "card: " + t.slice(0, 200));
  return "off";
});

await check(5, "with it off, the order has no Use button", async () => {
  await openOrder();
  await card().waitFor({ timeout: 15_000 });
  expect((await card().locator(".points-row").count()) === 0, "points row still shown");
  return "hidden";
});

await check(6, "back on, then Automatic: saved", async () => {
  await m.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  const box = m.locator("#points-at-checkout");
  await box.scrollIntoViewIfNeeded();
  await box.getByRole("switch", { name: "Customers can use their points" }).click();
  await toast(/can use their loyalty points again/);
  await box.getByRole("radio", { name: "Automatic" }).click();
  await toast(/Automatic points on/);
  const s = await waitFor(async () => {
    const v = await shop();
    return v.loyaltyRedeemOn && v.loyaltyAutoRedeem ? v : null;
  });
  expect(Boolean(s), "not saved: " + JSON.stringify(await shop()));
  return "on, automatic";
});

await check(7, "no browser errors", async () => {
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
