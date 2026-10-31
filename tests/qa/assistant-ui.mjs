// Payments › Payment settings › WhatsApp order assistant, in a real browser against the QA app (tests/qa/serve.mjs):
// reminders switch, how long unfinished orders stay open, and the shop hours reply. Puts the defaults back.
//   node tests/qa/assistant-ui.mjs
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
const settings = async () => (await db.client.findUniqueOrThrow({ where: { id: S.shopId } })).paySettings ?? {};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message)));
const card = () => p.locator("section.card", { hasText: "WhatsApp order assistant" });

await check(1, "the card shows with the defaults: reminders on, 3 days, hours reply off", async () => {
  await p.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  await card().waitFor({ timeout: 15000 });
  const sw = card().getByRole("switch");
  expect((await sw.nth(0).getAttribute("aria-checked")) === "true", "reminders not on");
  expect((await card().locator("#as-expiry").inputValue()) === "3", "expiry not 3");
  expect((await sw.nth(1).getAttribute("aria-checked")) === "false", "hours reply not off");
  await card().scrollIntoViewIfNeeded();
  await card().screenshot({ path: ".git/qa-assistant-card.png" });
  return "defaults ok";
});

await check(2, "reminders off and on save", async () => {
  await card().getByRole("switch").nth(0).click();
  await p.getByText(/Reminders off/).first().waitFor({ timeout: 15000 });
  expect((await settings()).nudgeOn === false, "not saved off");
  await card().getByRole("switch").nth(0).click();
  await p.getByText(/Reminders on/).first().waitFor({ timeout: 15000 });
  expect((await settings()).nudgeOn === true, "not saved on");
  return "saved";
});

await check(3, "unfinished orders: 7 days saves, then back to 3", async () => {
  await card().locator("#as-expiry").selectOption("7");
  await p.getByText(/close after 7 days/).first().waitFor({ timeout: 15000 });
  expect((await settings()).cartExpiryDays === 7, "7 not saved");
  await card().locator("#as-expiry").selectOption("3");
  await p.getByText(/close after 3 days/).first().waitFor({ timeout: 15000 });
  return "7 → 3";
});

await check(4, "shop hours: times save, reply switch on and off", async () => {
  await card().locator("#as-open").fill("10:00");
  await card().getByRole("button", { name: "Save hours" }).click();
  await p.getByText(/Shop hours saved/).first().waitFor({ timeout: 15000 });
  expect((await settings()).openAt === "10:00", "open time not saved");
  await card().getByRole("switch").nth(1).click();
  await p.getByText(/Shop hours reply on/).first().waitFor({ timeout: 15000 });
  expect((await settings()).hoursOn === true, "hours not on");
  await card().getByRole("switch").nth(1).click();
  await p.getByText(/Shop hours reply off/).first().waitFor({ timeout: 15000 });
  await card().locator("#as-open").fill("09:00");
  await card().getByRole("button", { name: "Save hours" }).click();
  await p.getByText(/Shop hours saved/).first().waitFor({ timeout: 15000 });
  return "10:00 saved, switch on/off, back to 09:00";
});

await check(5, "phone width: the card fits", async () => {
  const m = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await m.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const mp = await m.newPage();
  await mp.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  const c = mp.locator("section.card", { hasText: "WhatsApp order assistant" });
  await c.waitFor({ timeout: 15000 });
  await c.scrollIntoViewIfNeeded();
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await c.screenshot({ path: ".git/qa-assistant-card-phone.png" });
  await m.close();
  expect(over <= 1, `sideways scroll ${over}px`);
  return "fits at 360px";
});

await check(6, "no page errors", async () => {
  expect(errors.length === 0, errors.join(" | "));
});

await browser.close();
await db.$disconnect();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.no}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
