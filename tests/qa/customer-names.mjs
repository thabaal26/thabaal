// Customer names filled in by themselves, against the QA app (tests/qa/serve.mjs): a signed WhatsApp webhook from a
// new number saves their WhatsApp name, and fills one for a customer known only by their number, but never replaces
// a real name; a name staff type on New order, and a "Name: …" line in an address staff save, name a number-only
// customer. Chats then shows the name. Removes what it made.
//   node tests/qa/customer-names.mjs
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
const waitFor = async (fn, ms = 15_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
};

const run = Date.now().toString().slice(-6);
const P = (k) => `9198${run}0${k}`; // 91 + a 10-digit mobile
const [NEW, OLD, REAL, STAFF, ADDR] = ["1", "2", "3", "4", "5"].map(P);
const number = await db.whatsAppNumber.findFirstOrThrow({ where: { clientId: S.shopId }, select: { phoneNumberId: true } });
await db.customer.create({ data: { clientId: S.shopId, phone: OLD, name: `+${OLD}` } });
await db.customer.create({ data: { clientId: S.shopId, phone: REAL, name: "QA Real Name" } });
await db.customer.create({ data: { clientId: S.shopId, phone: STAFF, name: `+${STAFF}` } });
const addrCust = await db.customer.create({ data: { clientId: S.shopId, phone: ADDR, name: `+${ADDR}` } });
const addrOrder = await db.order.create({ data: { ref: `QA-NM-${run}`, clientId: S.shopId, customerId: addrCust.id, status: "CONFIRMED", paymentMethod: "cod", total: 360, items: [{ id: "x", name: "QA Ghee", quantity: 1, price: 300 }], note: "Old address, Madurai" } });
const nameOf = async (phone) => (await db.customer.findUnique({ where: { clientId_phone: { clientId: S.shopId, phone } }, select: { name: true } }))?.name ?? null;
const cleanup = async () => {
  const ids = (await db.customer.findMany({ where: { clientId: S.shopId, phone: { in: [NEW, OLD, REAL, STAFF, ADDR] } }, select: { id: true } })).map((c) => c.id);
  await db.message.deleteMany({ where: { customerId: { in: ids } } });
  await db.reply.deleteMany({ where: { customerId: { in: ids } } });
  await db.order.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
};

/** A text message from `phone` with WhatsApp profile name `profile`, signed like Meta signs it. */
async function hookText(phone, profile, text = "Hai") {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "qa", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: number.phoneNumberId, display_phone_number: "919990001999" }, contacts: [{ wa_id: phone, profile: { name: profile } }], messages: [{ from: phone, id: `wamid.qa.names.${phone}.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }],
  });
  const sig = "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(body).digest("hex");
  const r = await fetch(`${BASE}/api/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
  if (r.status !== 200) throw new Error(`webhook ${r.status}`);
}

await check(1, "a new number writes in: saved with their WhatsApp name (emoji dropped)", async () => {
  await hookText(NEW, "Priya Q 🌼");
  const n = await waitFor(() => nameOf(NEW));
  expect(n === "Priya Q", "name: " + n);
  return n;
});

await check(2, "a customer known only by their number writes again: their WhatsApp name fills in", async () => {
  await hookText(OLD, "Arun M");
  const n = await waitFor(async () => ((await nameOf(OLD)) === "Arun M" ? "Arun M" : null));
  expect(n === "Arun M", "name: " + (await nameOf(OLD)));
  return n;
});

await check(3, "a customer with a real name writes: the name stays", async () => {
  await hookText(REAL, "Someone Else");
  await waitFor(() => db.reply.findFirst({ where: { customer: { phone: REAL, clientId: S.shopId } } }));
  expect((await nameOf(REAL)) === "QA Real Name", "changed to " + (await nameOf(REAL)));
  return "kept";
});

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const m = await ctx.newPage();
m.on("pageerror", (e) => errors.push(String(e.message)));

await check(4, "Chats shows the saved name, not the number", async () => {
  await m.goto(`${BASE}/dashboard/replies`, { waitUntil: "networkidle" });
  const t = await m.locator("body").innerText();
  expect(t.includes("Priya Q") && t.includes("Arun M"), "names not in Chats");
  return "shown";
});

await check(5, "staff type a name on New order for a number-only customer: it becomes their name", async () => {
  await m.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
  await m.locator('button[aria-haspopup="dialog"]', { hasText: "New order" }).first().click();
  await m.fill("#nop", STAFF.slice(2));
  await m.waitForTimeout(1200);
  await m.fill("#noc", "Deepa K");
  await m.selectOption("#nos", "custom");
  await m.fill("#noc2", "QA Jar");
  await m.fill("#nop2", "100");
  await m.click("#noadd");
  await m.getByRole("button", { name: "Save order" }).click();
  const n = await waitFor(async () => ((await nameOf(STAFF)) === "Deepa K" ? "Deepa K" : null));
  expect(n === "Deepa K", "name: " + (await nameOf(STAFF)));
  return n;
});

await check(6, "an address with 'Name: …' saved on a number-only customer's order names them", async () => {
  await m.goto(`${BASE}/dashboard/orders?q=${encodeURIComponent(addrOrder.ref)}`, { waitUntil: "networkidle" });
  const card = m.locator("article.card", { hasText: addrOrder.ref }).first();
  await card.getByRole("button", { name: /^Change$|Add or change address/ }).first().click();
  await card.locator("#ad").fill("Name: Saravanan T, No 9, Lake Road, Sellur, Madurai 625002");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  const n = await waitFor(async () => ((await nameOf(ADDR)) === "Saravanan T" ? "Saravanan T" : null));
  expect(n === "Saravanan T", "name: " + (await nameOf(ADDR)));
  return n;
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
