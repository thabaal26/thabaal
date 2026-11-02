// Speed part 2 against the QA app (tests/qa/serve.mjs), in a real browser: Home (with and without filters), Reports,
// Campaigns and Settings still show their figures now that they read in fewer rounds; Home's WhatsApp spend card
// works out the balance from a Billing Hub figure; a webhook carrying several messages saves each one for the right
// customer (each message has its own memo). Removes what it made.
//   node tests/qa/speed-pages.mjs
import crypto from "node:crypto";
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
const phones = ["1", "2"].map((k) => `9196${run}0${k}`);
const sync = await db.topUp.create({ data: { clientId: S.shopId, amount: 1234, note: "[META_SYNC] QA speed check", addedBy: "QA", createdAt: new Date(Date.now() - 60_000) } });
const cleanup = async () => {
  await db.topUp.delete({ where: { id: sync.id } }).catch(() => {});
  const ids = (await db.customer.findMany({ where: { clientId: S.shopId, phone: { in: phones } }, select: { id: true } })).map((c) => c.id);
  await db.message.deleteMany({ where: { customerId: { in: ids } } });
  await db.reply.deleteMany({ where: { customerId: { in: ids } } });
  await db.order.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const open = async (path) => {
  errors.length = 0;
  const r = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  expect(r?.status() === 200, `${path} ${r?.status()}`);
  const text = await page.locator("body").innerText();
  for (const bad of ["undefined", "NaN", "[object Object]", "Application error"]) expect(!text.includes(bad), `${path} shows "${bad}"`);
  expect(!errors.length, `${path} script error: ${errors[0]}`);
  return text;
};

try {
  await check(1, "Home: today's figures and the WhatsApp spend card, balance from the Billing Hub figure", async () => {
    const t = await open("/dashboard");
    expect(/WhatsApp spend/i.test(t), "no WhatsApp spend card");
    expect(/Balance/.test(t), "no balance on the spend card");
    expect(/₹1,2\d\d|₹1,1\d\d/.test(t), "balance is not worked out from ₹1,234");
    return "spend card with balance";
  });

  await check(2, "Home for other periods (all time, today, custom dates): the figures still load", async () => {
    await open("/dashboard?range=all");
    await open("/dashboard?range=today");
    await open("/dashboard?from=2026-10-01&to=2026-10-31");
    return "all, today, October";
  });

  await check(3, "Reports: month and week figures, funnel and spend", async () => {
    const t = await open("/dashboard/report");
    expect(/Messages sent/i.test(t), "no funnel");
    expect(/this month|this week/i.test(t), "no period figures");
    return "report ok";
  });

  await check(4, "Campaigns and Settings (both read the spend summary) open without problems", async () => {
    await open("/dashboard/campaigns");
    await open("/dashboard/settings");
    return "ok";
  });

  await check(5, "one webhook with several messages: each saved for the right customer, none lost", async () => {
    const number = await db.whatsAppNumber.findFirstOrThrow({ where: { clientId: S.shopId }, select: { phoneNumberId: true } });
    const msg = (from, text, k) => ({ from, id: `wamid.qa.speed.${from}.${k}.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } });
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "qa", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: number.phoneNumberId, display_phone_number: "919990001999" }, contacts: phones.map((p, i) => ({ wa_id: p, profile: { name: `Speed ${i ? "Bala" : "Anu"}` } })), messages: [msg(phones[0], "Hi", 1), msg(phones[1], "Hello", 2), msg(phones[0], "price list please", 3)] } }] }],
    });
    const sig = "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(body).digest("hex");
    const r = await fetch(`${BASE}/api/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
    expect(r.status === 200, `webhook ${r.status}`);
    const rows = await db.reply.findMany({ where: { customer: { clientId: S.shopId, phone: { in: phones } } }, select: { text: true, customer: { select: { phone: true, name: true } } } });
    const of = (p) => rows.filter((x) => x.customer.phone === p).map((x) => x.text).sort();
    expect(JSON.stringify(of(phones[0])) === JSON.stringify(["Hi", "price list please"]), `first: ${of(phones[0])}`);
    expect(JSON.stringify(of(phones[1])) === JSON.stringify(["Hello"]), `second: ${of(phones[1])}`);
    const names = [...new Set(rows.map((x) => x.customer.name))].sort();
    expect(JSON.stringify(names) === JSON.stringify(["Speed Anu", "Speed Bala"]), `names: ${names}`);
    return "3 messages, 2 customers";
  });

  await check(6, "Chats shows the new customers' messages", async () => {
    const t = await open("/dashboard/replies");
    expect(/Speed Anu/.test(t) && /Speed Bala/.test(t), "new chats not listed");
    return "listed";
  });
} finally {
  await browser.close();
  await cleanup();
  await db.$disconnect();
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
