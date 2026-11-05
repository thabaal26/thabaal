// Engaged / Seen / Reached / Dormant, live, end to end (lib/engagement-segments.ts + /api/chats-live + Chats + the
// campaign form): Meta's signed webhooks arrive while Chats and the campaign form are open in the browser, and both
// move the customer and its counts by themselves, with no reload:
//   delivered → Reached; read → Seen; a tap → Engaged; a direct reply → Engaged;
//   a repeated delivered/read changes nothing; a late "delivered" after "read" doesn't undo it; a failed send is never
//   Reached; and another business's screens and counts don't move.
//   node tests/qa/segments-live.mjs   (on a running `node tests/qa/serve.mjs`)
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
async function check(name, fn) {
  try {
    results.push({ name, pass: true, detail: (await fn()) ?? "" });
  } catch (e) {
    results.push({ name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 260) });
  }
}
const hmac = (raw) => "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(raw).digest("hex");
async function webhook(value) {
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "qa-waba-1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "qa-pnid-1" }, ...value } }] }] });
  const r = await fetch(`${BASE}/api/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": hmac(raw) }, body: raw });
  expect(r.ok, `webhook ${r.status}`);
}
const num = (t) => Number(String(t).replace(/[^\d]/g, "") || 0);
const ts = (min = 0) => String(Math.floor((Date.now() - min * 60_000) / 1000));

// A campaign Meta accepted an hour ago for three new customers (status SENT: nothing confirmed yet).
const t = await db.template.findFirstOrThrow({ where: { clientId: S.shopId, category: "MARKETING" } });
const camp = await db.campaign.create({ data: { clientId: S.shopId, name: `QA Live ${run}`, templateId: t.id, scheduleType: "ONCE", active: false } });
const qrun = await db.campaignRun.create({ data: { campaignId: camp.id, scheduledFor: new Date(Date.now() - 3600_000), status: "COMPLETED", total: 3, completedAt: new Date() } });
const who = {};
for (const [k, name] of ["Rina", "Ravi", "Fail"].entries()) {
  const c = await db.customer.create({ data: { clientId: S.shopId, name: `QA Live ${name} ${run}`, phone: `9144${run}${k}`.slice(0, 12), optInSource: "QA", optInAt: new Date() } });
  await db.message.create({ data: { runId: qrun.id, customerId: c.id, templateId: t.id, templateName: t.name, status: "SENT", waMessageId: `wamid.qa-live-${run}-${k}`, sentAt: new Date(Date.now() - 3600_000), provider: "META" } });
  who[name] = { ...c, wid: `wamid.qa-live-${run}-${k}` };
}
const status = (c, st, min = 0, extra = {}) => ({ id: c.wid, status: st, timestamp: ts(min), recipient_id: c.phone, ...extra });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function as(role) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens[role], url: BASE }]);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e).slice(0, 160)));
  return p;
}
const chats = await as("manager");
const form = await chats.context().newPage();
form.errors = [];
form.on("pageerror", (e) => form.errors.push(String(e).slice(0, 160)));
await chats.goto(`${BASE}/dashboard/replies`, { waitUntil: "networkidle" });
await form.goto(`${BASE}/dashboard/campaigns/new`, { waitUntil: "networkidle" });
await chats.getByTestId("chat-groups").waitFor();
await form.getByTestId("segment-picker").waitFor();

const G = ["engaged", "seen", "reached", "dormant"];
const chatCounts = () =>
  chats.evaluate((g) => Object.fromEntries(g.map((k) => [k, Number((document.querySelector(`[data-testid=chat-groups] [data-group=${k}] small`)?.textContent ?? "").replace(/[^\d]/g, "") || 0)])), G);
const formCounts = () =>
  form.evaluate((g) => Object.fromEntries(g.map((k) => [k, Number((document.querySelector(`[data-testid=segment-total-${k}]`)?.textContent ?? "").replace(/[^\d]/g, "") || 0)])), G);
/** Waits (no reload) until both open screens show these changes from the counts before. */
async function bothMove(before, delta, label) {
  const want = (b) => Object.fromEntries(G.map((k) => [k, b[k] + (delta[k] ?? 0)]));
  const same = (a, b) => G.every((k) => a[k] === b[k]);
  const [wc, wf] = [want(before.c), want(before.f)];
  const deadline = Date.now() + 40_000;
  let c, f;
  while (Date.now() < deadline) {
    [c, f] = [await chatCounts(), await formCounts()];
    if (same(c, wc) && same(f, wf)) return { c, f };
    await chats.waitForTimeout(1000);
  }
  throw new Error(`${label}: Chats ${JSON.stringify(c)} want ${JSON.stringify(wc)} · form ${JSON.stringify(f)} want ${JSON.stringify(wf)}`);
}
const snap = async () => ({ c: await chatCounts(), f: await formCounts() });
const steady = async (before, label, ms = 14_000) => {
  await chats.waitForTimeout(ms);
  const now = await snap();
  expect(G.every((k) => now.c[k] === before.c[k] && now.f[k] === before.f[k]), `${label}: counts moved ${JSON.stringify(before)} → ${JSON.stringify(now)}`);
  return now;
};

// The other business: its live fingerprint and campaign form must not move while the shop's events arrive.
const other = await as("otherManager");
const otherStamp = async () => (await (await other.request.get(`${BASE}/api/chats-live`)).json()).v;
await other.goto(`${BASE}/dashboard/campaigns/new`, { waitUntil: "networkidle" });
const otherText0 = (await other.locator("[data-testid=first-campaign], [data-testid=segment-picker]").first().innerText()).replace(/\s+/g, " ");
const otherV0 = await otherStamp();

let s0 = await snap();
await check("Delivered: both new customers move into Reached on Chats and on the campaign form, no reload", async () => {
  await webhook({ statuses: [status(who.Rina, "delivered", 30), status(who.Ravi, "delivered", 30)] });
  s0 = await bothMove(s0, { reached: 2 }, "delivered");
  return `Reached +2 · Chats ${JSON.stringify(s0.c)}`;
});

await check("The same delivered webhook again changes nothing", async () => {
  await webhook({ statuses: [status(who.Rina, "delivered", 30), status(who.Ravi, "delivered", 30)] });
  s0 = await steady(s0, "duplicate delivered");
  return "steady";
});

await check("Read: Rina moves Reached → Seen on both screens", async () => {
  await webhook({ statuses: [status(who.Rina, "read", 20)] });
  s0 = await bothMove(s0, { reached: -1, seen: 1 }, "read");
  return `Reached −1, Seen +1`;
});

await check("A repeated read and a late delivered (out of order) don't move Rina back or count twice", async () => {
  await webhook({ statuses: [status(who.Rina, "read", 20)] });
  await webhook({ statuses: [status(who.Rina, "delivered", 25)] });
  const m = await db.message.findFirstOrThrow({ where: { waMessageId: who.Rina.wid } });
  expect(m.status === "READ", `message went back to ${m.status}`);
  s0 = await steady(s0, "duplicate read / late delivered");
  return "still Seen, counts steady";
});

await check("A tap on the offer (Meta's context.id): Rina moves Seen → Engaged", async () => {
  await webhook({
    contacts: [{ wa_id: who.Rina.phone, profile: { name: who.Rina.name } }],
    messages: [{ from: who.Rina.phone, id: `wamid.qa-live-tap-${run}`, timestamp: ts(), type: "button", button: { text: "View Products", payload: "View Products" }, context: { id: who.Rina.wid } }],
  });
  s0 = await bothMove(s0, { seen: -1, engaged: 1 }, "tap");
  const rep = await db.reply.findFirstOrThrow({ where: { waMessageId: `wamid.qa-live-tap-${run}` } });
  expect(rep.kind === "button" && rep.contextId === who.Rina.wid, `tap stored as ${rep.kind} / ${rep.contextId}`);
  return "Seen −1, Engaged +1; kept as a button tap on that message";
});

await check("A direct text reply: Ravi moves Reached → Engaged (kept as a reply, not a tap)", async () => {
  await webhook({
    contacts: [{ wa_id: who.Ravi.phone, profile: { name: who.Ravi.name } }],
    messages: [{ from: who.Ravi.phone, id: `wamid.qa-live-txt-${run}`, timestamp: ts(), type: "text", text: { body: "Price of groundnut oil?" } }],
  });
  s0 = await bothMove(s0, { reached: -1, engaged: 1 }, "reply");
  const rep = await db.reply.findFirstOrThrow({ where: { waMessageId: `wamid.qa-live-txt-${run}` } });
  expect(rep.kind === "text", `reply stored as ${rep.kind}`);
  return "Reached −1, Engaged +1";
});

await check("The same tap webhook twice: one reply, Engaged counted once", async () => {
  await webhook({
    contacts: [{ wa_id: who.Rina.phone, profile: { name: who.Rina.name } }],
    messages: [{ from: who.Rina.phone, id: `wamid.qa-live-tap-${run}`, timestamp: ts(), type: "button", button: { text: "View Products", payload: "View Products" }, context: { id: who.Rina.wid } }],
  });
  expect((await db.reply.count({ where: { waMessageId: `wamid.qa-live-tap-${run}` } })) === 1, "duplicate reply stored");
  s0 = await steady(s0, "duplicate tap");
  return "one reply, steady";
});

await check("A failed send is never Reached (or Dormant): counts don't move, the customer stays 'Not reached yet'", async () => {
  const newBefore = num(await form.getByTestId("segment-total-new").innerText());
  await webhook({ statuses: [status(who.Fail, "failed", 10, { errors: [{ code: 131026, title: "Message undeliverable" }] })] });
  s0 = await steady(s0, "failed");
  const m = await db.message.findFirstOrThrow({ where: { waMessageId: who.Fail.wid } });
  expect(m.status === "FAILED", `status ${m.status}`);
  const newAfter = num(await form.getByTestId("segment-total-new").innerText());
  expect(newAfter === newBefore, `Not reached yet ${newBefore} → ${newAfter}`);
  await chats.goto(`${BASE}/dashboard/replies?group=reached`, { waitUntil: "networkidle" });
  const list = (await chats.getByRole("navigation", { name: "Customer conversations" }).innerText()).replace(/\s+/g, " ");
  expect(!list.includes(who.Fail.name), "failed customer listed under Reached");
  return "failed kept out of Reached and Dormant";
});

await check("Chats counts equal the lists: each group's chip = the chats shown under it", async () => {
  const out = [];
  for (const g of G) {
    await chats.goto(`${BASE}/dashboard/replies?group=${g}`, { waitUntil: "networkidle" });
    const chip = num(await chats.locator(`[data-testid=chat-groups] [data-group=${g}] small`).innerText());
    const rows = await chats.getByRole("navigation", { name: "Customer conversations" }).getByRole("link").count();
    expect(chip === rows, `${g}: chip ${chip}, list ${rows}`);
    out.push(`${g} ${chip}`);
  }
  return out.join(" · ");
});

await check("Another business: its live check and campaign form didn't move; it never sees these customers", async () => {
  expect((await otherStamp()) === otherV0, "the other business's live fingerprint changed");
  await other.reload({ waitUntil: "networkidle" });
  const now = (await other.locator("[data-testid=first-campaign], [data-testid=segment-picker]").first().innerText()).replace(/\s+/g, " ");
  expect(now === otherText0, `other business's form changed: ${otherText0.slice(0, 120)} → ${now.slice(0, 120)}`);
  await other.goto(`${BASE}/dashboard/replies`, { waitUntil: "networkidle" });
  const text = await other.locator("body").innerText();
  expect(!text.includes(who.Rina.name) && !text.includes(who.Ravi.name), "the shop's customers shown to another business");
  return "isolated";
});

expect(!chats.errors.length && !form.errors.length, [...chats.errors, ...form.errors].join(" | "));
await browser.close();
await db.$disconnect();
fs.writeFileSync(".git/qa-segments-live.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
