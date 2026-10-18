// Stored-XSS check: puts HTML/script payloads into the QA shop's data (customer name, area, tag, chat reply, order
// note, campaign and audience name), opens every page that shows them, and fails if any payload runs or turns into
// a real element. QA database only; the payload rows are deleted at the end.
//   node tests/qa/xss.mjs → .git/qa-xss.json
import fs from "node:fs";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = process.env.BASE ?? S.base;
if (!/@localhost:/.test(S.dbUrl)) throw new Error("QA database only");
const db = new PrismaClient({ datasources: { db: { url: S.dbUrl } } });

const P = (tag) => `<img src=x id="xss-${tag}" onerror="window.__xss=(window.__xss||[]).concat('${tag}')">`;
const created = { customers: [], replies: [], campaigns: [], audiences: [] };
const cust = await db.customer.create({
  data: { clientId: S.shopId, name: `ZzXss ${P("name")}`, phone: "919990009901", location: `Area ${P("area")}`, tags: [`t${P("tag")}`] },
});
created.customers.push(cust.id);
created.replies.push((await db.reply.create({ data: { customerId: cust.id, text: `Hi ${P("reply")}`, kind: "text" } })).id);
const order = await db.order.findFirst({ where: { clientId: S.shopId }, orderBy: { createdAt: "desc" } });
const oldNote = order?.note ?? null;
if (order) await db.order.update({ where: { id: order.id }, data: { note: `Note ${P("note")}` } });
const tpl = await db.template.findFirst({ where: { clientId: S.shopId } });
if (tpl)
  created.campaigns.push(
    (await db.campaign.create({ data: { clientId: S.shopId, name: `ZzXss camp ${P("campaign")}`, templateId: tpl.id, scheduleType: "ONCE", active: false } }).catch((e) => ({ id: null, e }))).id,
  );
created.audiences.push((await db.audience.create({ data: { clientId: S.shopId, name: `ZzXss aud ${P("audience")}`, filter: {} } }).catch(() => ({ id: null }))).id);

const routes = [
  "/dashboard",
  "/dashboard/customers",
  `/dashboard/customers/${cust.id}`,
  "/dashboard/customers/audiences",
  "/dashboard/orders",
  "/dashboard/replies",
  "/dashboard/replies/priority",
  "/dashboard/notifications",
  "/dashboard/campaigns",
  "/dashboard/messages",
  "/dashboard/report",
];
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const results = [];
try {
  for (const vp of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
    const p = await ctx.newPage();
    let dialog = false;
    p.on("dialog", (d) => {
      dialog = true;
      d.dismiss().catch(() => {});
    });
    for (const r of routes) {
      await p.goto(BASE + r, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(400);
      const res = await p.evaluate(() => ({ ran: window.__xss ?? [], elements: [...document.querySelectorAll('[id^="xss-"]')].map((e) => e.id), shown: document.body.innerText.includes("onerror") }));
      const ok = !res.ran.length && !res.elements.length && !dialog;
      results.push({ route: r, viewport: `${vp.width}x${vp.height}`, ok, ...res });
      console.log(`${ok ? "PASS" : "FAIL"} ${vp.width} ${r}${res.ran.length ? ` ran: ${res.ran}` : ""}${res.elements.length ? ` elements: ${res.elements}` : ""}${res.shown ? " (payload shown as text)" : ""}`);
    }
    await ctx.close();
  }
} finally {
  await b.close();
  if (order) await db.order.update({ where: { id: order.id }, data: { note: oldNote } });
  await db.reply.deleteMany({ where: { id: { in: created.replies } } });
  await db.campaign.deleteMany({ where: { id: { in: created.campaigns.filter(Boolean) } } });
  await db.audience.deleteMany({ where: { id: { in: created.audiences.filter(Boolean) } } });
  await db.customer.deleteMany({ where: { id: { in: created.customers } } });
  await db.$disconnect();
}
fs.writeFileSync(".git/qa-xss.json", JSON.stringify(results, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
