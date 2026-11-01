// Enquiries that come in by themselves, in a real browser against the QA app (tests/qa/serve.mjs): the website's free
// demo form (from the header and a pricing button), asking twice, a robot, a wrong number; a sign-up with its WhatsApp
// number; then Admin › Enquiries shows both for today, the sign-up as "not paid", and once a payment is verified the
// sign-up is won by itself. Removes what it made.
//   node tests/qa/enquiries-auto.mjs
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
const PHONE = `97${run}31`.slice(0, 10);
const PHONE2 = `96${run}42`.slice(0, 10);
const SHOP = `QA Demo Shop ${run}`;
const BIZ = `QA Signup Biz ${run}`;
const EMAIL = `qa-signup-${run}@example.test`;
// Earlier runs from this computer count towards the per-network limits.
await db.loginAttempt.deleteMany({ where: { OR: [{ key: { startsWith: "demo:" } }, { key: { startsWith: "signup:" } }] } });
const cleanup = async () => {
  const leads = await db.lead.findMany({ where: { OR: [{ phone: { in: [PHONE, PHONE2] } }, { shop: { in: [SHOP, BIZ] } }] }, select: { id: true } });
  await db.leadActivity.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } });
  await db.lead.deleteMany({ where: { id: { in: leads.map((l) => l.id) } } });
  const biz = await db.client.findUnique({ where: { name: BIZ }, select: { id: true } });
  if (biz) {
    await db.planPurchase.deleteMany({ where: { clientId: biz.id } });
    await db.user.deleteMany({ where: { clientId: biz.id } });
    await db.client.delete({ where: { id: biz.id } });
  }
  await db.loginAttempt.deleteMany({ where: { OR: [{ key: { startsWith: "demo:" } }, { key: { startsWith: "signup:" } }] } });
};
const waitFor = async (fn, ms = 15_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
async function page(token, width = 1366) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  if (token) await ctx.addCookies([{ name: "wp_session", value: token, url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e.message)));
  return p;
}
const v = await page(null);

await check(1, "the header's Book a demo goes to the free demo form", async () => {
  await v.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await v.locator(".site-header-btn-primary", { hasText: /Book/ }).first().click();
  await v.locator("#demo-form").waitFor({ timeout: 10_000 });
  expect(await v.locator("#demo-form").isVisible(), "form not shown");
  return "form shown";
});

await check(2, "a pricing button fills in its plan; the form needs only number, shop and name", async () => {
  await v.locator(".tier-card .tier-btn").nth(2).click(); // Starter, Growth, Business
  expect((await v.inputValue("#demo-plan")) === "business", "plan " + (await v.inputValue("#demo-plan")));
  const required = await v.locator("#demo-form [required]").evaluateAll((els) => els.map((e) => e.getAttribute("name")).sort().join(","));
  expect(required === "person,phone,shop", "required: " + required);
  return "plan business";
});

await check(3, "a wrong number is refused with a clear message", async () => {
  await v.fill("#demo-phone", "12345");
  await v.fill("#demo-shop", SHOP);
  await v.fill("#demo-person", "QA Meena");
  await v.locator("#demo-form button[type=submit]").click();
  await v.locator(".demo-form-error").waitFor({ timeout: 10_000 });
  expect(/10-digit/.test(await v.locator(".demo-form-error").innerText()), "no message");
  return "refused";
});

await check(4, "after the problem what was typed is still there; sent: thank-you, and a New enquiry from the website", async () => {
  expect((await v.inputValue("#demo-shop")) === SHOP && (await v.inputValue("#demo-person")) === "QA Meena", "typed values lost");
  await v.fill("#demo-phone", PHONE);
  await v.fill("#demo-town", "Madurai");
  await v.fill("#demo-sells", "cold pressed oils");
  await v.locator("#demo-form button[type=submit]").click();
  await v.locator("#demo-done").waitFor({ timeout: 15_000 });
  const t = await v.locator("#demo-done").innerText();
  expect(t.includes(PHONE) && /one working hour/.test(t), "thanks: " + t);
  const l = await db.lead.findFirst({ where: { phone: PHONE } });
  expect(l && l.source === "Home page form" && l.stage === "new" && l.plan === "business" && l.sells === "cold pressed oils", "lead: " + JSON.stringify(l && { source: l.source, plan: l.plan }));
  return "lead added";
});

await check(5, "asking again with the same number: thanked, still one enquiry", async () => {
  const p = await page(null);
  await p.goto(`${BASE}/#start`, { waitUntil: "networkidle" });
  await p.fill("#demo-phone", PHONE);
  await p.fill("#demo-shop", SHOP);
  await p.fill("#demo-person", "QA Meena");
  await p.locator("#demo-form button[type=submit]").click();
  await p.locator("#demo-done").waitFor({ timeout: 15_000 });
  const t = await p.locator("#demo-done").innerText();
  await p.context().close();
  expect(/already have your request/.test(t), "thanks: " + t);
  expect((await db.lead.count({ where: { phone: PHONE } })) === 1, "two enquiries");
  return "one";
});

await check(6, "a robot (hidden field filled) is thanked but nothing is kept", async () => {
  const p = await page(null);
  await p.goto(`${BASE}/#start`, { waitUntil: "networkidle" });
  await p.fill("#demo-phone", PHONE2);
  await p.fill("#demo-shop", "Robot Shop");
  await p.fill("#demo-person", "Robot");
  await p.locator("input[name=website]").evaluate((el) => (el.value = "http://spam.example"));
  await p.locator("#demo-form button[type=submit]").click();
  await p.locator("#demo-done").waitFor({ timeout: 15_000 });
  await p.context().close();
  expect((await db.lead.count({ where: { phone: PHONE2 } })) === 0, "robot kept");
  return "nothing kept";
});

await check(7, "the form fits a phone screen", async () => {
  const p = await page(null, 375);
  await p.goto(`${BASE}/#start`, { waitUntil: "networkidle" });
  const wide = await p.evaluate(() => document.documentElement.scrollWidth);
  const box = await p.locator("#demo-form").boundingBox();
  await p.context().close();
  expect(wide <= 376 && box && box.width <= 375, `page ${wide}px, form ${box?.width}px`);
  return `${Math.round(box.width)}px`;
});

await check(8, "sign-up asks for the WhatsApp number; the new business is an enquiry 'not paid' with it", async () => {
  const p = await page(null);
  await p.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await p.fill("#business", BIZ);
  await p.fill("#city", "Salem");
  await p.fill("#name", "QA Owner");
  await p.fill("#phone", PHONE2);
  await p.fill("#email", EMAIL);
  await p.fill("#password", `Qa-${run}-pass`);
  await p.locator("input[name=terms]").check();
  await p.locator("button.thabaal-login-btn").click();
  await p.waitForURL(/\/dashboard\/account/, { timeout: 30_000 });
  await p.context().close();
  const biz = await db.client.findUniqueOrThrow({ where: { name: BIZ } });
  const l = await waitFor(() => db.lead.findUnique({ where: { clientId: biz.id } }));
  expect(l && l.source === "Sign-up" && l.phone === PHONE2 && l.email === EMAIL && l.stage === "new", "lead: " + JSON.stringify(l));
  return "enquiry added";
});

const a = await page(S.tokens.admin);
await check(9, "Admin › Enquiries: both waiting today, tagged 'From the website' and 'Signed up · not paid', with WhatsApp", async () => {
  await a.goto(`${BASE}/admin/enquiries`, { waitUntil: "networkidle" });
  const today = a.locator(".card.mb16");
  const site = today.locator(".row", { hasText: SHOP });
  const sign = today.locator(".row", { hasText: BIZ });
  expect((await site.count()) === 1 && /From the website/.test(await site.innerText()), "website row: " + (await site.count()));
  expect((await sign.count()) === 1 && /Signed up · not paid/.test(await sign.innerText()), "sign-up row");
  expect((await sign.getByRole("link", { name: "WhatsApp" }).getAttribute("href")) === `https://wa.me/91${PHONE2}`, "no WhatsApp link");
  return "both shown";
});

await check(10, "the sign-up's page says not paid and offers a set-up message on WhatsApp", async () => {
  const l = await db.lead.findFirstOrThrow({ where: { shop: BIZ } });
  await a.goto(`${BASE}/admin/enquiries/${l.id}`, { waitUntil: "networkidle" });
  const t = (await a.locator("main, body").first().innerText()).replace(/\s+/g, " ");
  expect(/Signed up · not paid yet/.test(t) && t.includes(EMAIL), "page: " + t.slice(0, 200));
  const href = (await a.getByRole("link", { name: "WhatsApp them" }).getAttribute("href")) ?? "";
  expect(decodeURIComponent(href).includes("Thank you for signing up"), "message: " + href.slice(0, 160));
  return "ok";
});

await check(11, "once their payment is verified the sign-up enquiry is won by itself", async () => {
  const biz = await db.client.findUniqueOrThrow({ where: { name: BIZ } });
  await db.planPurchase.create({ data: { clientId: biz.id, plan: "starter", cycle: "m", amountPaise: 119_900, status: "VERIFIED", method: "ADMIN_RECORD", startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000), decidedAt: new Date(), submittedBy: "QA" } });
  await a.goto(`${BASE}/admin/enquiries`, { waitUntil: "networkidle" });
  const l = await db.lead.findFirstOrThrow({ where: { clientId: biz.id }, include: { activity: { orderBy: { createdAt: "desc" }, take: 1 } } });
  expect(l.stage === "won" && /Paid for the starter plan: won/.test(l.activity[0]?.text ?? ""), `stage ${l.stage} · ${l.activity[0]?.text}`);
  expect((await a.locator(".card.mb16 .row", { hasText: BIZ }).count()) === 0, "still in Follow up today");
  return "won";
});

await check(12, "no browser errors", async () => {
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
