// An unpaid business in a real browser against the QA app (tests/qa/serve.mjs): every page opens to look around,
// a "Subscribe to continue" popup shows once and again on any change, and nothing is saved. A paying business never
// sees it. Makes the QA "other" business need a paid plan (it has none) and puts it back at the end.
//   node tests/qa/plan-lock.mjs
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

const before = await db.client.findUniqueOrThrow({ where: { id: S.otherId }, select: { planRequired: true, name: true } });
const paid = await db.planPurchase.count({ where: { clientId: S.otherId, status: "VERIFIED", endsAt: { gt: new Date() } } });
if (paid) throw new Error("The QA other business has a paid period; this check needs one that never paid.");
await db.client.update({ where: { id: S.otherId }, data: { planRequired: true } });
const PHONE = `9199922${Date.now().toString().slice(-5)}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
async function as(token) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addCookies([{ name: "wp_session", value: token, url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e.message)));
  return p;
}
const go = (p, path) => p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 });
const popup = (p) => p.getByTestId("plan-lock-popup");

const m = await as(S.tokens.otherManager);

await check(1, "an unpaid business opens Orders like normal, and the popup shows once on arrival", async () => {
  await go(m, "/dashboard/orders");
  expect(!(await m.getByText("Your plan payment is due").count()) && !(await m.getByText("Subscribe to start using thabaal").count()), "old lock screen shown");
  expect(await m.locator("main").getByText(/orders/i).first().isVisible(), "orders page didn't render");
  await popup(m).waitFor({ state: "visible", timeout: 10_000 });
  const t = (await popup(m).innerText()).replace(/\s+/g, " ");
  expect(/Subscribe to continue/.test(t) && /Start subscription/.test(t), "popup text: " + t.slice(0, 200));
  await m.screenshot({ path: ".git/qa-plan-lock-popup.png" });
  await popup(m).getByRole("button", { name: "Not now" }).click();
  await go(m, "/dashboard/customers");
  await m.waitForTimeout(800);
  expect(!(await popup(m).isVisible()), "popup came back on every page");
  return "ok";
});

await check(2, "every section opens to look around (no padlocks, no lock screen)", async () => {
  const seen = [];
  for (const path of ["/dashboard/replies", "/dashboard/campaigns", "/dashboard/templates", "/dashboard/catalogue", "/dashboard/revenue", "/dashboard/report"]) {
    const res = await go(m, path);
    expect(res?.status() === 200 && new URL(m.url()).pathname === path, `${path} → ${m.url()}`);
    expect(!(await m.getByText("Subscribe to start using thabaal").count()), `${path} shows the lock screen`);
    seen.push(path.split("/").pop());
  }
  return seen.join(", ");
});

await check(3, "pressing a button (Add customer) shows the popup straight away; the form never opens", async () => {
  await go(m, "/dashboard/customers");
  await m.getByRole("button", { name: /^Add/ }).first().click();
  await popup(m).waitFor({ state: "visible", timeout: 10_000 });
  expect(!(await m.getByRole("dialog").filter({ hasText: "WhatsApp number" }).count()), "the Add customer form opened");
  expect((await popup(m).getByRole("link", { name: "Start subscription" }).getAttribute("href"))?.includes("/dashboard/account"), "subscribe link");
  await popup(m).getByRole("button", { name: "Not now" }).click();
  return "popup";
});

await check(31, "moving around still works: a tab switches without the popup", async () => {
  await go(m, "/dashboard/campaigns");
  const tab = m.getByRole("tab").nth(1);
  if (!(await tab.count())) return "no tabs on this page";
  await tab.click();
  await m.waitForTimeout(500);
  expect(!(await popup(m).isVisible()), "popup on a tab");
  return "tab ok";
});

await check(32, "a switch in Settings shows the popup", async () => {
  await go(m, "/dashboard/settings");
  const sw = m.locator("#main [role='switch']").first();
  if (!(await sw.count())) return "no switch on Settings";
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  await popup(m).waitFor({ state: "visible", timeout: 10_000 });
  expect((await sw.getAttribute("aria-checked")) === before, "the switch changed");
  return "popup, switch unchanged";
});

await check(33, "nothing was saved for the unpaid business", async () => {
  // The server refusing writes while unpaid is checked by tests/qa/action-guards.mjs and the unit tests.
  await popup(m).getByRole("button", { name: "Not now" }).click().catch(() => {});
  await go(m, "/dashboard/customers");
  expect(!(await db.customer.findFirst({ where: { clientId: S.otherId, phone: PHONE } })), "customer exists");
  return "nothing saved";
});

await check(4, "Start subscription goes to My account, where buttons work (no popup)", async () => {
  await go(m, "/dashboard/customers");
  await m.getByRole("button", { name: /^Add/ }).first().click();
  await popup(m).getByRole("link", { name: "Start subscription" }).click();
  await m.waitForURL(/\/dashboard\/account/, { timeout: 15_000 });
  return new URL(m.url()).pathname;
});

await check(5, "a paying business never sees the popup", async () => {
  const ok = await as(S.tokens.manager);
  await go(ok, "/dashboard/orders");
  await ok.waitForTimeout(1200);
  expect(!(await ok.getByTestId("plan-lock-popup").count()), "popup on a paying business");
  await ok.context().close();
  return "none";
});

await check(6, "no browser errors", async () => {
  expect(!errors.length, errors.join(" | ").slice(0, 300));
  return "none";
});

await db.customer.deleteMany({ where: { clientId: S.otherId, phone: PHONE } });
await db.client.update({ where: { id: S.otherId }, data: { planRequired: before.planRequired } });
await browser.close();
await db.$disconnect();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
