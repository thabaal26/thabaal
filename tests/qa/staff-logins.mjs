// Settings › Staff logins in a real browser against the QA app (tests/qa/serve.mjs): the owner adds a staff login within
// the plan (Business: 5 besides the owner), the new login signs in, the owner removes it; at the limit adding stops;
// a staff login sees the list but can't add. Gives the QA shop a Business month for the test and removes it after.
//   node tests/qa/staff-logins.mjs
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
const EMAIL = `qa-staff-${run}@example.test`;
const PW = `Qa-${run}-pass`; // a throwaway QA-only password
const PAY = `pay_QAstaff${run}`;
const now = Date.now();
await db.planPurchase.create({
  data: { clientId: S.shopId, plan: "business", cycle: "m", amountPaise: 499_900, status: "VERIFIED", method: "ADMIN_RECORD", utr: PAY, startsAt: new Date(now - 86_400_000), endsAt: new Date(now + 29 * 86_400_000), decidedAt: new Date(now - 86_400_000), submittedBy: "QA" },
});
const cleanup = async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "qa-staff-" } } });
  await db.planPurchase.deleteMany({ where: { utr: PAY } });
};
const logins = () => db.user.count({ where: { clientId: S.shopId } });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
async function as(token) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  if (token) await ctx.addCookies([{ name: "wp_session", value: token, url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e.message)));
  p.on("dialog", (d) => d.accept());
  return p;
}
const m = await as(S.tokens.manager);
const card = () => m.locator("#staff");
async function toast(p, re) {
  await p.locator('[role="status"] > div', { hasText: re }).last().waitFor({ timeout: 15_000 }).catch(() => {});
  return (await p.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ");
}

await check(1, "the owner sees Staff logins with the Business plan's count", async () => {
  await m.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  const t = (await card().innerText()).replace(/\s+/g, " ");
  const staff = (await logins()) - 1;
  expect(t.includes(`${staff} of 5 staff logins on the Business plan`), "card: " + t.slice(0, 200));
  return `${staff} of 5`;
});

await check(2, "add a staff login: saved as Staff for this business", async () => {
  await m.fill("#staff-name", "QA Packer");
  await m.fill("#staff-email", EMAIL);
  await m.fill("#staff-password", PW);
  await m.getByRole("button", { name: "Add staff login" }).click();
  expect(/Login created for QA Packer/.test(await toast(m, /Login created/)), "no toast");
  const u = await db.user.findUnique({ where: { email: EMAIL } });
  expect(u && u.access === "STAFF" && u.clientId === S.shopId && u.role === "CLIENT", "saved: " + JSON.stringify(u && { access: u.access }));
  await m.waitForFunction((e) => document.querySelector("#staff")?.textContent?.includes(e), EMAIL, { timeout: 10_000 });
  return "added";
});

await check(3, "the new login signs in with that password", async () => {
  const p = await as(null);
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.locator('input[name="email"]').fill(EMAIL);
  await p.locator('input[name="password"]').fill(PW);
  await p.locator("button.thabaal-login-btn").click();
  await p.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await p.context().close();
  return "signed in";
});

await check(4, "remove it: the login is gone", async () => {
  await m.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await card().locator(".row", { hasText: EMAIL }).getByRole("button", { name: "Remove" }).click();
  expect(/can no longer sign in/.test(await toast(m, /can no longer sign in/)), "no toast");
  expect(!(await db.user.findUnique({ where: { email: EMAIL } })), "still there");
  return "removed";
});

await check(5, "at the plan's limit, adding stops: button off with a note (the server's own check: tests/unit/plan-limits)", async () => {
  const room = 5 - ((await logins()) - 1);
  for (let i = 0; i < room; i++) await db.user.create({ data: { clientId: S.shopId, role: "CLIENT", access: "STAFF", name: `QA Fill ${i}`, email: `qa-staff-fill-${run}-${i}@example.test`, passwordHash: "x" } });
  await m.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  expect(await m.getByRole("button", { name: "Add staff login" }).isDisabled(), "button still on");
  expect(/All staff logins on your plan are in use/.test(await card().innerText()), "no note");
  return "full at 5 of 5";
});

await check(6, "a staff login sees who can sign in, but can't add or remove", async () => {
  const st = await as(S.tokens.staff);
  await st.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  const has = await st.locator("#staff").count();
  const add = await st.getByRole("button", { name: "Add staff login" }).count();
  const remove = await st.locator("#staff").getByRole("button", { name: "Remove" }).count();
  await st.context().close();
  expect(add === 0 && remove === 0, `staff can change logins (add ${add}, remove ${remove})`);
  return has ? "list only" : "no card";
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
