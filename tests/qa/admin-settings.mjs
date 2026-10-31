// Admin panel › Settings in a real browser against the QA app (tests/qa/serve.mjs): Edit prices (saved, refused
// when wrong, shown on the website and My account, an existing subscription keeps its price) and Invite someone.
// Adds one QA subscription, one QA period and one QA admin login, puts the prices back and removes them at the end.
//   node tests/qa/admin-settings.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { Prisma, PrismaClient } from "@prisma/client";

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

const SUB = "sub_QAadminSettingsOld";
const PAY_ID = "pay_QAadminSettings1";
const INVITE = `qa-invite-${Date.now()}@example.test`;
const cleanup = async () => {
  await db.razorpayRecord.deleteMany({ where: { rzpId: SUB } });
  await db.planPurchase.deleteMany({ where: { utr: PAY_ID } });
  await db.user.deleteMany({ where: { email: { startsWith: "qa-invite-" } } });
  await db.setting.updateMany({ where: { id: 1 }, data: { planPrices: Prisma.DbNull, planPricesAt: null, planPricesBy: null } });
};
await cleanup();
// The QA shop subscribed to Growth monthly at the original ₹2,999 and is paid up by auto-pay.
const now = new Date();
await db.planPurchase.create({
  data: {
    clientId: S.shopId, plan: "growth", cycle: "m", amountPaise: 299900, status: "VERIFIED", method: "RAZORPAY", utr: PAY_ID,
    startsAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), decidedAt: now, decidedBy: "Razorpay", submittedBy: "QA",
  },
});
await db.razorpayRecord.create({
  data: { kind: "subscription", rzpId: SUB, purpose: "plan", clientId: S.shopId, plan: "growth", cycle: "m", amountPaise: 299900, status: "active", createdBy: "QA" },
});

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.admin, url: BASE }]);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message)));
const text = async (page = p) => (await page.locator("main, body").first().innerText()).replace(/\s+/g, " ");
const plansCard = () => p.locator(".card", { hasText: "Plans and prices" }).first();
// The toast that says `re`; waits for it, since earlier toasts may still be showing.
const toast = async (re) => {
  const t = p.locator('[role="status"] > div', { hasText: re }).last();
  await t.waitFor({ timeout: 15_000 }).catch(() => {});
  return (await p.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ");
};
const fill = async (plan, m, q, y) => {
  await p.fill(`#pr-${plan}-m`, m);
  await p.fill(`#pr-${plan}-q`, q);
  await p.fill(`#pr-${plan}-y`, y);
};

await check(1, "Settings: prices table with Edit prices, no 'phase 2' notes, no grace/lock switches", async () => {
  await p.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  const t = await text();
  expect(!/phase 2/i.test(t), "a 'phase 2' note is still there");
  expect(!/Lock the app when unpaid/.test(t), "grace/lock switch was not asked for");
  const card = (await plansCard().innerText()).replace(/\s+/g, " ");
  expect(card.includes("₹2,999") && /The original prices/.test(card), "card: " + card.slice(0, 200));
  expect(await p.getByRole("button", { name: "Edit prices" }).isVisible(), "no Edit prices button");
  expect(await p.getByRole("button", { name: "Invite someone" }).isVisible(), "no Invite someone button");
  return "ok";
});

await check(2, "a wrong price is refused and nothing changes", async () => {
  await p.getByRole("button", { name: "Edit prices" }).click();
  await fill("growth", "3499", "9447", "9000");
  await p.getByRole("button", { name: "Save prices" }).click();
  const msg = await toast(/12-month price/);
  expect(/Growth: the 12-month price must be more/.test(msg), "toast: " + msg);
  expect(await p.locator("dialog[open]").count(), "dialog closed on an error");
  const s = await db.setting.findUnique({ where: { id: 1 }, select: { planPrices: true } });
  expect(!s?.planPrices, "something was saved");
  return msg.slice(0, 80);
});

await check(3, "new Growth prices save, with per-month hints, and the table shows who changed them", async () => {
  await fill("growth", "3499", "9447", "33590");
  const hint = (await p.locator("dialog[open]").innerText()).replace(/\s+/g, " ");
  expect(/₹3,149\/mo · saves 10%/.test(hint) && /₹2,799\/mo · saves 20%/.test(hint), "hints: " + hint.slice(0, 300));
  await p.locator("dialog[open]").screenshot({ path: ".git/qa-admin-price-dialog.png" });
  await p.getByRole("button", { name: "Save prices" }).click();
  const msg = await toast(/Prices saved/);
  expect(/Prices saved/.test(msg), "toast: " + msg);
  await p.waitForFunction(() => document.body.innerText.includes("₹3,499"), null, { timeout: 15_000 });
  const card = (await plansCard().innerText()).replace(/\s+/g, " ");
  expect(/₹3,499 ₹9,447 ₹33,590/.test(card) && /Changed by/.test(card), "card: " + card.slice(0, 300));
  await plansCard().screenshot({ path: ".git/qa-admin-prices.png" });
  return "saved";
});

await check(4, "the website shows the new price (monthly, 3 months, FAQ and compare)", async () => {
  const site = await browser.newPage();
  await site.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  // The pricing section is below the sign-in form's <main> and fades in on scroll, so read the page's text content.
  const body = async () => ((await site.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
  const t = await body();
  expect(/3,499/.test(t) && !/₹?2,999/.test(t), "monthly price: " + (t.match(/.{40}3,499.{40}/)?.[0] ?? "missing"));
  const quarterly = site.getByRole("tab", { name: /^Quarterly \(Save 10%\)$/ });
  await quarterly.scrollIntoViewIfNeeded();
  await quarterly.click();
  const q = await body();
  expect(/9,447/.test(q), "quarterly total missing");
  await site.close();
  return "ok";
});

await check(5, "My account (owner): Change plan offers Growth at the new price", async () => {
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx2.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const m = await ctx2.newPage();
  m.on("pageerror", (e) => errors.push(String(e.message)));
  await m.goto(`${BASE}/dashboard/account`, { waitUntil: "networkidle" });
  await m.getByRole("tab", { name: /Change plan/i }).click();
  const t = await text(m);
  expect(/3,499/.test(t), "new price missing on Change plan");
  await m.screenshot({ path: ".git/qa-account-new-price.png" });
  await ctx2.close();
  return "ok";
});

await check(6, "the business already subscribed keeps ₹2,999 (admin client page)", async () => {
  await p.goto(`${BASE}/admin/clients/${S.shopId}`, { waitUntil: "networkidle" });
  const t = await text();
  expect(/renews .{3,20} · ₹2,999/.test(t), "renewal: " + (t.match(/renews .{0,40}/)?.[0] ?? "missing"));
  return t.match(/renews .{3,20} · ₹[\d,]+/)?.[0];
});

await check(7, "Invite someone adds an admin login and lists it", async () => {
  await p.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Invite someone" }).click();
  await p.fill("#inv-name", "QA Invite");
  await p.fill("#inv-email", INVITE);
  await p.getByRole("button", { name: "Send the invite" }).click();
  const msg = await toast(/QA Invite is added/);
  expect(/QA Invite is added/.test(msg), "toast: " + msg);
  const u = await db.user.findUnique({ where: { email: INVITE } });
  expect(u?.role === "ADMIN" && u.clientId === null, "not an admin login");
  await p.waitForFunction((e) => document.body.innerText.includes(e), INVITE, { timeout: 15_000 });
  return msg.slice(0, 90);
});

await check(8, "inviting a business's login is refused", async () => {
  const owner = await db.user.findFirstOrThrow({ where: { clientId: S.shopId, role: "CLIENT" }, select: { email: true } });
  await p.getByRole("button", { name: "Invite someone" }).click();
  await p.fill("#inv-name", "Shop owner");
  await p.fill("#inv-email", owner.email);
  await p.getByRole("button", { name: "Send the invite" }).click();
  const msg = await toast(/already a business login/);
  expect(/already a business login/.test(msg), "toast: " + msg);
  const u = await db.user.findUniqueOrThrow({ where: { email: owner.email } });
  expect(u.role === "CLIENT", "role changed");
  await p.locator("dialog[open]").getByRole("button", { name: "Cancel" }).click();
  return "refused";
});

await check(9, "a shop login can't open admin Settings", async () => {
  const ctx3 = await browser.newContext();
  await ctx3.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const m = await ctx3.newPage();
  await m.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  const url = m.url();
  await ctx3.close();
  expect(!url.includes("/admin"), "stayed on " + url);
  return url.replace(BASE, "");
});

await check(10, "Fill in the original prices puts them back", async () => {
  await p.getByRole("button", { name: "Edit prices" }).click();
  await p.getByRole("button", { name: "Fill in the original prices" }).click();
  await p.getByRole("button", { name: "Save prices" }).click();
  expect(/Prices saved/.test(await toast(/Prices saved/)), "not saved");
  await p.waitForFunction(() => document.body.innerText.includes("The original prices"), null, { timeout: 15_000 });
  return "back to ₹2,999";
});

await check(11, "no browser errors", async () => {
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
