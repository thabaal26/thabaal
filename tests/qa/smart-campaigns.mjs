// Smart campaign engine on the QA app (lib/engagement-segments.ts): a business's first campaign, Meta's webhooks
// (statuses and a button tap, sent twice), the groups that follow, picking groups in the campaign form, the customer
// list and page, the campaign's response figures, a second business that stays on its first campaign, and a phone.
// Meta is never called: the "campaign" is queued straight into the QA database and Meta's answers are signed webhooks.
//   node tests/qa/smart-campaigns.mjs   (on a fresh `node tests/qa/serve.mjs`)
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
const num = (t) => Number(String(t).replace(/[^\d]/g, "") || 0);
const hmac = (raw) => "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(raw).digest("hex");
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
// The tapper and the held one from the seed; three new customers with no replies or orders: Seen (read) or Reached (delivered).
const seeded = await db.customer.findMany({ where: { clientId: S.shopId, optedOut: false, unreachable: false }, orderBy: { createdAt: "asc" }, take: 2 });
const fresh = [];
for (const k of [1, 2, 3])
  fresh.push(await db.customer.create({ data: { clientId: S.shopId, name: `QA Smart Quiet ${k} ${run}`, phone: `9177${run}${k}`.slice(0, 12), optInSource: "QA", optInAt: new Date() } }));
const [tapper, held] = seeded;
const [reader, delivered, quiet] = fresh;
const customers = [tapper, reader, delivered, held, quiet];
const t = await db.template.findFirstOrThrow({ where: { clientId: S.shopId, category: "MARKETING" } });

await check("First campaign", "Before any campaign: all eligible customers, with who is left out; no made-up groups", async () => {
  expect(!(await db.message.findFirst({ where: { runId: { not: null }, customer: { clientId: S.shopId } } })), "QA shop already has campaign history: start a fresh serve");
  await go(manager, "/dashboard/campaigns/new");
  const box = manager.getByTestId("first-campaign");
  expect(await box.isVisible(), "no first-campaign summary");
  expect((await manager.getByTestId("segment-picker").count()) === 0, "groups shown without history");
  const total = await db.customer.count({ where: { clientId: S.shopId } });
  const text = await box.innerText();
  expect(text.includes(total.toLocaleString("en-IN")), `total ${total} not shown in: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
  return `${total} customers`;
});

// A campaign run as the dispatcher leaves it (Meta accepted 5 messages), then Meta's webhooks.
const camp = await db.campaign.create({ data: { clientId: S.shopId, name: `QA Smart ${run}`, templateId: t.id, scheduleType: "ONCE", active: false } });
const qrun = await db.campaignRun.create({ data: { campaignId: camp.id, scheduledFor: new Date(Date.now() - 3600_000), status: "COMPLETED", total: 5, completedAt: new Date() } });
const wid = (c) => `wamid.qa-smart-${run}-${c.id.slice(-6)}`;
for (const c of customers)
  await db.message.create({ data: { runId: qrun.id, customerId: c.id, templateId: t.id, templateName: t.name, status: "SENT", waMessageId: wid(c), sentAt: new Date(Date.now() - 3000_000), provider: "META" } });

await check("Webhooks", "Delivered, read and failed statuses land once; a button tap keeps which message it answers, sent twice = one", async () => {
  const ts = (min) => String(Math.floor((Date.now() - min * 60_000) / 1000));
  await webhook({ statuses: [tapper, reader, delivered, quiet].map((c) => ({ id: wid(c), status: "delivered", timestamp: ts(40), recipient_id: c.phone })) });
  await webhook({ statuses: [reader, tapper].map((c) => ({ id: wid(c), status: "read", timestamp: ts(30), recipient_id: c.phone })) });
  // Out of order: a late "delivered" after "read" must not undo it.
  await webhook({ statuses: [{ id: wid(reader), status: "delivered", timestamp: ts(35), recipient_id: reader.phone }] });
  await webhook({ statuses: [{ id: wid(held), status: "failed", timestamp: ts(40), recipient_id: held.phone, errors: [{ code: 131049, title: "ecosystem" }] }] });
  const tap = { from: tapper.phone, id: `wamid.qa-tap-${run}`, timestamp: ts(20), type: "button", button: { text: "View Products", payload: "View Products" }, context: { id: wid(tapper), from: "919990001999" } };
  await webhook({ contacts: [{ wa_id: tapper.phone, profile: { name: tapper.name } }], messages: [tap] });
  await webhook({ contacts: [{ wa_id: tapper.phone, profile: { name: tapper.name } }], messages: [tap] });
  const msgs = await db.message.findMany({ where: { runId: qrun.id }, select: { customerId: true, status: true, errorCode: true } });
  const st = Object.fromEntries(msgs.map((m) => [m.customerId, m.status]));
  expect(st[reader.id] === "READ" && st[tapper.id] === "READ" && st[delivered.id] === "DELIVERED" && st[held.id] === "FAILED", `statuses ${JSON.stringify(st)}`);
  const replies = await db.reply.findMany({ where: { waMessageId: tap.id } });
  expect(replies.length === 1 && replies[0].contextId === wid(tapper) && replies[0].kind === "button", `replies ${JSON.stringify(replies.map((r) => [r.kind, r.contextId]))}`);
  return "statuses + 1 tap with context";
});

let engagedN = 0;
let seenN = 0;
let reachedN = 0;
await check("Second campaign", "With history: All eligible + Engaged / Seen / Reached / Dormant with live counts; picking groups gives that many customers", async () => {
  await go(manager, "/dashboard/campaigns/new");
  const picker = manager.getByTestId("segment-picker");
  await picker.waitFor({ timeout: 15000 });
  expect((await manager.getByTestId("first-campaign").count()) === 0, "first-campaign still shown");
  const card = (s) => picker.locator(`[data-segment=${s}]`);
  const keys = await picker.locator("[data-segment]").evaluateAll((els) => els.map((e) => e.dataset.segment).join(","));
  expect(keys === "all,engaged,seen,reached,dormant,new", `cards ${keys}`);
  expect((await card("all").getAttribute("aria-checked")) === "true", "All eligible not picked by default");
  const text = await picker.innerText();
  expect(!/Super active|\bActive\b|Inactive/.test(text.replace(/can be sent now|Always left out/g, "")), `old names on the form: ${text.slice(0, 200)}`);
  // What a send reaches: the "N can be sent now" line when some in the group are left out, else the group's total.
  const sendable = async (s) => {
    const line = card(s).getByTestId(`segment-sendable-${s}`);
    return num(await ((await line.count()) ? line : card(s).getByTestId(`segment-total-${s}`)).innerText());
  };
  engagedN = await sendable("engaged");
  seenN = await sendable("seen");
  reachedN = await sendable("reached");
  expect(engagedN >= 1 && seenN >= 1 && reachedN >= 2, `engaged ${engagedN}, seen ${seenN}, reached ${reachedN}`);
  await card("engaged").click();
  await manager.waitForFunction((n) => /in the groups you picked/.test(document.querySelector("[data-testid=audience-size]")?.textContent ?? "") && document.querySelector("[data-testid=audience-size]")?.textContent?.includes(String(n)), engagedN, { timeout: 15000 });
  await card("seen").click();
  await card("reached").click();
  const want = engagedN + seenN + reachedN;
  await manager.waitForFunction((n) => (document.querySelector("[data-testid=audience-size]")?.textContent ?? "").replace(/,/g, "").includes(`${n} customer`), want, { timeout: 15000 });
  expect(num(await picker.getByTestId("segment-chosen").innerText()) === want, "picked-groups line ≠ audience");
  expect((await card("all").getAttribute("aria-checked")) === "false", "All eligible still ticked");
  await card("all").click();
  expect((await card("engaged").getAttribute("aria-checked")) === "false", "All eligible didn't clear the groups");
  return `engaged ${engagedN} + seen ${seenN} + reached ${reachedN} = ${want}`;
});

await check("Second campaign", "Saving a campaign keeps the picked groups", async () => {
  const c = await db.campaign.findFirstOrThrow({ where: { clientId: S.shopId, name: "QA Weekend offer" } });
  await go(manager, `/dashboard/campaigns/${c.id}`);
  const picker = manager.getByTestId("segment-picker");
  await picker.waitFor();
  await picker.locator("[data-segment=engaged]").click();
  await manager.getByRole("button", { name: "Save changes" }).click();
  await toast(manager, /./);
  const saved = await db.campaign.findUniqueOrThrow({ where: { id: c.id } });
  expect(JSON.stringify(saved.segments) === JSON.stringify(["engaged"]), `segments ${JSON.stringify(saved.segments)}`);
  // An older campaign saved with "active" opens with Seen and Reached ticked: the same people.
  await db.campaign.update({ where: { id: c.id }, data: { segments: ["active"] } });
  await go(manager, `/dashboard/campaigns/${c.id}`);
  const p2 = manager.getByTestId("segment-picker");
  await p2.waitFor();
  const ticked = await p2.locator("[aria-checked=true]").evaluateAll((els) => els.map((e) => e.dataset.segment).join(","));
  expect(ticked === "seen,reached", `old "active" opened as ${ticked}`);
  return "segments [engaged]; old [active] = Seen + Reached";
});

await check("Customers", "The tapper shows Engaged in the list; the reader Seen; a delivered-only one Reached", async () => {
  await go(manager, "/dashboard/customers");
  await manager.getByLabel("Search customers").fill(tapper.name);
  const row = manager.locator("tbody tr").filter({ hasText: tapper.name }).first();
  await row.waitFor();
  expect(await row.locator("[data-segment=engaged]").isVisible(), "no Engaged badge");
  for (const [c, seg] of [[reader, "seen"], [delivered, "reached"]]) {
    await manager.getByLabel("Search customers").fill(c.name);
    const r = manager.locator("tbody tr").filter({ hasText: c.name }).first();
    await r.waitFor();
    expect(await r.locator(`[data-segment=${seg}]`).isVisible(), `${c.name} not ${seg}`);
  }
  return "engaged / seen / reached badges";
});

await check("Customer page", "Campaign response: Engaged, the tap and the delivery in the history", async () => {
  await go(manager, `/dashboard/customers/${tapper.id}`);
  const card = manager.getByTestId("engagement-card");
  expect(await card.locator("[data-segment=engaged]").isVisible(), "no Engaged badge");
  const text = await card.innerText();
  expect(/Tapped a button/.test(text) && /Delivered/.test(text) && /Read/.test(text), `history: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
  await go(manager, `/dashboard/customers/${held.id}`);
  const heldText = await manager.getByTestId("engagement-card").innerText();
  expect(/holding offers back/.test(heldText), "Meta's hold not shown separately");
  return "tap + delivered + read; hold shown apart";
});

await check("Campaign page", "How people responded: sent, delivered, read, failed and the tap", async () => {
  await go(manager, `/dashboard/campaigns/${camp.id}`);
  const text = (await manager.getByTestId("campaign-response").innerText()).replace(/\s+/g, " ");
  for (const [label, n] of [["Sent", 4], ["Delivered", 4], ["Read", 2], ["Failed", 1], ["Tapped a button", 1]]) expect(new RegExp(`${label} ${n}\\b`).test(text), `${label} ≠ ${n}: ${text.slice(0, 220)}`);
  return text.slice(0, 120);
});

await check("Other business", "A second business with no campaigns sees its own first-campaign summary", async () => {
  const other = await as("otherManager");
  await go(other, "/dashboard/campaigns/new");
  const box = other.getByTestId("first-campaign");
  expect(await box.isVisible(), "no first-campaign summary for the other business");
  const own = await db.customer.count({ where: { clientId: S.otherId } });
  const text = await box.innerText();
  expect(text.includes(own.toLocaleString("en-IN")), `shows ${text.replace(/\s+/g, " ").slice(0, 120)}`);
  await other.context().close();
  return `${own} own customers`;
});

await check("Phone", "390px: the groups fit without sideways scroll", async () => {
  const p = await as("manager", { width: 390, height: 844 });
  await go(p, "/dashboard/campaigns/new");
  await p.getByTestId("segment-picker").waitFor();
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, `sideways ${over}px`);
  expect(!p.errors.length, p.errors.join(" | "));
  await p.context().close();
  return "fits";
});

expect(!manager.errors.length, manager.errors.join(" | "));
await browser.close();
await db.$disconnect();
fs.writeFileSync(".git/qa-smart-campaigns.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.area}] ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
