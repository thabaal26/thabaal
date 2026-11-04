// Automatic replies engine, phase 1, on the QA app (lib/engine): a quick-reply button's saved action set on the template
// page, the admin's mode (off / testing / on), Meta's signed webhooks for taps (sent twice), the two fixed bugs (a call
// permission answer; typed "COD" when the shop takes orders on its main number), and Pause / Resume in Chats.
// Nothing reaches Meta: the QA number has no token, so replies are attempted and refused locally; the checks read the
// QA database (actions, tags, pauses, orders).
//   node tests/qa/automation-engine.mjs   (on a running `node tests/qa/serve.mjs`)
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { Prisma, PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost/.test(S.base) || !/localhost|127\.0\.0\.1/.test(S.dbUrl)) throw new Error("QA only");
const BASE = S.base;
const db = new PrismaClient({ datasources: { db: { url: S.dbUrl } } });
const run = String(Date.now()).slice(-6);
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
async function check(area, name, fn) {
  try {
    results.push({ area, name, pass: true, detail: (await fn()) ?? "" });
  } catch (e) {
    results.push({ area, name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 260) });
  }
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function as(role, viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens[role], url: BASE }]);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e).slice(0, 160)));
  return p;
}
const go = (p, path) => p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
const hmac = (raw) => "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(raw).digest("hex");
const ts = () => String(Math.floor(Date.now() / 1000));
async function webhook(value) {
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "qa-waba-1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "qa-pnid-1" }, ...value } }] }] });
  const r = await fetch(`${BASE}/api/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": hmac(raw) }, body: raw });
  expect(r.ok, `webhook answered ${r.status}`);
}
async function toast(p, re, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const all = await p.locator("[role=status] p").allTextContents().catch(() => []);
    const hit = all.find((t) => re.test(t));
    if (hit) return hit.trim();
    await p.waitForTimeout(250);
  }
  throw new Error(`no message matching ${re}`);
}

const manager = await as("manager");
const admin = await as("admin");
const phone = `9188${run}`.padEnd(12, "1").slice(0, 12);
const cust = await db.customer.create({ data: { clientId: S.shopId, name: `QA Engine ${run}`, phone, optInSource: "QA", optInAt: new Date() } });
const tpl = await db.template.create({
  data: { clientId: S.shopId, businessAccountId: "qa-waba-1", name: `qa_engine_${run}`, category: "MARKETING", status: "APPROVED", language: "en", body: "New stock is in!", buttons: [{ type: "QUICK_REPLY", text: "View Products" }, { type: "QUICK_REPLY", text: "Talk to us" }] },
});
const offer = `wamid.qa-engine-offer-${run}`;
await db.message.create({ data: { customerId: cust.id, templateId: tpl.id, templateName: tpl.name, status: "READ", waMessageId: offer, sentAt: new Date(Date.now() - 600_000) } });
const tap = (text, id) => ({ contacts: [{ wa_id: phone, profile: { name: cust.name } }], messages: [{ from: phone, id, timestamp: ts(), type: "button", button: { text, payload: text }, context: { id: offer, from: "919990001999" } }] });
const shop = await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { automationMode: true, paySettings: true } });

await check("Template", "A manager saves what each quick-reply button does", async () => {
  await go(manager, `/dashboard/templates/${tpl.id}`);
  const card = manager.getByTestId("button-actions");
  await card.waitFor();
  expect(/Automatic actions are off/.test(await card.innerText()), "mode note missing");
  const row = (key) => card.getByTestId(`button-action-${key}`);
  await row("view-products").getByLabel("When tapped").selectOption("tag");
  await row("view-products").getByLabel("Tag").fill("wants-list");
  await row("view-products").getByRole("button", { name: "Save action" }).click();
  await toast(manager, /Saved/);
  await row("talk-to-us").getByLabel("When tapped").selectOption("handoff");
  await row("talk-to-us").getByRole("button", { name: "Save action" }).click();
  let saved = [];
  for (let i = 0; i < 40 && saved.length < 2; i++) {
    await manager.waitForTimeout(250);
    saved = await db.buttonAction.findMany({ where: { templateId: tpl.id }, orderBy: { buttonKey: "asc" } });
  }
  expect(saved.length === 2 && saved[0].action === "handoff" && saved[1].action === "tag" && saved[1].value === "wants-list", `saved ${JSON.stringify(saved.map((s) => [s.buttonKey, s.action, s.value]))}`);
  return "tag + handoff";
});

await check("Off (default)", "With automation off a tap changes nothing new; the same message sent twice is handled once", async () => {
  const id = `wamid.qa-engine-tap0-${run}`;
  await webhook(tap("View Products", id));
  await webhook(tap("View Products", id));
  const c = await db.customer.findUniqueOrThrow({ where: { id: cust.id } });
  expect(!c.tags.includes("wants-list"), "action ran while off");
  expect((await db.engineDecision.count({ where: { inboundId: id } })) === 0, "decision logged while off");
  const claim = await db.inboundEvent.findUnique({ where: { id } });
  expect(claim?.processedAt, "message not claimed/processed");
  expect((await db.reply.count({ where: { waMessageId: id } })) === 1, "reply saved twice");
  return "claimed once, no action";
});

await check("Admin", "The admin turns on testing mode from the client page", async () => {
  await go(admin, `/admin/clients/${S.shopId}`);
  await admin.getByLabel("Automatic actions for button taps").selectOption("shadow");
  await admin.getByLabel("Automatic actions for button taps").locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
  await toast(admin, /Testing/);
  expect((await db.client.findUniqueOrThrow({ where: { id: S.shopId } })).automationMode === "shadow", "mode not saved");
  return "shadow";
});

await check("Testing", "In testing mode the tap is logged with what would happen; the customer is untouched", async () => {
  const id = `wamid.qa-engine-tap1-${run}`;
  await webhook(tap("View Products", id));
  const d = await db.engineDecision.findUnique({ where: { inboundId: id } });
  expect(d && d.action === "tag" && !d.executed && d.mode === "shadow", `decision ${JSON.stringify(d)}`);
  expect(!(await db.customer.findUniqueOrThrow({ where: { id: cust.id } })).tags.includes("wants-list"), "tag added in testing");
  await go(manager, `/dashboard/templates/${tpl.id}`);
  expect(/test only/.test(await manager.getByTestId("engine-decisions").innerText()), "latest taps not shown");
  return "logged, not done";
});

await check("On", "With automation on, taps run the saved actions once (tag; hand to staff pauses replies)", async () => {
  await db.client.update({ where: { id: S.shopId }, data: { automationMode: "engine" } });
  const id = `wamid.qa-engine-tap2-${run}`;
  await webhook(tap("View Products", id));
  await webhook(tap("View Products", id));
  expect((await db.customer.findUniqueOrThrow({ where: { id: cust.id } })).tags.includes("wants-list"), "tag not added");
  expect((await db.engineDecision.findUnique({ where: { inboundId: id } }))?.executed === true, "not executed");
  const id2 = `wamid.qa-engine-tap3-${run}`;
  await webhook(tap("Talk to us", id2));
  const conv = await db.conversation.findUnique({ where: { customerId: cust.id } });
  expect(conv?.pausedUntil && conv.pausedUntil > new Date(), "not paused after hand-over");
  expect((await db.customer.findUniqueOrThrow({ where: { id: cust.id } })).tags.includes("needs-staff"), "no needs-staff tag");
  return "tag + hand-over";
});

await check("Chats", "Staff see automatic replies paused and resume them; then pause them again", async () => {
  await go(manager, `/dashboard/replies?r=${cust.id}`);
  const pill = manager.getByTestId("auto-paused");
  await pill.waitFor({ timeout: 15000 });
  await manager.getByRole("button", { name: "More chat options" }).click();
  await manager.locator(".wa-menu").getByText("Resume automatic replies").click();
  await toast(manager, /on again/);
  const resumed = await db.conversation.findUniqueOrThrow({ where: { customerId: cust.id } });
  expect(!resumed.pausedUntil && resumed.resumedAt, "not resumed");
  await go(manager, `/dashboard/replies?r=${cust.id}`);
  await manager.getByRole("button", { name: "More chat options" }).click();
  await manager.locator(".wa-menu").getByText("Pause automatic replies").click();
  await toast(manager, /paused/);
  const paused = await db.conversation.findUniqueOrThrow({ where: { customerId: cust.id } });
  expect(paused.pausedUntil && paused.pausedUntil.getFullYear() > 2900 && paused.pausedBy, "not paused until resumed");
  return `paused by ${paused.pausedBy}`;
});

await check("Bug fix", "A call-permission answer is saved, with no automatic catalogue or 'please call' reply", async () => {
  await db.conversation.update({ where: { customerId: cust.id }, data: { pausedUntil: null, resumedAt: new Date() } });
  const before = await db.message.count({ where: { customerId: cust.id } });
  const id = `wamid.qa-engine-call-${run}`;
  await webhook({ contacts: [{ wa_id: phone, profile: { name: cust.name } }], messages: [{ from: phone, id, timestamp: ts(), type: "interactive", interactive: { type: "call_permission_reply", call_permission_reply: { response: "accept" } } }] });
  expect((await db.reply.count({ where: { waMessageId: id } })) === 1, "answer not saved");
  expect((await db.message.count({ where: { customerId: cust.id } })) === before, "an automatic reply was attempted");
  return "saved, no reply";
});

await check("Bug fix", "Typed COD doesn't confirm an order when the shop takes orders on its main number", async () => {
  await db.client.update({ where: { id: S.shopId }, data: { paySettings: { ...(shop.paySettings ?? {}), orderPhone: "919990009999", orderBy: "call" } } });
  const order = await db.order.create({ data: { clientId: S.shopId, customerId: cust.id, ref: `QE-${run}`, status: "NEW", total: 500, items: [{ id: "oil", name: "Gingelly oil", quantity: 1, price: 500 }] } });
  await webhook({ contacts: [{ wa_id: phone, profile: { name: cust.name } }], messages: [{ from: phone, id: `wamid.qa-engine-cod-${run}`, timestamp: ts(), type: "text", text: { body: "COD" } }] });
  const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(o.paymentMethod === null && o.status === "NEW", `order became ${o.status}/${o.paymentMethod}`);
  return "order untouched";
});

await check("Phone", "390px: the button actions card fits without sideways scroll", async () => {
  const p = await as("manager", { width: 390, height: 844 });
  await go(p, `/dashboard/templates/${tpl.id}`);
  await p.getByTestId("button-actions").scrollIntoViewIfNeeded();
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, `sideways ${over}px`);
  expect(!p.errors.length, p.errors.join(" | "));
  await p.context().close();
  return "fits";
});

// Put the shop back as it was for other suites.
await db.client.update({ where: { id: S.shopId }, data: { automationMode: shop.automationMode, paySettings: shop.paySettings ?? Prisma.DbNull } });
expect(!manager.errors.length, manager.errors.join(" | "));
await browser.close();
await db.$disconnect();
fs.writeFileSync(".git/qa-automation-engine.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.area}] ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
