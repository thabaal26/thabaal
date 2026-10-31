// Admin panel › Enquiries in a real browser against the QA app (tests/qa/serve.mjs): add an enquiry, follow up today,
// log a call with the next follow-up, move it along the pipeline, mark it won and make it a business; filters and
// insights. Adds QA enquiries and one QA business, and removes them at the end.
//   node tests/qa/admin-leads.mjs
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
    results.push({ no, name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 300) });
  }
}

const run = Date.now().toString().slice(-5);
const SHOP = `QA Lead Ganesh Oils ${run}`;
const PHONE = `98420${run}`;
const cleanup = async () => {
  const leads = await db.lead.findMany({ where: { shop: { startsWith: "QA Lead" } }, select: { clientId: true } });
  await db.lead.deleteMany({ where: { shop: { startsWith: "QA Lead" } } });
  await db.client.deleteMany({ where: { id: { in: leads.map((l) => l.clientId).filter(Boolean) } } });
};
await cleanup();

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.admin, url: BASE }]);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message)));
const go = (path) => p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 });
const main = async () => (await p.locator("main").innerText()).replace(/\s+/g, " ");
async function toast(re, ms = 15_000) {
  const t = p.locator('[role="status"] > div', { hasText: re }).last();
  await t.waitFor({ timeout: ms }).catch(() => {});
  return (await p.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ");
}
const tomorrow = new Date(Date.now() + 86_400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
let leadId = "";

await check(1, "Enquiries page: real pipeline, no 'phase 2' note, 'Soon' gone from the menu", async () => {
  await go("/admin/enquiries");
  const t = await main();
  expect(!/phase 2/i.test(t), "phase 2 note still there");
  expect(/Open enquiries/i.test(t) && /Waiting on you/i.test(t), "KPIs missing");
  const nav = (await p.locator("nav.anav a", { hasText: "Enquiries" }).innerText()).replace(/\s+/g, " ");
  expect(!/Soon/.test(nav), "menu still says Soon");
  for (const s of ["New enquiry", "Contacted", "Demo booked", "Price sent", "Won", "Lost"]) expect(t.includes(s), `no ${s} column`);
  return "ok";
});

await check(2, "Add an enquiry: saved, opens the enquiry, and it is in Follow up today", async () => {
  await p.getByRole("button", { name: "Add an enquiry" }).first().click();
  const d = p.locator("dialog[open]");
  await d.getByLabel("Shop name").fill(SHOP);
  await d.getByLabel("Owner").fill("S. Ganesan");
  await d.getByLabel("Phone").fill(`+91 ${PHONE}`);
  await d.getByLabel("Town").fill("Virudhunagar");
  await d.getByLabel("What do they sell?").fill("Cooking oil, wholesale");
  await d.getByLabel("Where from").selectOption("Referral");
  await d.getByLabel("Plan they asked about").selectOption("growth");
  await d.getByLabel("What did they ask for?").fill("Asked how orders move from WhatsApp to a bill.");
  await d.getByRole("button", { name: "Add the enquiry" }).click();
  expect(/waiting in New enquiry/.test(await toast(/waiting in New enquiry/)), "no toast");
  await p.waitForURL(/\/admin\/enquiries\/[a-z0-9]+$/, { timeout: 15_000 });
  leadId = p.url().split("/").pop();
  const row = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  expect(row.phone === PHONE && row.stage === "new" && row.source === "Referral" && row.ownerId, "saved: " + JSON.stringify({ phone: row.phone, stage: row.stage }));
  await go("/admin/enquiries");
  const today = (await p.locator(".card", { has: p.getByRole("heading", { name: /Follow up today|Nothing waiting today/ }) }).first().innerText()).replace(/\s+/g, " ");
  expect(today.includes(SHOP) && /due today/.test(today), "not in Follow up today: " + today.slice(0, 200));
  const col = (await p.locator(".col", { hasText: "New enquiry" }).first().innerText()).replace(/\s+/g, " ");
  expect(col.includes(SHOP), "not on the board");
  await p.screenshot({ path: ".git/qa-admin-leads.png", fullPage: true });
  return leadId;
});

await check(3, "the same phone number can't be added twice while open", async () => {
  await p.getByRole("button", { name: "Add an enquiry" }).first().click();
  const d = p.locator("dialog[open]");
  await d.getByLabel("Shop name").fill("QA Lead duplicate");
  await d.getByLabel("Phone").fill(PHONE);
  await d.getByRole("button", { name: "Add the enquiry" }).click();
  const msg = await toast(/already has an open enquiry/);
  expect(/already has an open enquiry/.test(msg), "toast: " + msg);
  await d.getByRole("button", { name: "Cancel" }).click();
  expect((await db.lead.count({ where: { phone: PHONE } })) === 1, "duplicate saved");
  return "refused";
});

await check(4, "log a call with tomorrow's follow-up: moves to Contacted, leaves today's list, shows in the history", async () => {
  await go(`/admin/enquiries/${leadId}`);
  await p.getByLabel("Log a call: what happened?").fill("Spoke to Ganesan. Wants a demo with his son.");
  await p.getByLabel("Next follow-up (optional)").fill(tomorrow);
  await p.getByRole("button", { name: "Save the call" }).click();
  expect(/Call noted/.test(await toast(/Call noted/)), "no toast");
  await p.waitForFunction(() => document.body.innerText.includes("Call: Spoke to Ganesan"), null, { timeout: 15_000 });
  const row = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  expect(row.stage === "contact" && row.nextOn?.toISOString().slice(0, 10) === tomorrow, `stage ${row.stage}, next ${row.nextOn?.toISOString()}`);
  await go("/admin/enquiries");
  const today = (await p.locator(".card", { has: p.getByRole("heading", { name: /Follow up today|Nothing waiting today/ }) }).first().innerText()).replace(/\s+/g, " ");
  expect(!today.includes(SHOP), "still in today's list");
  return "contacted, next " + tomorrow;
});

await check(5, "move it along: Demo booked, then Mark as won shows 'Make it a business'", async () => {
  await go(`/admin/enquiries/${leadId}`);
  await p.getByRole("button", { name: "Move to Demo booked" }).click();
  await toast(/moved to Demo booked/);
  await p.getByRole("button", { name: "Mark as won" }).waitFor();
  await p.getByRole("button", { name: "Mark as won" }).click();
  await toast(/is won/);
  await p.getByRole("button", { name: "Make it a business" }).waitFor({ timeout: 15_000 });
  const row = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  expect(row.stage === "won" && row.reached === "won" && row.nextOn === null && row.closedAt, "row: " + JSON.stringify({ stage: row.stage, next: row.nextOn }));
  return "won";
});

await check(6, "Make it a business: added to All clients with the phone, linked, and the enquiry stays won", async () => {
  expect((await p.getByLabel("Business name").inputValue()) === SHOP, "name not filled in");
  expect((await p.getByLabel("City they deliver from").inputValue()) === "Virudhunagar", "city not filled in");
  await p.getByLabel("Kind of business").selectOption("wholesale");
  await p.getByRole("button", { name: "Make it a business" }).click();
  await p.waitForURL(/\/admin\/clients\/[a-z0-9]+$/, { timeout: 20_000 });
  const clientId = p.url().split("/").pop();
  const c = await db.client.findUniqueOrThrow({ where: { id: clientId } });
  expect(c.name === SHOP && c.supportPhone === PHONE && c.homeCity === "Virudhunagar" && c.businessType === "wholesale", "client: " + JSON.stringify({ name: c.name, phone: c.supportPhone }));
  const row = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  expect(row.clientId === clientId, "not linked");
  await go(`/admin/enquiries/${leadId}`);
  const t = await main();
  expect(/Open the business/.test(t) && /stays Won/.test(t) && !(await p.getByRole("button", { name: "Mark as lost" }).count()), "not locked: " + t.slice(0, 200));
  await p.screenshot({ path: ".git/qa-admin-lead.png", fullPage: true });
  return clientId;
});

await check(7, "filters: search and source narrow the board and the list", async () => {
  await db.lead.create({ data: { shop: `QA Lead Devi Tailors ${run}`, phone: `97420${run}`, source: "Walk-in", plan: "starter", createdBy: "QA", nextOn: new Date(`${tomorrow}T00:00:00Z`) } });
  await go("/admin/enquiries");
  await p.getByRole("tab", { name: "All enquiries" }).click();
  const panel = p.locator("#panel-list");
  await panel.getByLabel("Search enquiries").fill("Devi Tailors");
  let rows = (await panel.locator("tbody tr").allInnerTexts()).join(" | ");
  expect(rows.includes("Devi Tailors") && !rows.includes("Ganesh Oils"), "search: " + rows.slice(0, 160));
  await panel.getByLabel("Search enquiries").fill("QA Lead");
  await panel.getByLabel("Where from").selectOption("Referral");
  rows = (await panel.locator("tbody tr").allInnerTexts()).join(" | ");
  expect(rows.includes("Ganesh Oils") && !rows.includes("Devi Tailors"), "source: " + rows.slice(0, 160));
  return "ok";
});

await check(8, "Where leads come from: funnel counts the win, sources and the team from real enquiries", async () => {
  await p.getByRole("tab", { name: "Where leads come from" }).click();
  const t = (await p.locator("#panel-ins").innerText()).replace(/\s+/g, " ");
  expect(/Became a shop \d+/.test(t) && /Referral/.test(t) && /How the team is doing/.test(t), t.slice(0, 300));
  await p.screenshot({ path: ".git/qa-admin-leads-insights.png", fullPage: true });
  return t.match(/Became a shop \d+ · \d+%/)?.[0];
});

await check(9, "a shop login can't open Enquiries", async () => {
  const c2 = await browser.newContext();
  await c2.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const m = await c2.newPage();
  await m.goto(`${BASE}/admin/enquiries/${leadId}`, { waitUntil: "networkidle" });
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
