// Campaigns end to end in a real browser against the QA app (tests/qa/serve.mjs): create a weekly campaign, edit its
// days and time, create a one-off on a date, pause and resume, delete; every step checks the saved schedule and the
// next run time (India time). Also a large phone photo uploaded from a customer's page is shrunk and stored.
// Nothing is sent (QA has no WhatsApp number). Removes what it made.
//   node tests/qa/campaigns.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const sharp = require("sharp");
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
    results.push({ no, name, pass: false, detail: String(e.message || e.stack || e).split("\n").slice(0, 3).join(" ").slice(0, 400) });
    await p.screenshot({ path: `.git/qa-campaigns-fail-${no}.png`, fullPage: true }).catch(() => {});
  }
}

// India time helpers (IST has no daylight saving: UTC+5:30).
const IST = 5.5 * 3600_000;
const istParts = (d) => {
  const x = new Date(d.getTime() + IST);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), dow: x.getUTCDay() };
};
const istAt = (y, m, d, hh, mm) => new Date(Date.UTC(y, m, d, hh, mm) - IST);
/** The next of these weekdays at hh:mm India time, strictly after now. */
function nextWeekly(days, hh, mm, now = new Date()) {
  const p = istParts(now);
  for (let i = 0; i <= 7; i++) {
    const t = istAt(p.y, p.m, p.d + i, hh, mm);
    if (days.includes(istParts(t).dow) && t > now) return t;
  }
  return null;
}
const iso = (d) => (d ? new Date(d).toISOString() : null);
const NAME = `QA Campaign ${Date.now().toString().slice(-5)}`;
/** A saved campaign's own page (not /new). */
const campaignPage = (u) => /\/dashboard\/campaigns\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new");

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message)));
const go = (path) => p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 });
const saved = () => db.campaign.findFirst({ where: { clientId: S.shopId, name: { startsWith: NAME } }, orderBy: { createdAt: "desc" } });
async function confirmDialog() {
  const d = p.getByRole("alertdialog").last();
  await d.waitFor({ timeout: 10_000 });
  await d.getByRole("button").last().click();
}
let weeklyId = "";

await check(1, "create a weekly campaign (Mon & Thu, 10:00): saved with the right days, time and next run", async () => {
  await go("/dashboard/campaigns/new");
  await p.fill("#cname", `${NAME} weekly`);
  await p.getByRole("button", { name: "Mon & Thu" }).click();
  await p.fill("#time", "10:00");
  await p.getByRole("button", { name: "Create campaign" }).click();
  await p.waitForURL(campaignPage, { timeout: 20_000 });
  const c = await saved();
  weeklyId = c.id;
  expect(c.scheduleType === "WEEKLY" && c.daysOfWeek.join() === "1,4" && c.sendTime === "10:00" && c.active, "saved: " + JSON.stringify({ t: c.scheduleType, d: c.daysOfWeek, s: c.sendTime }));
  expect(iso(c.nextRunAt) === iso(nextWeekly([1, 4], 10, 0)), `next run ${iso(c.nextRunAt)} vs ${iso(nextWeekly([1, 4], 10, 0))}`);
  return `next ${new Date(c.nextRunAt.getTime() + IST).toISOString().slice(0, 16)} IST`;
});

await check(2, "edit it to Tue & Fri at 18:00: the next run moves with it", async () => {
  await go(`/dashboard/campaigns/${weeklyId}`);
  await p.getByRole("button", { name: "Tue & Fri" }).click();
  await p.fill("#time", "18:00");
  await p.getByRole("button", { name: /^(Save|Update)/ }).last().click();
  await p.waitForTimeout(1500);
  const c = await db.campaign.findUniqueOrThrow({ where: { id: weeklyId } });
  expect(c.daysOfWeek.join() === "2,5" && c.sendTime === "18:00", "saved: " + JSON.stringify({ d: c.daysOfWeek, s: c.sendTime }));
  expect(iso(c.nextRunAt) === iso(nextWeekly([2, 5], 18, 0)), `next run ${iso(c.nextRunAt)}`);
  return "moved";
});

await check(3, "pause stops the schedule; resume brings back the next run", async () => {
  await go(`/dashboard/campaigns/${weeklyId}`);
  await p.locator("#main").getByRole("button", { name: /^Pause$/ }).first().click();
  await p.waitForTimeout(1500);
  let c = await db.campaign.findUniqueOrThrow({ where: { id: weeklyId } });
  expect(!c.active && c.nextRunAt === null, "not paused");
  await go(`/dashboard/campaigns/${weeklyId}`);
  await p.locator("#main").getByRole("button", { name: /^Resume$/ }).first().click();
  await p.waitForTimeout(1500);
  c = await db.campaign.findUniqueOrThrow({ where: { id: weeklyId } });
  expect(c.active && iso(c.nextRunAt) === iso(nextWeekly([2, 5], 18, 0)), "not resumed: " + iso(c.nextRunAt));
  return "paused and resumed";
});

await check(4, "a one-off on a date (tomorrow, 11:00): saved for that exact India time", async () => {
  await go("/dashboard/campaigns/new");
  await p.fill("#cname", `${NAME} once`);
  await p.getByRole("radio", { name: /Calendar date/ }).first().click();
  const t = istParts(new Date(Date.now() + 86_400_000));
  const day = p.locator(`button[aria-label^="${t.d} "]:not([disabled])`).first();
  await day.waitFor({ timeout: 10_000 });
  await day.click();
  await p.fill("#time", "11:00");
  await p.getByRole("button", { name: "Create campaign" }).click();
  await p.waitForURL(campaignPage, { timeout: 20_000 }).catch(async () => {
    await p.screenshot({ path: ".git/qa-campaign-once.png", fullPage: true });
    throw new Error("not created: " + (await p.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 200));
  });
  const c = await saved();
  const want = istAt(t.y, t.m, t.d, 11, 0);
  expect(c.scheduleType === "ONCE" && iso(c.runAt) === iso(want) && iso(c.nextRunAt) === iso(want), `saved ${c.scheduleType} ${iso(c.runAt)} next ${iso(c.nextRunAt)} want ${iso(want)}`);
  return `runs ${new Date(want.getTime() + IST).toISOString().slice(0, 16)} IST`;
});

await check(5, "delete a campaign: it's gone and you're back on the list", async () => {
  const c = await saved();
  await go(`/dashboard/campaigns/${c.id}`);
  // Wide screens show Delete in the header; narrow ones keep it under "More campaign actions".
  const del = p.locator("#main").getByRole("button", { name: /^Delete$/ }).first();
  if (!(await del.isVisible())) await p.getByRole("button", { name: "More campaign actions" }).click();
  await p.locator("#main").getByRole("button", { name: /^Delete$/ }).first().click();
  await confirmDialog();
  await p.waitForURL(/\/dashboard\/campaigns$/, { timeout: 20_000 });
  expect(!(await db.campaign.findUnique({ where: { id: c.id } })), "still there");
  return "deleted";
});

await check(6, "a large phone photo (3000 px PNG) uploaded from a customer's page is shrunk and stored", async () => {
  const big = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .composite([{ input: Buffer.from(`<svg width="3000" height="3000"><circle cx="1500" cy="1500" r="1200" fill="#2b5c86"/></svg>`) }])
    .png({ compressionLevel: 0 })
    .toBuffer();
  const tmp = ".git/qa-big-photo.png";
  fs.writeFileSync(tmp, big);
  // The customer wrote a moment ago, so a reply (with a photo) can go: the panel shows "Attach photo / PDF".
  const reply = await db.reply.create({ data: { customerId: S.customerId, text: "QA hello", kind: "text" } });
  await go(`/dashboard/customers/${S.customerId}`);
  await p.getByRole("button", { name: "Attach photo / PDF" }).first().click();
  const input = p.locator("#main input[type=file]").first();
  expect(await input.count(), "no photo input on the customer's page");
  await input.setInputFiles(tmp);
  // The upload fills in the photo's link when it's done.
  const field = p.locator('#main input[placeholder^="https://"]').first();
  let link = "";
  for (let i = 0; i < 60 && !link; i++) {
    link = await field.inputValue();
    if (!link) await p.waitForTimeout(500);
  }
  fs.unlinkSync(tmp);
  await db.reply.delete({ where: { id: reply.id } });
  expect(link, `no link after 30 s (photo was ${(big.length / 1e6).toFixed(1)} MB)`);
  // The link points at the copy that stored it (this QA app), never at www.thabaal.in, where it wouldn't exist.
  const id = link.split("/").pop();
  expect(link === `${BASE}/api/upload/${id}`, "link: " + link);
  const [row] = await db.$queryRaw`SELECT "id", "mimeType", length("data")::int AS bytes FROM "PortalUploadedImage" WHERE "id" = ${id}`;
  expect(row, "not in the database: " + id);
  expect(row.mimeType === "image/jpeg" && row.bytes < 900_000, `stored ${row.mimeType} ${row.bytes} bytes`);
  const res = await fetch(link);
  expect(res.status === 200 && res.headers.get("content-type") === "image/jpeg", `served ${res.status}`);
  await db.$executeRaw`DELETE FROM "PortalUploadedImage" WHERE "id" = ${row.id}`;
  return `${(big.length / 1e6).toFixed(1)} MB PNG → ${(row.bytes / 1024).toFixed(0)} KB JPEG`;
});

await check(7, "no browser errors", async () => {
  expect(!errors.length, errors.join(" | ").slice(0, 300));
  return "none";
});

await db.campaign.deleteMany({ where: { clientId: S.shopId, name: { startsWith: NAME } } });
await browser.close();
await db.$disconnect();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
