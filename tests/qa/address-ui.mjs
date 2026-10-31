// Delivery address step, portal side, in a real browser against the QA app (tests/qa/serve.mjs):
// the "Ask for the delivery address" switch in Payment settings, and an order waiting for its address on Orders.
//   node tests/qa/address-ui.mjs
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
    results.push({ no, name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 300) });
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message)));
const row = () => p.locator(".row", { hasText: "Ask for the delivery address" });

await check(1, "Payment settings: the switch shows, on by default", async () => {
  await p.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  await row().waitFor({ timeout: 15000 });
  const sw = row().getByRole("switch");
  expect((await sw.getAttribute("aria-checked")) === "true", "not on by default");
  await row().scrollIntoViewIfNeeded();
  await row().screenshot({ path: ".git/qa-address-setting.png" });
  return "on";
});

await check(2, "turning it off and on saves", async () => {
  const sw = row().getByRole("switch");
  await sw.click();
  await p.getByText(/Delivery address off/).first().waitFor({ timeout: 15000 });
  let c = await db.client.findUniqueOrThrow({ where: { id: S.shopId } });
  expect(c.paySettings?.askAddress === false, "not saved off");
  await row().getByRole("switch").click();
  await p.getByText(/Delivery address on/).first().waitFor({ timeout: 15000 });
  c = await db.client.findUniqueOrThrow({ where: { id: S.shopId } });
  expect(c.paySettings?.askAddress === true, "not saved on");
  return "off → on saved";
});

let orderId = null;
await check(3, "Orders: an order waiting for its address says so, with Add it myself", async () => {
  const o = await db.order.findFirst({ where: { clientId: S.shopId, status: "NEW", paidAt: null }, orderBy: { createdAt: "desc" } });
  expect(o, "no NEW order in the QA shop");
  orderId = o.id;
  await db.order.update({ where: { id: o.id }, data: { addressAskedAt: new Date(), addressConfirmedAt: null } });
  await p.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
  const line = p.getByText("Waiting for the customer's address on WhatsApp").first();
  await line.waitFor({ timeout: 15000 });
  const card = p.locator("[role=status]", { hasText: "Waiting for the customer's address" }).first();
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: ".git/qa-address-waiting.png" });
  return `order ${o.ref ?? o.number}`;
});

await check(4, "once given: Deliver to with a Map link", async () => {
  await db.order.update({ where: { id: orderId }, data: { addressConfirmedAt: new Date(), note: "12, 3rd Street, Anna Nagar, Madurai - 625020", mapUrl: "https://maps.google.com/?q=9.93,78.12" } });
  await p.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
  const deliver = p.locator("p", { hasText: "12, 3rd Street, Anna Nagar" }).first();
  await deliver.waitFor({ timeout: 15000 });
  expect((await deliver.getByRole("link", { name: "Map" }).getAttribute("href")) === "https://maps.google.com/?q=9.93,78.12", "map link");
  await deliver.scrollIntoViewIfNeeded();
  await deliver.screenshot({ path: ".git/qa-address-given.png" });
  return "Map link ok";
});

await check(5, "phone width: the waiting line fits", async () => {
  await db.order.update({ where: { id: orderId }, data: { addressConfirmedAt: null } });
  const m = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await m.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const mp = await m.newPage();
  await mp.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
  const line = mp.locator("[role=status]", { hasText: "Waiting for the customer's address" }).first();
  await line.waitFor({ timeout: 15000 });
  await line.scrollIntoViewIfNeeded();
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await line.screenshot({ path: ".git/qa-address-waiting-phone.png" });
  await m.close();
  expect(over <= 1, `sideways scroll ${over}px`);
  return "fits at 360px";
});

await check(6, "no page errors", async () => {
  expect(errors.length === 0, errors.join(" | "));
});

if (orderId) await db.order.update({ where: { id: orderId }, data: { addressAskedAt: null, addressConfirmedAt: null, mapUrl: null } }).catch(() => {});
await browser.close();
await db.$disconnect();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.no}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
