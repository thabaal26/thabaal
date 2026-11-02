// Campaign people and sent chats, in a real browser against the QA app (tests/qa/serve.mjs): customers we messaged
// who haven't written back show in Chats (All and Sent) with "You sent:" and the message status, and open with our
// message in the conversation; the campaign form adds a person, leaves one out, leaves out the test numbers in one
// tap, and can leave out people who don't open offers, all saved on the campaign. Removes what it made.
//   node tests/qa/campaign-people.mjs
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
const mk = (k, name, tags = []) => db.customer.create({ data: { clientId: S.shopId, phone: `9193${run}${k}`, name, tags } });
const sentOnly = await mk("01", `Sent Only ${run}`);
const added = await mk("02", `Hand Added ${run}`, ["qa-nobody"]);
const left = await mk("03", `Left Out ${run}`);
const tester = await mk("04", `Tester ${run}`, ["test"]);
const tpl = await db.template.findFirstOrThrow({ where: { clientId: S.shopId, status: "APPROVED", category: "MARKETING" } });
await db.message.create({ data: { customerId: sentOnly.id, templateId: tpl.id, templateName: tpl.name, status: "DELIVERED", sentAt: new Date(), body: "QA poster offer" } });
let campaignId = null;
let stoppedId = null;
let reachId = null;
const cleanup = async () => {
  if (campaignId) await db.campaign.delete({ where: { id: campaignId } }).catch(() => {});
  if (reachId) await db.campaign.delete({ where: { id: reachId } }).catch(() => {});
  const ids = [sentOnly.id, added.id, left.id, tester.id];
  await db.message.deleteMany({ where: { customerId: { in: ids } } });
  if (stoppedId) {
    await db.campaignRun.deleteMany({ where: { campaignId: stoppedId } });
    await db.campaign.delete({ where: { id: stoppedId } }).catch(() => {});
  }
  await db.customer.deleteMany({ where: { id: { in: ids } } });
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const toast = async () => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" | ");

try {
  await check(1, "Chats › Sent lists a customer we messaged who hasn't written, with 'You sent:' and the status", async () => {
    await page.goto(`${BASE}/dashboard/replies?show=sent`, { waitUntil: "networkidle" });
    const list = page.getByRole("navigation", { name: "Customer conversations" });
    const row = list.getByRole("link", { name: new RegExp(sentOnly.name) });
    expect(await row.count(), "not in Sent");
    const text = await row.innerText();
    expect(/You sent:/.test(text) && /Delivered/.test(text), `row: ${text}`);
    expect(!/Handled/.test(text), "marked handled");
    await page.goto(`${BASE}/dashboard/replies`, { waitUntil: "networkidle" });
    expect(await list.getByRole("link", { name: new RegExp(sentOnly.name) }).count(), "not in All");
    return text.replace(/\s+/g, " ");
  });

  await check(2, "opening it shows our message in the conversation", async () => {
    await page.goto(`${BASE}/dashboard/replies?r=${sentOnly.id}`, { waitUntil: "networkidle" });
    const convo = page.getByRole("region", { name: new RegExp(`Conversation with ${sentOnly.name}`) });
    const text = await convo.innerText();
    expect(/QA poster offer/.test(text), "our message not shown");
    expect(!errors.length, `script error: ${errors[0]}`);
    return "shown";
  });

  await check(3, "campaign form: add a person, leave one out, leave out test numbers, skip people who don't open offers; saved", async () => {
    await page.goto(`${BASE}/dashboard/campaigns/new`, { waitUntil: "networkidle" });
    await page.locator("#cname").fill(`QA people ${run}`);
    const box = page.getByTestId("campaign-people");
    const row = (name) => box.getByRole("listitem").filter({ hasText: name });
    await box.locator("#people-q").fill(`Hand Added ${run}`);
    await row(`Hand Added ${run}`).getByRole("button", { name: "Add", exact: true }).click();
    await box.locator("#people-q").fill(`Left Out ${run}`);
    await row(`Left Out ${run}`).getByRole("button", { name: "Leave out", exact: true }).click();
    await page.waitForTimeout(800);
    const testBtn = box.getByRole("button", { name: /Leave out test numbers/ });
    await testBtn.waitFor({ timeout: 10_000 });
    await testBtn.click();
    expect(/Added[\s\S]*Hand Added/.test(await box.innerText()) && /Left out[\s\S]*Left Out[\s\S]*Tester/.test(await box.innerText()), `chips: ${await box.innerText()}`);
    await page.getByText("Leave out people who didn't open their last 3 offers").click();
    await page.getByRole("button", { name: "Create campaign" }).last().click();
    await page.waitForURL(/\/dashboard\/campaigns\/(?!new)/, { timeout: 20_000 }).catch(() => {});
    const c = await db.campaign.findFirst({ where: { clientId: S.shopId, name: `QA people ${run}` } });
    expect(c, `not saved: ${await toast()}`);
    campaignId = c.id;
    expect(c.includeIds.includes(added.id), "added not saved");
    expect(c.excludeIds.includes(left.id) && c.excludeIds.includes(tester.id), `left out ${c.excludeIds}`);
    expect(c.skipUnread, "unread rule not saved");
    // The saved campaign shows the chips again by name.
    const again = await page.getByTestId("campaign-people").innerText();
    expect(/Hand Added/.test(again) && /Left Out/.test(again), `after save: ${again}`);
    await page.screenshot({ path: ".git/shots-campaign-people.png", fullPage: false });
    return `${c.includeIds.length} added, ${c.excludeIds.length} left out`;
  });

  await check(4, "'Who is left out automatically' explains the Meta reasons", async () => {
    await page.getByText("Who is left out automatically, and why").click();
    const t = await page.locator("details").filter({ hasText: "Who is left out" }).innerText();
    expect(/131026/.test(t) && /131050/.test(t) && /131049/.test(t), t.slice(0, 200));
    expect(!errors.length, `script error: ${errors[0]}`);
    return "131026 · 131050 · 131049";
  });

  await check(5, "failures: a simple reason each, 'send again' after 24 h, and Move to Inactive (which works)", async () => {
    const c = await db.campaign.create({ data: { clientId: S.shopId, name: `QA failed ${run}`, templateId: tpl.id, scheduleType: "ONCE", active: false } });
    stoppedId = c.id;
    const ago = new Date(Date.now() - 30 * 3_600_000);
    const r = await db.campaignRun.create({ data: { campaignId: c.id, scheduledFor: ago, status: "CANCELLED", total: 3 } });
    for (const [who, code] of [[left, 131026], [added, 131049], [tester, 130472]])
      await db.message.create({ data: { runId: r.id, customerId: who.id, templateId: tpl.id, templateName: tpl.name, status: "FAILED", errorCode: code, failedAt: ago, sentAt: ago } });
    await page.goto(`${BASE}/dashboard/campaigns/${c.id}`, { waitUntil: "networkidle" });
    const held = page.getByTestId("failure-held");
    await held.waitFor({ timeout: 10_000 });
    expect(/can be sent again now/.test(await held.innerText()), await held.innerText());
    expect(await held.getByRole("button", { name: "Send again to 1" }).count(), "no Send again button");
    const gone = page.getByTestId("failure-unreachable");
    expect(/Sending again is a waste/.test(await gone.innerText()), await gone.innerText());
    expect(/Sending again is a waste/.test(await page.getByTestId("failure-experiment").innerText()), "experiment line");
    await page.screenshot({ path: ".git/shots-failure-suggestions.png", fullPage: false });
    await gone.getByRole("button", { name: "Move 1 to Inactive" }).click();
    await page.getByRole("button", { name: "Yes, continue" }).click();
    await page.waitForTimeout(2500);
    const tags = (await db.customer.findUnique({ where: { id: left.id } })).tags;
    expect(tags.includes("inactive"), `tags ${tags}: ${await toast()}`);
    expect(/All of them are in Inactive/.test(await page.getByTestId("failure-unreachable").innerText()), "card not updated");
    expect(!errors.length, `script error: ${errors[0]}`);
    return "reasons · send again · moved to Inactive";
  });

  await check(6, "a scheduled campaign card counts only who it will really reach", async () => {
    const at = new Date(Date.now() + 3 * 3_600_000);
    const c = await db.campaign.create({ data: { clientId: S.shopId, name: `QA reach ${run}`, templateId: tpl.id, scheduleType: "ONCE", runAt: at, nextRunAt: at, active: true } });
    reachId = c.id;
    await page.goto(`${BASE}/dashboard/campaigns`, { waitUntil: "networkidle" });
    const card = page.locator("article").filter({ hasText: `QA reach ${run}` });
    const text = await card.innerText();
    expect(/more are left out: they already got it, got an offer recently, or Meta held one back/.test(text), text.slice(0, 300));
    return text.split("\n").filter((l) => /Will go to|left out/.test(l)).join(" · ");
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
