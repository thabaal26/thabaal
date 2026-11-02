// Payment and cancel details on the order card, in a real browser against the QA app (tests/qa/serve.mjs): staff
// record a UPI payment picking GPay with its UTR, and the card says when, with which app and how it was confirmed,
// with the UTR to copy; staff cancel an order and the card says when and by whom; reopening clears it. Removes what
// it made.
//   node tests/qa/order-details.mjs
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
const waitFor = async (fn, ms = 15_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
};

const run = Date.now().toString().slice(-6);
const cust = await db.customer.create({ data: { clientId: S.shopId, name: "QA Details", phone: `9198${run}77` } });
const mk = (k) => db.order.create({ data: { ref: `QA-DT-${run}-${k}`, clientId: S.shopId, customerId: cust.id, status: "NEW", total: 360, items: [{ id: "x", name: "QA Ghee", quantity: 1, price: 300 }] } });
const pay = await mk("P");
const cancel = await mk("C");
const fresh = (id) => db.order.findUniqueOrThrow({ where: { id } });
const cleanup = async () => {
  await db.paymentEvent.deleteMany({ where: { orderId: { in: [pay.id, cancel.id] } } });
  await db.message.deleteMany({ where: { customerId: cust.id } });
  await db.order.deleteMany({ where: { customerId: cust.id } });
  await db.customer.delete({ where: { id: cust.id } });
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const m = await ctx.newPage();
m.on("pageerror", (e) => errors.push(String(e.message)));
const card = (ref) => m.locator("article.card", { hasText: ref }).first();
const open = (ref) => m.goto(`${BASE}/dashboard/orders?q=${encodeURIComponent(ref)}`, { waitUntil: "networkidle" });

await check(1, "staff record a UPI payment with GPay and its UTR: saved with the app", async () => {
  await open(pay.ref);
  const c = card(pay.ref);
  await c.locator("details.more summary").click();
  await c.getByRole("button", { name: "Mark paid" }).click();
  const sheet = m.getByRole("dialog");
  await sheet.locator(`#app-${pay.id}`).selectOption("gpay");
  await sheet.locator(`#ref-${pay.id}`).fill("412345678901");
  await sheet.getByRole("button", { name: /Record .*paid/ }).click();
  const o = await waitFor(async () => {
    const r = await fresh(pay.id);
    return r.paidAt ? r : null;
  });
  expect(o && o.paymentApp === "gpay" && o.paymentUtr === "412345678901" && o.paymentSource === "staff", "saved: " + JSON.stringify(o && { app: o.paymentApp, utr: o.paymentUtr }));
  return "gpay";
});

await check(2, "the card says when it was paid, with GPay and how, and shows the UTR to copy", async () => {
  await open(pay.ref);
  const line = (await card(pay.ref).locator("[data-pay-detail]").innerText()).replace(/\s+/g, " ");
  expect(/^Paid .+ · GPay · Recorded by staff/.test(line), "line: " + line);
  const t = (await card(pay.ref).innerText()).replace(/\s+/g, " ");
  expect(/UTR 412345678901/.test(t), "no UTR pill: " + t.slice(0, 300));
  return line;
});

await check(3, "the Timeline's payment step has the time, app, how and the UTR", async () => {
  await card(pay.ref).getByRole("button", { name: "Timeline" }).click();
  const t = (await card(pay.ref).innerText()).replace(/\s+/g, " ");
  expect(/Payment verification .*GPay · Recorded by staff · UTR 412345678901/.test(t), "timeline: " + t.slice(0, 400));
  return "ok";
});

await check(4, "staff cancel an order: the card says when and that staff did, with their name", async () => {
  await open(cancel.ref);
  const c = card(cancel.ref);
  await c.locator("details.more summary").click();
  await c.getByRole("button", { name: "Cancel order" }).click();
  await m.getByRole("alertdialog").getByRole("button", { name: "Cancel order" }).click();
  const o = await waitFor(async () => {
    const r = await fresh(cancel.id);
    return r.status === "CANCELLED" ? r : null;
  });
  expect(o && o.cancelledAt && /^Staff \(/.test(o.cancelledBy ?? ""), "saved: " + JSON.stringify(o && { by: o.cancelledBy }));
  await open(cancel.ref);
  const line = (await card(cancel.ref).locator("[data-pay-detail]").innerText()).replace(/\s+/g, " ");
  expect(/^Cancelled .+ · Staff \(/.test(line), "line: " + line);
  return line;
});

await check(5, "reopening it clears when and who", async () => {
  await card(cancel.ref).getByRole("button", { name: "Restore order" }).click();
  const o = await waitFor(async () => {
    const r = await fresh(cancel.id);
    return r.status !== "CANCELLED" ? r : null;
  });
  expect(o && o.cancelledAt === null && o.cancelledBy === null, "still: " + JSON.stringify(o && { at: o.cancelledAt, by: o.cancelledBy }));
  return "cleared";
});

await check(6, "no browser errors", async () => {
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
