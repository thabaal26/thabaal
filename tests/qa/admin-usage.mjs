// Usage tracking end to end in a real browser against the QA app (tests/qa/serve.mjs): a business login's page
// opens, an action and a sign-in are counted; Thabaal's admin is never counted; the admin Usage page shows them.
// Adds one QA login (removed at the end, with its counts) and one QA customer (removed at the end).
//   node tests/qa/admin-usage.mjs
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const bcrypt = require("bcryptjs");
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
// Counts are written just after each response, so give them a moment.
async function until(fn, ms = 10_000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v || Date.now() - t0 > ms) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
}

const run = Date.now().toString().slice(-6);
const LOGIN_EMAIL = `qa-usage-${run}@example.test`;
const LOGIN_PW = randomBytes(12).toString("base64url"); // a throwaway QA-only password, never shown
const CUSTOMER_PHONE = `9199911${run}`.slice(0, 12);
const cleanup = async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "qa-usage-" } } }); // its usage rows go with it
  await db.customer.deleteMany({ where: { clientId: S.shopId, phone: CUSTOMER_PHONE } });
};
await cleanup();
const owner = await db.user.findFirstOrThrow({ where: { clientId: S.shopId, role: "CLIENT", access: "MANAGER" }, select: { id: true } });
const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
const rowsOf = (userId, kind) => db.usageDay.findMany({ where: { userId, ...(kind ? { kind } : {}) } });
const before = { owner: (await rowsOf(owner.id)).reduce((s, r) => s + r.count, 0), admin: (await rowsOf(admin.id)).length };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
async function as(token) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  if (token) await ctx.addCookies([{ name: "wp_session", value: token, url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e.message)));
  return p;
}
const go = (p, path) => p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 });
const m = await as(S.tokens.manager);

await check(1, "a business login's sections are counted as they open (Home, Orders, Chats)", async () => {
  await go(m, "/dashboard");
  await go(m, "/dashboard/orders");
  await m.getByRole("link", { name: /^Chats/ }).first().click();
  await m.waitForURL(/\/dashboard\/replies/);
  const got = await until(async () => {
    const keys = (await rowsOf(owner.id, "open")).map((r) => r.key);
    return ["", "orders", "replies"].every((k) => keys.includes(k)) && keys;
  });
  expect(got, "opens not recorded: " + JSON.stringify((await rowsOf(owner.id, "open")).map((r) => r.key)));
  return "home, orders, replies";
});

await check(2, "an action is counted as a button press (Add customer)", async () => {
  await go(m, "/dashboard/customers");
  await m.getByRole("button", { name: /^Add/ }).first().click();
  const d = m.getByRole("dialog").filter({ hasText: "Add customer" }).last();
  await d.getByLabel("Name").fill(`QA Usage ${run}`);
  await d.getByLabel("WhatsApp number").fill(CUSTOMER_PHONE);
  await d.getByRole("button", { name: "Add customer" }).click();
  const press = await until(async () => (await rowsOf(owner.id, "press")).find((r) => r.key === "customer.save"));
  expect(press && press.count >= 1, "press not recorded");
  return `customer.save × ${press.count}`;
});

await check(3, "signing in with a password counts one login", async () => {
  await db.user.create({ data: { email: LOGIN_EMAIL, name: "QA Usage", passwordHash: await bcrypt.hash(LOGIN_PW, 10), role: "CLIENT", access: "MANAGER", clientId: S.shopId } });
  const p = await as(null);
  await go(p, "/login");
  await p.locator('input[name="email"]').fill(LOGIN_EMAIL);
  await p.locator('input[name="password"]').fill(LOGIN_PW);
  await p.locator("button.thabaal-login-btn").click();
  await p.waitForURL(/\/dashboard/, { timeout: 30_000 });
  const u = await db.user.findUniqueOrThrow({ where: { email: LOGIN_EMAIL } });
  const login = await until(async () => (await rowsOf(u.id, "login"))[0]);
  expect(login?.count === 1 && login.clientId === S.shopId, "login not counted: " + JSON.stringify(login));
  await p.context().close();
  return "1 login";
});

await check(4, "Thabaal's admin opening the shop's pages is never counted", async () => {
  const a = await as(S.tokens.admin);
  await go(a, "/dashboard");
  await go(a, "/dashboard/orders");
  await a.waitForTimeout(1500);
  const n = (await rowsOf(admin.id)).length;
  // The beacon isn't even on the page for an admin, and the server would ignore it anyway.
  const r = await a.request.post(`${BASE}/api/usage`, { data: { path: "/dashboard/orders" } });
  expect(r.status() === 204, "beacon status " + r.status());
  await a.waitForTimeout(1500);
  expect(n === before.admin && (await rowsOf(admin.id)).length === before.admin, "admin counted");
  await a.context().close();
  return "0 rows for the admin";
});

await check(5, "a signed-out beacon or an unknown address is ignored", async () => {
  const total = async () => (await db.usageDay.aggregate({ _sum: { count: true } }))._sum.count ?? 0;
  const t0 = await total();
  const out = await fetch(`${BASE}/api/usage`, { method: "POST", body: JSON.stringify({ path: "/dashboard/orders" }), headers: { "Content-Type": "application/json" } });
  const odd = await m.request.post(`${BASE}/api/usage`, { data: { path: "/dashboard/../../admin" } });
  expect(out.status === 204 && odd.status() === 204, "status");
  await new Promise((r) => setTimeout(r, 1500));
  expect((await total()) === t0, "something was counted");
  return "nothing counted";
});

await check(6, "admin Usage page shows sections, buttons, logins, last opened and the heatmap from real counts", async () => {
  const a = await as(S.tokens.admin);
  await go(a, "/admin/usage");
  const t = (await a.locator("main").innerText()).replace(/\s+/g, " ");
  expect(!/phase 2/i.test(t), "phase 2 note still there");
  expect(/Which parts of thabaal get used/.test(t) && /Orders \d+%/.test(t), "sections card: " + (t.match(/Which parts.{0,200}/)?.[0] ?? ""));
  expect(/Most pressed buttons/.test(t) && /Save customer \d+/.test(t), "buttons card");
  await a.screenshot({ path: ".git/qa-admin-usage-feat.png", fullPage: true });
  await a.getByRole("tab", { name: "Who is slipping" }).click();
  const shop = await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { name: true } });
  const row = (await a.locator("table.dt tbody tr", { hasText: shop.name }).first().innerText()).replace(/\s+/g, " ");
  expect(/Today/.test(row) && /\b1\b/.test(row), "shop row: " + row);
  const dark = await a.locator(".heat i").evaluateAll((els) => els.filter((e) => e.style.background).length);
  expect(dark >= 1, "heatmap empty");
  expect(/Businesses kept, month by month/.test(await a.locator("main").innerText()), "kept chart missing");
  await a.screenshot({ path: ".git/qa-admin-usage-slipping.png", fullPage: true });
  await a.context().close();
  return row.slice(0, 120);
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
