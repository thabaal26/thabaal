// Admin panel after the switch to auto-pay only, in a real browser against the QA app (tests/qa/serve.mjs):
// Overview, Payments, All clients and one client show Razorpay subscriptions (on, failing, none) instead of a UPI
// queue to confirm. Adds two QA subscription records and one auto-pay period, and removes them at the end.
//   node tests/qa/admin-autopay.mjs
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

const SHOP_SUB = "sub_QAadminAutopayOn";
const OTHER_SUB = "sub_QAadminAutopayBad";
const PAY_ID = "pay_QAadminAutopay1";
const cleanup = async () => {
  await db.razorpayRecord.deleteMany({ where: { rzpId: { in: [SHOP_SUB, OTHER_SUB] } } });
  await db.planPurchase.deleteMany({ where: { utr: PAY_ID } });
};
await cleanup();
const [shop, other] = await Promise.all([
  db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { name: true } }),
  db.client.findUniqueOrThrow({ where: { id: S.otherId }, select: { name: true } }),
]);
// The QA shop: subscribed and paid by auto-pay today. The other business: its auto-pay charge failed.
const now = new Date();
await db.planPurchase.create({
  data: {
    clientId: S.shopId, plan: "growth", cycle: "m", amountPaise: 299900, status: "VERIFIED", method: "RAZORPAY", utr: PAY_ID,
    startsAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), decidedAt: now, decidedBy: "Razorpay", submittedBy: "QA",
  },
});
await db.razorpayRecord.createMany({
  data: [
    { kind: "subscription", rzpId: SHOP_SUB, purpose: "plan", clientId: S.shopId, plan: "growth", cycle: "m", amountPaise: 299900, status: "active", createdBy: "QA" },
    { kind: "subscription", rzpId: OTHER_SUB, purpose: "plan", clientId: S.otherId, plan: "starter", cycle: "m", amountPaise: 119900, status: "halted", createdBy: "QA" },
  ],
});

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.admin, url: BASE }]);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message)));
const text = async () => (await p.locator("main, body").first().innerText()).replace(/\s+/g, " ");

await check(1, "Overview: 'On auto-pay' instead of 'Waiting for you', and the failed charge is in Needs you today", async () => {
  await p.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const t = await text();
  await p.screenshot({ path: ".git/qa-admin-overview.png" });
  // KPI labels are drawn in capitals by CSS, so match without case.
  expect(/On auto-pay/i.test(t), "no On auto-pay KPI");
  expect(!/Waiting for you/i.test(t), "old 'Waiting for you' KPI still there");
  expect(t.includes(`${other.name}: auto-pay charge failed`), "failed charge not in Needs you today");
  return t.match(/On auto-pay \S+ of \S+/i)?.[0] ?? "ok";
});

await check(2, "Payments opens on Auto-pay: failed charge with a reminder, every subscription with Razorpay's status", async () => {
  await p.goto(`${BASE}/admin/payments`, { waitUntil: "networkidle" });
  const t = await text();
  expect(!/Confirm UPI payments/.test(t), "old 'Confirm UPI payments' heading");
  expect((await p.getByRole("tab", { name: /Auto-pay/ }).getAttribute("aria-selected")) === "true", "Auto-pay is not the first tab");
  const panel = p.locator("#panel-auto");
  const pt = (await panel.innerText()).replace(/\s+/g, " ");
  expect(/Charges that failed/.test(pt) && pt.includes(other.name), "failing card missing");
  expect(/Active · charging each period/.test(pt) && /Stopped · charges failed/.test(pt), "statuses missing: " + pt.slice(0, 200));
  expect(pt.includes(shop.name), "subscribed shop missing");
  await p.screenshot({ path: ".git/qa-admin-payments.png", fullPage: true });
  return "ok";
});

await check(3, "All payments shows the auto-pay payment as 'Auto-pay', not a UPI reference", async () => {
  await p.getByRole("tab", { name: "All payments" }).click();
  const pt = (await p.locator("#panel-all").innerText()).replace(/\s+/g, " ");
  expect(pt.includes(`Auto-pay · ${PAY_ID}`), "auto-pay row label missing");
  expect(/How paid/i.test(pt) && !/UPI reference/i.test(pt), "column header not renamed");
  return "ok";
});

await check(4, "All clients: auto-pay filter, and each paying business says on / failing / no auto-pay", async () => {
  await p.goto(`${BASE}/admin/clients`, { waitUntil: "networkidle" });
  await p.getByLabel("Auto-pay").selectOption("failing");
  const rows = p.locator("table.dt tbody tr");
  const n = await rows.count();
  const t = (await rows.allInnerTexts()).join(" | ");
  expect(n === 1 && t.includes(other.name), `failing filter shows ${n}: ${t.slice(0, 120)}`);
  await p.getByLabel("Auto-pay").selectOption("on");
  const t2 = (await rows.allInnerTexts()).join(" | ");
  expect(t2.includes(shop.name) && /Auto-pay on/.test(t2), "on filter");
  return "filters work";
});

await check(5, "One client: Auto-pay subscription card with its history, and the timeline says 'paid by auto-pay'", async () => {
  await p.goto(`${BASE}/admin/clients/${S.shopId}`, { waitUntil: "networkidle" });
  const card = p.locator(".card", { hasText: "Auto-pay subscription" }).first();
  const t = (await card.innerText()).replace(/\s+/g, " ");
  expect(/Active · charging each period/.test(t) && t.includes(SHOP_SUB), "card: " + t.slice(0, 200));
  expect(/Last auto-pay charge received/.test(t), "last charge line missing");
  expect(/paid by auto-pay/.test(await text()), "timeline label");
  await card.screenshot({ path: ".git/qa-admin-client-autopay.png" });
  const panel = (await p.locator(".card", { hasText: "old UPI payments and manual periods" }).first().innerText()).replace(/\s+/g, " ");
  expect(/Nothing to check/.test(panel), "old UPI panel wording");
  return "ok";
});

await check(6, "the nav badge counts the failed auto-pay", async () => {
  const badge = await p.locator("nav a", { hasText: "Payments" }).first().innerText();
  expect(/\d/.test(badge), "no count on Payments: " + badge);
  return badge.replace(/\s+/g, " ");
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
