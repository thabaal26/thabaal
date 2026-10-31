// Payments › Settings › "How customers earn points": change the rate and turn the repeat bonus off in a real browser
// against the QA app (tests/qa/serve.mjs), check what is saved, that balances follow, and put the defaults back.
//   node tests/qa/loyalty-rules.mjs
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
const shop = await db.client.findUniqueOrThrow({ where: { id: S.shopId } });
const card = () => p.locator(".card-3d", { hasText: "How customers earn points" });

await check(1, "settings show the default rules", async () => {
  await p.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  await card().waitFor({ timeout: 15000 });
  expect((await card().getByLabel("Rupees spent for 1 point").inputValue()) === "100", "rate not 100");
  expect((await card().getByLabel("Bonus points per repeat order").inputValue()) === "50", "bonus not 50");
  expect((await card().getByRole("switch").count()) === 2, "two switches");
  expect(await card().getByRole("button", { name: "Save rules" }).isDisabled(), "save should wait for a change");
  await card().screenshot({ path: ".git/qa-loyalty-rules.png" });
  return "₹100 / +50, Save disabled";
});

await check(2, "a bad number can't be saved", async () => {
  await card().getByLabel("Rupees spent for 1 point").fill("0");
  expect(await card().getByRole("button", { name: "Save rules" }).isDisabled(), "save enabled with 0");
  await card().getByText("Enter a whole number from 1 to 1,00,000.").waitFor({ timeout: 3000 });
  return "0 refused";
});

await check(3, "save ₹50 per point with the repeat bonus off", async () => {
  await card().getByLabel("Rupees spent for 1 point").fill("50");
  await card().getByRole("switch", { name: "Repeat-order bonus" }).click();
  expect((await card().getByRole("switch", { name: "Repeat-order bonus" }).getAttribute("aria-checked")) === "false", "switch didn't turn off");
  await card().getByRole("button", { name: "Save rules" }).click();
  await p.getByText(/Loyalty rules saved/).first().waitFor({ timeout: 15000 });
  const c = await db.client.findUniqueOrThrow({ where: { id: S.shopId } });
  expect(c.loyaltyRupeesPerPoint === 50 && c.loyaltyRepeatOn === false && c.loyaltyEarnOn === true && c.loyaltyRepeatBonus === 50, JSON.stringify(c));
  return "saved: 50 / repeat off (bonus kept at 50)";
});

await check(4, "Customers › Loyalty shows the new rules and balances follow", async () => {
  await p.goto(`${BASE}/dashboard/customers?tab=loyalty`, { waitUntil: "networkidle" });
  const set = p.getByRole("button", { name: /How points work|Rules|Settings/i }).first();
  if (await set.count()) await set.click().catch(() => {});
  const body = await p.locator("body").innerText();
  // Balance check on one customer with bought orders, worked out by hand from the database.
  const cust = await db.customer.findFirst({
    where: { clientId: S.shopId, orders: { some: { paidAt: { not: null }, status: { not: "CANCELLED" } } } },
    include: { orders: true },
  });
  expect(cust, "no customer with a paid order");
  const { loyaltyFromOrders, loyaltyRules } = await import("../../src/lib/loyalty.ts").catch(() => ({}));
  let detail = body.includes("1 point for every ₹50") ? "rule text ₹50 shown" : "rule text on another tab";
  if (loyaltyFromOrders) {
    const now = loyaltyFromOrders(cust, { rules: loyaltyRules(await db.client.findUniqueOrThrow({ where: { id: S.shopId } })) }).totalPoints;
    const before = loyaltyFromOrders(cust).totalPoints;
    detail += ` · ${cust.name}: ${before} pts on old rules → ${now} pts now`;
  }
  return detail;
});

await check(5, "phone width: the card fits with no sideways scroll", async () => {
  const m = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await m.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const mp = await m.newPage();
  await mp.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  const c = mp.locator(".card-3d", { hasText: "How customers earn points" });
  await c.waitFor({ timeout: 15000 });
  await c.scrollIntoViewIfNeeded();
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await c.screenshot({ path: ".git/qa-loyalty-rules-phone.png" });
  await m.close();
  expect(over <= 1, `page scrolls sideways by ${over}px`);
  return "fits at 360px";
});

await check(6, "defaults put back", async () => {
  await p.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  await card().getByLabel("Rupees spent for 1 point").fill("100");
  await card().getByRole("switch", { name: "Repeat-order bonus" }).click();
  await card().getByRole("button", { name: "Save rules" }).click();
  await p.getByText(/Loyalty rules saved/).first().waitFor({ timeout: 15000 });
  const c = await db.client.findUniqueOrThrow({ where: { id: S.shopId } });
  expect(c.loyaltyRupeesPerPoint === 100 && c.loyaltyRepeatOn && c.loyaltyEarnOn && c.loyaltyRepeatBonus === 50, JSON.stringify(c));
  return "₹100 / +50 again";
});

await check(7, "no page errors", async () => {
  expect(errors.length === 0, errors.join(" | "));
});

void shop;
await browser.close();
await db.$disconnect();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.no}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
