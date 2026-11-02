// A campaign actually going out, against the QA app (tests/qa/serve.mjs): a campaign due now starts from a WhatsApp
// webhook alone (no scheduler call) and sends its first batch at once; a scheduler call that comes late sends the
// batches it missed and the run completes; the campaign page shows it done with every message sent. The QA number
// has no token, so sends use the local provider's demo mode (logged, not sent). Puts everything back after.
//   node tests/qa/campaign-run.mjs
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
const waitFor = async (fn, ms = 25_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
};

const run = Date.now().toString().slice(-6);
const TAG = `qa-run-${run}`;
const setting = await db.setting.findUnique({ where: { id: 1 }, select: { provider: true } });
const client = await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { quietFrom: true, quietTo: true, marketingGapHours: true } });
await db.setting.update({ where: { id: 1 }, data: { provider: "LOCAL" } });
// No quiet hours or gap between offers for this check (QA can run at any hour).
await db.client.update({ where: { id: S.shopId }, data: { quietFrom: null, quietTo: null, marketingGapHours: 0 } });
await db.customer.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ clientId: S.shopId, phone: `9194${run}${String(i).padStart(2, "0")}`, name: `Run Q ${i}`, tags: [TAG] })) });
const number = await db.whatsAppNumber.findFirstOrThrow({ where: { clientId: S.shopId }, select: { phoneNumberId: true, businessAccountId: true } });
const tpl = await db.template.create({ data: { clientId: S.shopId, businessAccountId: number.businessAccountId, name: `qa_run_${run}`, category: "MARKETING", status: "APPROVED", language: "en", body: "QA run offer" } });
const campaign = await db.campaign.create({
  data: { clientId: S.shopId, name: `QA run ${run}`, templateId: tpl.id, scheduleType: "ONCE", sendTime: "10:00", runAt: new Date(Date.now() - 60_000), nextRunAt: new Date(Date.now() - 60_000), active: true, batchSize: 10, intervalMinutes: 10, audienceTag: TAG },
});
const cleanup = async () => {
  await db.setting.update({ where: { id: 1 }, data: { provider: setting?.provider ?? "META" } });
  await db.client.update({ where: { id: S.shopId }, data: client });
  await db.message.deleteMany({ where: { run: { campaignId: campaign.id } } });
  await db.campaignRun.deleteMany({ where: { campaignId: campaign.id } });
  await db.campaign.delete({ where: { id: campaign.id } }).catch(() => {});
  await db.template.delete({ where: { id: tpl.id } }).catch(() => {});
  const ids = (await db.customer.findMany({ where: { clientId: S.shopId, tags: { has: TAG } }, select: { id: true } })).map((c) => c.id);
  await db.message.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
};
/** The campaign page's status line (badge and text under the title). */
async function header(existing) {
  if (existing) return existing.locator("header.top > div").first().innerText();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard/campaigns/${campaign.id}`, { waitUntil: "networkidle" });
    return await page.locator("header.top > div").first().innerText();
  } finally {
    await browser.close();
  }
}
const sent = () => db.message.count({ where: { run: { campaignId: campaign.id }, status: "SENT" } });
const latest = () => db.campaignRun.findFirst({ where: { campaignId: campaign.id }, orderBy: { startedAt: "desc" } });

try {
  await check(1, "a due campaign starts from a WhatsApp webhook alone and sends its first batch", async () => {
    // A delivery status for some earlier message: the kind of webhook Meta sends all day.
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "qa", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: number.phoneNumberId }, statuses: [{ id: `wamid.qa.none.${run}`, status: "delivered", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "919000000000" }] } }] }] });
    const sig = "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(body).digest("hex");
    // A kick runs at most once a minute per server, and earlier suites may have used it: post again until it runs.
    let n = null;
    for (let i = 0; i < 6 && !n; i++) {
      const r = await fetch(`${BASE}/api/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
      expect(r.status === 200, `webhook ${r.status}`);
      n = await waitFor(async () => ((await sent()) >= 10 ? await sent() : null), 15_000);
    }
    const rr = await latest();
    expect(rr, "no run started");
    expect(n === 10, `sent ${await sent()} (run ${rr.status})`);
    expect(rr.status === "RUNNING", `status ${rr.status}`);
    return `run started, ${n} sent`;
  });

  await check(4, "while it sends, the campaign page says Sending with how many went, not Paused", async () => {
    const text = await header();
    expect(/Sending/.test(text) && /10 of 30 sent/.test(text), `header: ${text}`);
    expect(!/Paused: nothing scheduled/.test(text), "still says paused");
    return text.replace(/\s+/g, " ").slice(0, 80);
  });

  await check(2, "a scheduler call 35 minutes late sends the batches it missed and the run completes", async () => {
    const rr = await latest();
    await db.campaignRun.update({ where: { id: rr.id }, data: { nextBatchAt: new Date(Date.now() - 35 * 60_000) } });
    const r = await fetch(`${BASE}/api/cron`, { headers: { authorization: `Bearer ${S.cronSecret}` } });
    expect(r.ok, `cron ${r.status}`);
    const n = await sent();
    const done = await latest();
    expect(n === 30, `sent ${n}`);
    expect(done.status === "COMPLETED", `status ${done.status}`);
    return `${n} sent, ${done.status}`;
  });

  await check(3, "the campaign page shows it done, 30 of 30 sent", async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(`${BASE}/dashboard/campaigns/${campaign.id}`, { waitUntil: "networkidle" });
      expect(res?.status() === 200, `page ${res?.status()}`);
      const text = await page.locator("main").innerText();
      expect(/30/.test(text), "no count of 30");
      const head = await header(page);
      expect(/Completed/.test(head) && /Sent /.test(head), `header: ${head}`);
      expect(!/Paused/.test(head), "header says paused");
      expect(!errors.length, `script error: ${errors[0]}`);
      await page.screenshot({ path: ".git/shots-campaign-run.png" });
      return "shown";
    } finally {
      await browser.close();
    }
  });
} finally {
  await cleanup();
  await db.$disconnect();
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
