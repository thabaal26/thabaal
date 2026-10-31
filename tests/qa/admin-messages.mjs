// Admin panel › Messages in a real browser against the QA app (tests/qa/serve.mjs): write a payment reminder with
// placeholders and a preview, auto-pay shops left out, send now (a test send: QA has no WhatsApp number), schedule
// and cancel, automatic reminders and quiet hours, and the sent log. Puts the QA shops' phones and settings back.
//   node tests/qa/admin-messages.mjs
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
async function until(fn, ms = 15_000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v || Date.now() - t0 > ms) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
}

const SUB = "sub_QAownerMsgAutoPay";
const started = new Date();
const [shop, other, setting] = await Promise.all([
  db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { name: true, supportPhone: true } }),
  db.client.findUniqueOrThrow({ where: { id: S.otherId }, select: { name: true, supportPhone: true } }),
  db.setting.findUnique({ where: { id: 1 }, select: { ownerMessages: true } }),
]);
const cleanup = async () => {
  await db.ownerMessage.deleteMany({ where: { createdAt: { gte: started } } });
  await db.razorpayRecord.deleteMany({ where: { rzpId: SUB } });
  await db.planPurchase.deleteMany({ where: { utr: { in: [PAY_SHOP, PAY_OTHER] } } });
  await db.client.update({ where: { id: S.shopId }, data: { supportPhone: shop.supportPhone } });
  await db.client.update({ where: { id: S.otherId }, data: { supportPhone: other.supportPhone } });
  await db.setting.update({ where: { id: 1 }, data: { ownerMessages: setting?.ownerMessages ?? Prisma.DbNull } });
};
// Both QA shops get a phone and a Growth/Starter month ending in 3 days; the other shop is on auto-pay.
// Sending is allowed all day for the test.
const PAY_SHOP = "pay_QAownerMsgShop";
const PAY_OTHER = "pay_QAownerMsgOther";
const ends = new Date(Date.now() + 3 * 86_400_000);
const begins = new Date(ends.getTime() - 30 * 86_400_000);
for (const [clientId, plan, utr, amountPaise] of [[S.shopId, "growth", PAY_SHOP, 299900], [S.otherId, "starter", PAY_OTHER, 119900]])
  await db.planPurchase.create({ data: { clientId, plan, cycle: "m", amountPaise, status: "VERIFIED", method: "ADMIN_RECORD", utr, startsAt: begins, endsAt: ends, decidedAt: begins, submittedBy: "QA" } });
await db.client.update({ where: { id: S.shopId }, data: { supportPhone: "9842011223" } });
await db.client.update({ where: { id: S.otherId }, data: { supportPhone: "9842044556" } });
await db.razorpayRecord.create({ data: { kind: "subscription", rzpId: SUB, purpose: "plan", clientId: S.otherId, plan: "starter", cycle: "m", amountPaise: 119900, status: "active", createdBy: "QA" } });
await db.setting.upsert({ where: { id: 1 }, update: { ownerMessages: { quietFrom: "00:00", quietTo: "23:59", skipSundays: false } }, create: { id: 1, ownerMessages: { quietFrom: "00:00", quietTo: "23:59", skipSundays: false } } });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.admin, url: BASE }]);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message)));
p.on("dialog", (d) => d.accept());
const go = (path) => p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 });
async function toast(re, ms = 15_000) {
  await p.locator('[role="status"] > div', { hasText: re }).last().waitFor({ timeout: ms }).catch(() => {});
  return (await p.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ");
}
const pickShops = async (...names) => {
  await p.getByLabel("Who should get it?").selectOption("pick");
  for (const n of names) await p.locator("label.row", { hasText: n }).locator("input[type=checkbox]").check();
};

await check(1, "Messages page: three tabs, no 'phase 2' note, 'Soon' gone from the menu", async () => {
  await go("/admin/messages");
  const t = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  expect(!/phase 2/i.test(t), "phase 2 note");
  for (const tab of ["Send a message", "Automatic messages", "What was sent"]) expect(await p.getByRole("tab", { name: new RegExp(tab) }).count(), `no ${tab} tab`);
  expect(!/Soon/.test(await p.locator("nav.anav a", { hasText: "Messages" }).innerText()), "menu still says Soon");
  return "ok";
});

await check(2, "a payment reminder to both shops: the auto-pay shop is left out; the preview fills in the first shop", async () => {
  await pickShops(shop.name, other.name);
  const count = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  expect(/1 shop will get this · left out: 1 on auto-pay/.test(count), "count: " + (count.match(/\d+ shops? will get this[^.]*/)?.[0] ?? count.slice(0, 200)));
  const prev = await p.getByTestId("preview").innerText();
  expect(
    /^Hello .+, here is an update about your thabaal account\./.test(prev) && prev.includes(shop.name) && /Growth plan/.test(prev) && /₹[\d,]+/.test(prev) && /\d{1,2} [A-Z][a-z]{2} \d{4}/.test(prev),
    "preview: " + prev.replace(/\s+/g, " ").slice(0, 300),
  );
  expect(!prev.includes("{"), "placeholder left in the preview");
  return prev.split("\n")[2]?.slice(0, 90);
});

await check(3, "a typo'd placeholder is flagged and Send now is off", async () => {
  const box = p.locator("#mstx");
  const before = await box.inputValue();
  await box.fill(before + " {shopp}");
  expect(/\{shopp\} can't be filled in/.test(await p.locator("main").innerText()), "no warning");
  expect(await p.getByRole("button", { name: "Send now" }).isDisabled(), "Send now still on");
  await box.fill(before);
  return "flagged";
});

await check(4, "Send now: one copy goes (a test send here), the auto-pay shop's copy is left out", async () => {
  await p.getByRole("button", { name: "Send now" }).click();
  const msg = await toast(/Going to 1 business/);
  expect(/Going to 1 business now\. 1 left out \(on auto-pay\)/.test(msg), "toast: " + msg);
  const row = await until(async () => {
    const r = await db.ownerMessageTo.findFirst({ where: { clientId: S.shopId, message: { createdAt: { gte: started } } } });
    return r?.status === "sent" ? r : null;
  });
  expect(row && row.simulated && row.phone === "919842011223", "not sent: " + JSON.stringify(row && { status: row.status, sim: row.simulated }));
  const skipped = await db.ownerMessageTo.findFirst({ where: { clientId: S.otherId, message: { createdAt: { gte: started } } } });
  expect(skipped?.status === "skipped" && skipped.reason === "on auto-pay", "auto-pay shop: " + JSON.stringify(skipped && { status: skipped.status }));
  return "sent (test), auto-pay left out";
});

await check(5, "Schedule for tomorrow, then cancel it: nothing goes", async () => {
  await go("/admin/messages");
  await p.getByLabel("What kind of message?").selectOption("news");
  await pickShops(shop.name);
  await p.locator("#mstx").fill("Something new in thabaal for {shop}: loyalty points.");
  await p.getByRole("button", { name: "Schedule" }).click();
  const t = new Date(Date.now() + 5.5 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
  await p.getByLabel("Send on").fill(`${t}T10:00`);
  await p.getByRole("button", { name: "Schedule it" }).click();
  expect(/Going to 1 business at/.test(await toast(/Going to 1 business at/)), "not scheduled");
  await go("/admin/messages");
  await p.getByRole("tab", { name: /What was sent/ }).click();
  const row = p.locator("#panel-log tbody tr", { hasText: "loyalty points" }).first();
  expect(/Goes /.test(await row.innerText()), "no 'Goes' result");
  await row.getByRole("button", { name: "Cancel" }).click();
  expect(/Cancelled\. Nothing was sent\./.test(await toast(/Cancelled/)), "not cancelled");
  const m = await db.ownerMessage.findFirstOrThrow({ where: { text: { contains: "loyalty points" }, createdAt: { gte: started } }, include: { to: true } });
  expect(m.status === "cancelled" && m.to.every((x) => x.status === "skipped"), "status " + m.status);
  return "cancelled";
});

await check(6, "What was sent: the reminder shows 1 sent, marked as a test send", async () => {
  await go("/admin/messages");
  await p.getByRole("tab", { name: /What was sent/ }).click();
  const panel = p.locator("#panel-log");
  const kpi = (await panel.locator(".kpi").innerText()).replace(/\s+/g, " ");
  expect(/SENT THIS MONTH \d+/i.test(kpi) && /test sends?, not on WhatsApp/.test(kpi), "kpis: " + kpi);
  const row = panel.locator("tbody tr", { hasText: "ends on" }).first();
  expect(/1 sent/.test(await row.innerText()), "result: " + (await row.innerText()).replace(/\s+/g, " ").slice(0, 160));
  await row.locator("summary").click();
  const det = (await row.innerText()).replace(/\s+/g, " ");
  expect(det.includes(shop.name) && /test send, not on WhatsApp/.test(det) && /on auto-pay/.test(det), "details: " + det.slice(0, 260));
  await p.screenshot({ path: ".git/qa-admin-messages-log.png", fullPage: true });
  return "ok";
});

await check(7, "Automatic messages: switch reminders on and set quiet hours; the template card says the number isn't set up here", async () => {
  await p.getByRole("tab", { name: "Automatic messages" }).click();
  const panel = p.locator("#panel-auto");
  await panel.getByRole("switch", { name: "Payment reminders" }).click();
  await panel.getByRole("switch", { name: "A week later, then stop" }).click();
  await panel.getByLabel("From").fill("09:30");
  await panel.getByLabel("Until").fill("19:00");
  await panel.getByRole("button", { name: "Save" }).click();
  expect(/Automatic payment reminders are on/.test(await toast(/Saved/)), "not saved");
  const s = (await db.setting.findUniqueOrThrow({ where: { id: 1 } })).ownerMessages;
  expect(s?.reminders === true && s.weekLater === true && s.quietFrom === "09:30" && s.quietTo === "19:00", "saved: " + JSON.stringify(s));
  expect(/isn't set up here/.test(await panel.innerText()), "template card");
  await p.screenshot({ path: ".git/qa-admin-messages-auto.png", fullPage: true });
  return JSON.stringify({ reminders: s.reminders, quiet: `${s.quietFrom}-${s.quietTo}` });
});

await check(8, "quiet hours that end before they start are refused", async () => {
  const panel = p.locator("#panel-auto");
  await panel.getByLabel("From").fill("20:00");
  await panel.getByLabel("Until").fill("08:00");
  await panel.getByRole("button", { name: "Save" }).click();
  expect(/must be earlier/.test(await toast(/must be earlier/)), "not refused");
  return "refused";
});

await check(9, "a shop login can't open Messages", async () => {
  const c2 = await browser.newContext();
  await c2.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const m = await c2.newPage();
  await m.goto(`${BASE}/admin/messages`, { waitUntil: "networkidle" });
  const url = m.url();
  await c2.close();
  expect(!url.includes("/admin"), "stayed on " + url);
  return url.replace(BASE, "");
});

await check(10, "no browser errors", async () => {
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
