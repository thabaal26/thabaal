// Settings › Delivery charge in a real browser against the QA app (tests/qa/serve.mjs): the owner picks Free delivery,
// the New order form then starts at ₹0 and the saved order has no charge; the owner sets ₹45 and the form starts at
// ₹45; one order's charge can still be changed in the form; staff see the setting but can't change it. Puts the QA
// shop's own setting back after.
//   node tests/qa/delivery-fee.mjs
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
const PHONE = `98${run}55`.slice(0, 10);
const saved = (await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { paySettings: true } })).paySettings;
const feeNow = async () => {
  const c = await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { paySettings: true } });
  return c.paySettings?.deliveryFee;
};
const cleanup = async () => {
  const cust = await db.customer.findMany({ where: { clientId: S.shopId, phone: { contains: PHONE } }, select: { id: true } });
  await db.order.deleteMany({ where: { customerId: { in: cust.map((c) => c.id) } } });
  await db.customer.deleteMany({ where: { id: { in: cust.map((c) => c.id) } } });
  await db.client.update({ where: { id: S.shopId }, data: { paySettings: saved ?? undefined } });
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
async function as(token) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addCookies([{ name: "wp_session", value: token, url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e.message)));
  return p;
}
const m = await as(S.tokens.manager);
const card = () => m.locator("#delivery-charge");
async function toast(p, re) {
  await p.locator('[role="status"] > div', { hasText: re }).last().waitFor({ timeout: 15_000 }).catch(() => {});
  return (await p.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ");
}
async function openNewOrder() {
  await m.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
  await m.locator('button[aria-haspopup="dialog"]', { hasText: "New order" }).click();
  await m.fill("#nop", PHONE);
  await m.fill("#noc", "QA Delivery");
  await m.selectOption("#nos", "custom");
  await m.fill("#noc2", "QA Jar");
  await m.fill("#nop2", "100");
  await m.click("#noadd");
  await m.locator("#nosf").waitFor({ timeout: 10_000 });
}

await check(1, "Settings shows the Delivery charge card with the shop's charge", async () => {
  await m.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await card().waitFor({ timeout: 15_000 });
  const fee = (await feeNow()) ?? 60;
  expect((await m.inputValue("#delivery-fee-amount")) === (fee ? String(fee) : ""), "amount box");
  return `₹${fee}`;
});

await check(2, "choose Free delivery and save: stored as 0", async () => {
  await card().getByText("Free delivery", { exact: true }).click();
  await card().getByRole("button", { name: "Save delivery charge" }).click();
  expect(/Free delivery: new orders get no delivery charge/.test(await toast(m, /Free delivery/)), "no toast");
  expect((await feeNow()) === 0, "stored " + (await feeNow()));
  return "free";
});

await check(3, "New order starts at ₹0 delivery and saves without a charge", async () => {
  await openNewOrder();
  expect((await m.inputValue("#nosf")) === "0", "form charge " + (await m.inputValue("#nosf")));
  expect(/₹100\b/.test(await m.locator("#notv").innerText()), "total " + (await m.locator("#notv").innerText()));
  await m.getByRole("button", { name: "Save order" }).click();
  await toast(m, /order|Order/);
  const o = await db.order.findFirst({ where: { clientId: S.shopId, customer: { phone: { contains: PHONE } } }, orderBy: { createdAt: "desc" } });
  expect(o && o.total === 100, "saved total " + o?.total);
  return "₹100";
});

await check(4, "set a ₹45 charge: saved, and a new order starts at ₹45", async () => {
  await m.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await m.fill("#delivery-fee-amount", "45");
  await card().getByRole("button", { name: "Save delivery charge" }).click();
  expect(/₹45 delivery charge/.test(await toast(m, /₹45/)), "no toast");
  expect((await feeNow()) === 45, "stored " + (await feeNow()));
  await openNewOrder();
  expect((await m.inputValue("#nosf")) === "45", "form charge " + (await m.inputValue("#nosf")));
  expect(/₹145\b/.test(await m.locator("#notv").innerText()), "total " + (await m.locator("#notv").innerText()));
  return "₹145";
});

await check(5, "one order's charge changed in the form is what that order saves", async () => {
  await m.fill("#nosf", "20");
  expect(/₹120\b/.test(await m.locator("#notv").innerText()), "total " + (await m.locator("#notv").innerText()));
  await m.getByRole("button", { name: "Save order" }).click();
  await toast(m, /order|Order/);
  const o = await db.order.findFirst({ where: { clientId: S.shopId, customer: { phone: { contains: PHONE } } }, orderBy: { createdAt: "desc" } });
  expect(o && o.total === 120, "saved total " + o?.total);
  expect((await feeNow()) === 45, "the setting stayed ₹45");
  return "₹120, setting still ₹45";
});

await check(6, "an amount of 0 or nothing is refused (choose Free delivery instead)", async () => {
  await m.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await m.fill("#delivery-fee-amount", "0");
  await card().getByRole("button", { name: "Save delivery charge" }).click();
  expect(/enter an amount from ₹1/.test(await toast(m, /enter an amount/)), "no refusal");
  expect((await feeNow()) === 45, "changed to " + (await feeNow()));
  return "refused";
});

await check(7, "staff see the charge but can't change it", async () => {
  const st = await as(S.tokens.staff);
  await st.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  const has = await st.locator("#delivery-charge").count();
  const btn = await st.getByRole("button", { name: "Save delivery charge" }).count();
  const off = has ? await st.locator("#delivery-fee-amount").isDisabled() : true;
  await st.context().close();
  expect(btn === 0 && off, `staff can change it (button ${btn}, box on ${!off})`);
  return has ? "read only" : "no card";
});

await check(8, "no browser errors", async () => {
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
