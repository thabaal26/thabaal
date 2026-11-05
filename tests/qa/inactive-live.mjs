// Engagement groups stay live on the campaign form (segment-picker.tsx): customers moved to Dormant show on the
// Dormant card (and stay out of sends); when one of them replies on WhatsApp they come back to Engaged, and the
// open form's counts change by themselves within a minute, with no reload.
//   node tests/qa/inactive-live.mjs   (on a running `node tests/qa/serve.mjs`)
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

// History: a campaign that reached three new customers; then the business moves them to Inactive.
const t = await db.template.findFirstOrThrow({ where: { clientId: S.shopId, category: "MARKETING" } });
const camp = await db.campaign.create({ data: { clientId: S.shopId, name: `QA Inactive ${run}`, templateId: t.id, scheduleType: "ONCE", active: false } });
const qrun = await db.campaignRun.create({ data: { campaignId: camp.id, scheduledFor: new Date(Date.now() - 86_400_000), status: "COMPLETED", total: 3, completedAt: new Date() } });
const moved = [];
for (const k of [1, 2, 3]) {
  const c = await db.customer.create({ data: { clientId: S.shopId, name: `QA Moved ${k} ${run}`, phone: `9166${run}${k}`.slice(0, 12), tags: ["inactive"], unreachable: k === 1, optInSource: "QA", optInAt: new Date() } });
  await db.message.create({ data: { runId: qrun.id, customerId: c.id, templateId: t.id, templateName: t.name, status: k === 1 ? "FAILED" : "DELIVERED", errorCode: k === 1 ? 131026 : null, waMessageId: `wamid.qa-inact-${run}-${k}`, sentAt: new Date(Date.now() - 86_400_000) } });
  moved.push(c);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const p = await ctx.newPage();
const total = async (s) => num(await p.getByTestId(`segment-total-${s}`).innerText());

let before = 0;
await check("Moved customers are on the Dormant card, marked as left out, and a send to Dormant leaves them out", async () => {
  await p.goto(`${BASE}/dashboard/campaigns/new`, { waitUntil: "networkidle" });
  await p.getByTestId("segment-picker").waitFor();
  before = await total("dormant");
  expect(before >= 3, `Inactive card shows ${before}`);
  const line = await p.getByTestId("moved-inactive-count").innerText();
  expect(/you moved here are left out/.test(line) && num(line.split("·")[1]) >= 3, `line: ${line}`);
  return `${before} on the card · ${line}`;
});

let superBefore = 0;
await check("A moved customer replies on WhatsApp: tag off, can receive again, and the open form updates without a reload", async () => {
  superBefore = await total("engaged");
  const c = moved[0];
  await webhook({ contacts: [{ wa_id: c.phone, profile: { name: c.name } }], messages: [{ from: c.phone, id: `wamid.qa-back-${run}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "What's the price of gingelly oil?" } }] });
  const back = await db.customer.findUniqueOrThrow({ where: { id: c.id } });
  expect(!back.tags.includes("inactive") && !back.unreachable, `tags ${back.tags} unreachable ${back.unreachable}`);
  // The form re-reads its counts when the live check changes (tab visible): wait for it, no reload.
  await p.waitForFunction(
    ([b, sb]) => {
      const get = (s) => Number((document.querySelector(`[data-testid=segment-total-${s}]`)?.textContent ?? "").replace(/[^\d]/g, "") || 0);
      return get("dormant") === b - 1 && get("engaged") === sb + 1;
    },
    [before, superBefore],
    { timeout: 30_000, polling: 1000 },
  );
  return `Dormant ${before}→${await total("dormant")}, Engaged ${superBefore}→${await total("engaged")}`;
});

await browser.close();
await db.$disconnect();
fs.writeFileSync(".git/qa-inactive-live.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
