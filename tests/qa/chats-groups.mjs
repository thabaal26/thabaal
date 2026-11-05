// Chats › by group (replies/page.tsx + reply-inbox.tsx): one chip row, All · Super active · Active · Inactive (the groups
// the campaign form splits customers into), counted live; no Open / Handled / Sent chips; the row wraps instead of
// scrolling sideways; Mark handled sits under the chat box and Mark order paid doesn't (it's in contact info); a tap
// on WhatsApp moves the customer into Super active; a business without campaigns sees no chips. End to end through
// Meta's signed webhook on the QA app.
//   node tests/qa/chats-groups.mjs   (on a running `node tests/qa/serve.mjs`)
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
    results.push({ name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 240) });
  }
}
const hmac = (raw) => "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(raw).digest("hex");
async function webhook(value) {
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "qa-waba-1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "qa-pnid-1" }, ...value } }] }] });
  const r = await fetch(`${BASE}/api/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": hmac(raw) }, body: raw });
  expect(r.ok, `webhook ${r.status}`);
}
const num = (t) => Number(String(t).replace(/[^\d]/g, "") || 0);

// A campaign reached three new customers an hour ago: Tapper taps a button, Quiet only received it, Moved is moved to
// Inactive by the business.
const t = await db.template.findFirstOrThrow({ where: { clientId: S.shopId, category: "MARKETING" } });
const camp = await db.campaign.create({ data: { clientId: S.shopId, name: `QA Groups ${run}`, templateId: t.id, scheduleType: "ONCE", active: false } });
const qrun = await db.campaignRun.create({ data: { campaignId: camp.id, scheduledFor: new Date(Date.now() - 3600_000), status: "COMPLETED", total: 3, completedAt: new Date() } });
const who = {};
for (const [k, name] of ["Tapper", "Quiet", "Moved"].entries()) {
  const c = await db.customer.create({ data: { clientId: S.shopId, name: `QA Grp ${name} ${run}`, phone: `9133${run}${k}`.slice(0, 12), tags: name === "Moved" ? ["inactive"] : [], optInSource: "QA", optInAt: new Date() } });
  await db.message.create({ data: { runId: qrun.id, customerId: c.id, templateId: t.id, templateName: t.name, status: "DELIVERED", waMessageId: `wamid.qa-grp-${run}-${k}`, sentAt: new Date(Date.now() - 3600_000), deliveredAt: new Date(Date.now() - 3500_000) } });
  who[name] = c;
}
// Tapper also has an unpaid order: the paid button belongs in contact info, not under the chat box.
await db.order.create({ data: { ref: `QA-GRP-${run}`, clientId: S.shopId, customerId: who.Tapper.id, items: [{ id: "QA-001", name: "Groundnut oil 1L", quantity: 1, price: 360 }], total: 360, status: "CONFIRMED", paymentRequestedAt: new Date() } });
const tapNow = (c, k) =>
  webhook({ contacts: [{ wa_id: c.phone, profile: { name: c.name } }], messages: [{ from: c.phone, id: `wamid.qa-grp-tap-${run}-${k}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "button", button: { text: "View Products", payload: "View Products" }, context: { id: `wamid.qa-grp-${run}-${k}` } }] });
await tapNow(who.Tapper, 0);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function as(role, viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens[role], url: BASE }]);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e).slice(0, 160)));
  return p;
}
const m = await as("manager");
const go = (path) => m.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
const names = async () => (await m.locator(".wa-app a[href*='replies?']").allInnerTexts()).join(" | ");
const chip = (g) => m.getByTestId("chat-groups").locator(`[data-group=${g}]`);

await check("One row: All · Super active · Active · Inactive with counts; no Open / Handled / Sent", async () => {
  await go("/dashboard/replies");
  const row = m.getByTestId("chat-groups");
  await row.waitFor();
  const text = await row.innerText();
  const keys = await row.locator("[data-group]").evaluateAll((els) => els.map((e) => e.dataset.group).join(","));
  expect(keys === "all,super,active,inactive", `chips: ${keys}`);
  expect((await chip("all").getAttribute("aria-current")) === "true", "All not marked");
  expect(num(await chip("all").innerText()) === (await m.getByRole("navigation", { name: "Customer conversations" }).getByRole("link").count()), "All count ≠ chats");
  const all = (await m.locator(".wa-list .wa-filters").allInnerTexts()).join(" ");
  expect(!/(Open|Handled|Sent)/.test(all) && (await m.locator(".wa-list .wa-filters").count()) === 1, `status chips: ${all}`);
  expect(num(await chip("super").innerText()) >= 1 && num(await chip("active").innerText()) >= 1 && num(await chip("inactive").innerText()) >= 1, `counts: ${text.replace(/\s+/g, " ")}`);
  return text.replace(/\s+/g, " ");
});

await check("Super active shows the customer who tapped, not the quiet one; the address keeps the group", async () => {
  await chip("super").click();
  await m.waitForURL(/group=super/);
  const list = await names();
  expect(list.includes(who.Tapper.name) && !list.includes(who.Quiet.name), `list: ${list.slice(0, 200)}`);
  expect((await chip("super").getAttribute("aria-current")) === "true", "chip not marked");
  return "tapper only";
});

await check("Opening a chat keeps the group; Mark handled is under the chat box, Mark order paid isn't (contact info has it)", async () => {
  await m.locator(".wa-app a[href*='replies?']", { hasText: who.Tapper.name }).first().click();
  await m.waitForURL(/r=/);
  expect(/group=super/.test(m.url()), `chat link dropped the group: ${m.url()}`);
  const qr = m.locator(".wa-chat .wa-qr").first();
  const quick = await qr.innerText();
  expect(/Mark handled/.test(quick), `no Mark handled under the box: ${quick}`);
  expect(!/Mark order paid|Payment received/.test(quick), `paid button under the box: ${quick}`);
  await m.locator(".wa-who").first().click();
  expect(await m.getByRole("button", { name: "Mark order paid" }).first().isVisible(), "paid button missing in contact info");
  await m.keyboard.press("Escape");
  await qr.getByRole("button", { name: "Mark handled" }).click();
  await m.waitForFunction(() => /Reopen chat/.test(document.querySelector(".wa-chat .wa-qr")?.textContent ?? ""), null, { timeout: 15000 });
  await chip("all").click();
  await m.waitForURL((u) => !/group=/.test(u.toString()));
  return "kept, handled, cleared with All";
});

await check("Active and Inactive: the quiet customer is Active, the moved one Inactive", async () => {
  await go("/dashboard/replies?group=active");
  expect((await names()).includes(who.Quiet.name), "quiet not in Active");
  await go("/dashboard/replies?group=inactive");
  const list = await names();
  expect(list.includes(who.Moved.name) && !list.includes(who.Quiet.name), `inactive list: ${list.slice(0, 200)}`);
  return "active + inactive right";
});

await check("End to end: the quiet customer taps on WhatsApp and moves from Active to Super active", async () => {
  await tapNow(who.Quiet, 1);
  await go("/dashboard/replies?group=super");
  expect((await names()).includes(who.Quiet.name), "not in Super active after the tap");
  await go("/dashboard/replies?group=active");
  expect(!(await names()).includes(who.Quiet.name), "still in Active");
  return "Active → Super active";
});

await check("A business with no campaigns sees no group chips; a made-up group shows every chat", async () => {
  const other = await as("otherManager");
  await other.goto(`${BASE}/dashboard/replies`, { waitUntil: "networkidle" });
  expect((await other.getByTestId("chat-groups").count()) === 0, "chips shown without history");
  await other.context().close();
  await go("/dashboard/replies?group=everything");
  expect((await m.locator(".wa-app a[href*='replies?']").count()) > 0 && (await m.locator("[data-group][aria-current=true]").getAttribute("data-group")) === "all", "unknown group filtered the list");
  return "no chips; unknown group ignored";
});

// Search box on top, the four pills in ONE line under it, lined up with the search box, same height. A wide list shows
// them all (the list is at least 360px beside the chat, so laptops and tablets fit them too); if a list is still too
// narrow (a small phone, big counts) the row scrolls inside the panel with a fade on the hidden side, and the picked
// pill is scrolled into view. The chat beside the list keeps a usable width. The page never scrolls sideways.
const ROW = (el) => {
  const r = el.getBoundingClientRect();
  const s = document.querySelector(".wa-search input").getBoundingClientRect();
  const kids = [...el.querySelectorAll(".wa-f")].map((c) => c.getBoundingClientRect());
  const cur = el.querySelector("[aria-current=true]").getBoundingClientRect();
  return {
    below: r.top >= s.bottom - 1,
    aligned: Math.abs(kids[0].left + el.scrollLeft - s.left) <= 1,
    lines: new Set(kids.map((k) => Math.round(k.top))).size,
    heights: new Set(kids.map((k) => Math.round(k.height))).size,
    scroll: el.scrollWidth - el.clientWidth,
    out: kids.filter((b) => b.right > r.right + 1 || b.left < r.left - 1).length,
    fade: el.dataset.fade ?? "",
    curInView: cur.left >= r.left - 1 && cur.right <= r.right + 1,
    insideList: r.right <= document.querySelector(".wa-list").getBoundingClientRect().right + 1,
    page: document.documentElement.scrollWidth - innerWidth,
    chatW: Math.round(document.querySelector(".wa-chat")?.getBoundingClientRect().width ?? 0),
    listW: Math.round(document.querySelector(".wa-list").getBoundingClientRect().width),
  };
};
for (const [label, vp, path] of [
  ["1920px desktop", { width: 1920, height: 1000 }, ""],
  ["1366px laptop, Inactive picked", { width: 1366, height: 860 }, "?group=inactive"],
  ["1280px laptop", { width: 1280, height: 800 }, ""],
  ["1024px tablet", { width: 1024, height: 768 }, ""],
  ["920px small tablet", { width: 920, height: 1000 }, ""],
  ["768px tablet", { width: 768, height: 1024 }, ""],
  ["390px phone, Inactive picked", { width: 390, height: 844 }, "?group=inactive"],
  ["360px phone", { width: 360, height: 760 }, ""],
])
await check(`${label}: search on top, pills in one line, aligned; hidden pills scroll inside the row only`, async () => {
  const p = await as("manager", vp);
  await p.goto(`${BASE}/dashboard/replies${path}`, { waitUntil: "networkidle" });
  const row = p.getByTestId("chat-groups");
  await row.waitFor();
  const f = await row.evaluate(ROW);
  expect(f.below && f.aligned && f.lines === 1 && f.heights === 1, `layout ${JSON.stringify(f)}`);
  expect(f.insideList && f.page <= 1, `overflow ${JSON.stringify(f)}`);
  expect(f.curInView, `picked pill hidden ${JSON.stringify(f)}`);
  if (f.scroll > 1) expect(f.fade === "end" || f.fade === "start" || f.fade === "both", `scrolls ${f.scroll}px but no fade`);
  else expect(f.out === 0 && f.fade === "", `fits but ${JSON.stringify(f)}`);
  // 1024-1279px (side menu + chat) keeps the 280px list: the pills scroll there, the chat keeps its room.
  const roomy = vp.width >= 1280 || (vp.width > 900 && vp.width < 1024);
  if (roomy || vp.width === 768) expect(f.scroll <= 1, `list ${f.listW}px still scrolls ${f.scroll}px`);
  if (roomy) expect(f.listW >= 360 && f.chatW >= 480, `list ${f.listW}px, chat ${f.chatW}px`);
  if (vp.width >= 1024 && vp.width < 1280) expect(f.chatW >= 380, `chat squeezed to ${f.chatW}px`);
  expect(!p.errors.length, p.errors.join(" | "));
  await p.context().close();
  return `${f.scroll > 1 ? `scrolls ${f.scroll}px in the row, fade ${f.fade}` : "all four in view"} · list ${f.listW}px${vp.width > 900 ? `, chat ${f.chatW}px` : ""}`;
});

expect(!m.errors.length, m.errors.join(" | "));
await browser.close();
await db.$disconnect();
fs.writeFileSync(".git/qa-chats-groups.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
