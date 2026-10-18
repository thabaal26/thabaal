// Payment scenarios a shop owner does by hand, run in a real browser against the QA app (tests/qa/serve.mjs):
// part payments, refunds, undo, verify a claim, cash on delivery, editing a paid order, and what happens when the
// connection drops, is slow, the button is tapped twice, the page is refreshed or the session has expired.
// Run after tests/qa/payments.mjs on the same fresh QA app (it builds on that script's results).
//   node tests/qa/payments-ui.mjs
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
const get = (ref) => db.order.findFirstOrThrow({ where: { ref } });
const snap = (o) => `status ${o.status}, total ${o.total}, paid ${o.paidAmount ?? 0}, paidAt ${o.paidAt ? "set" : "null"}, method ${o.paymentMethod ?? "-"}, source ${o.paymentSource ?? "-"}, refund ${o.refundAmount ?? 0}, collectedBy ${o.collectedBy ?? "-"}`;
let cdp = null;
const throttle = async (on) => {
  await cdp.send("Network.emulateNetworkConditions", on ? { offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
};
async function check(no, name, fn) {
  try {
    results.push({ no, name, pass: true, detail: (await fn()) ?? "" });
  } catch (e) {
    results.push({ no, name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 300) });
  } finally {
    await ctx.setOffline(false).catch(() => {});
    await throttle(false).catch(() => {});
    await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]).catch(() => {});
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const p = await ctx.newPage();
const pageErrors = [];
cdp = await ctx.newCDPSession(p);
await cdp.send("Network.enable");
const run = String(Date.now()).slice(-3);
p.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

async function card(ref) {
  await p.goto(`${BASE}/dashboard/orders?q=${ref}`, { waitUntil: "networkidle" });
  const c = p.locator("article.card", { hasText: `#${ref}` }).first();
  await c.waitFor({ timeout: 15000 });
  return c;
}
async function moreActions(c) {
  const d = c.locator("details.more");
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
}
const sheet = (title) => p.getByRole("dialog").filter({ hasText: title }).last();
const lastToast = async () => (await p.locator("[role=status] p").last().textContent({ timeout: 8000 }).catch(() => ""))?.trim() ?? "";
async function waitToast(re, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const all = await p.locator("[role=status] p").allTextContents().catch(() => []);
    const hit = all.find((t) => re.test(t));
    if (hit) return hit.trim();
    await p.waitForTimeout(250);
  }
  throw new Error(`no toast matching ${re}; last: "${await lastToast()}"`);
}
async function openRecordPayment(ref) {
  const c = await card(ref);
  await moreActions(c);
  await c.getByRole("button", { name: "Mark paid" }).click();
  const s = sheet("Record payment");
  await s.waitFor();
  return s;
}

// 4. Part payment, then the balance.
await check(4, "Staff record a part payment, then the balance: Part paid → Paid", async () => {
  const before = await get("QA-1010"); // 100 of 315 paid by the webhook script
  let s = await openRecordPayment("QA-1010");
  await s.getByText("Cash", { exact: true }).first().click();
  await s.locator("input[type=number]").fill("100");
  await s.locator("input[maxlength='80']").fill("Ravi (QA)");
  await s.locator("button[type=submit]").click();
  await waitToast(/still due/);
  const mid = await get("QA-1010");
  expect(mid.paidAmount === before.paidAmount + 100 && !mid.paidAt && mid.collectedBy === "Ravi (QA)", `after part: ${snap(mid)}`);
  const c = await card("QA-1010");
  const shown = await c.textContent();
  expect(/Part paid/.test(shown) && /due/.test(shown), "card does not say Part paid / due");
  s = await openRecordPayment("QA-1010");
  const prefilled = await s.locator("input[type=number]").inputValue();
  expect(Number(prefilled) === mid.total - mid.paidAmount, `balance prefilled ${prefilled}, expected ${mid.total - mid.paidAmount}`);
  await s.locator("button[type=submit]").click();
  await waitToast(/is paid/);
  const after = await get("QA-1010");
  expect(after.paidAt && after.status === "PAID" && after.paidAmount === after.total, snap(after));
  return `${snap(mid)} → ${snap(after)}`;
});

// 22. Double click on Record.
await check(22, "Double-clicking Record saves the payment once", async () => {
  const before = await get("QA-1005");
  const s = await openRecordPayment("QA-1005");
  await s.locator("input[type=number]").fill("100");
  await s.locator("button[type=submit]").dblclick();
  await waitToast(/Recorded|updated a moment ago/);
  await p.waitForTimeout(1500);
  const after = await get("QA-1005");
  expect(after.paidAmount === before.paidAmount + 100, `paid went ${before.paidAmount} → ${after.paidAmount}`);
  return `${before.paidAmount} → ${after.paidAmount}`;
});

// 20. Offline while recording: nothing saved, sheet stays open with a clear message, retry works once.
await check(20, "Offline: clear message, sheet stays open, nothing saved; retry saves once", async () => {
  const before = await get("QA-1005");
  const s = await openRecordPayment("QA-1005");
  await s.locator("input[type=number]").fill("50");
  await ctx.setOffline(true);
  await s.locator("button[type=submit]").click();
  const msg = await waitToast(/Couldn't reach Thabaal/);
  const stillOpen = await s.isVisible();
  const mid = await get("QA-1005");
  await ctx.setOffline(false);
  expect(stillOpen, "sheet closed after the failure");
  expect(mid.paidAmount === before.paidAmount, "money saved while offline");
  expect(!pageErrors.some((e) => /Failed to fetch/.test(e)) && !(await p.getByText("Something went wrong").isVisible().catch(() => false)), "error screen shown");
  await s.locator("button[type=submit]").click();
  await waitToast(/Recorded/);
  const after = await get("QA-1005");
  expect(after.paidAmount === before.paidAmount + 50, `after retry ${after.paidAmount}`);
  return `"${msg.slice(0, 60)}…"; ${before.paidAmount} → ${mid.paidAmount} (offline) → ${after.paidAmount}`;
});

// 21. Slow 3G: the button shows it's working and can't be submitted twice.
await check(21, "Slow 3G: button busy while saving, repeat taps ignored, one record", async () => {
  const before = await get("QA-1005");
  const s = await openRecordPayment("QA-1005");
  await s.locator("input[type=number]").fill("10");
  await throttle(true);
  const btn = s.locator("button[type=submit]");
  await btn.click();
  await p.waitForTimeout(300);
  const busy = (await btn.getAttribute("aria-busy")) === "true" || (await btn.isDisabled());
  await btn.click({ force: true, timeout: 2000 }).catch(() => {});
  await btn.click({ force: true, timeout: 2000 }).catch(() => {});
  await waitToast(/Recorded|updated a moment ago/, 40000);
  await throttle(false);
  await p.waitForTimeout(1500);
  const after = await get("QA-1005");
  expect(busy, "button was not busy/disabled while saving");
  expect(after.paidAmount === before.paidAmount + 10, `paid ${before.paidAmount} → ${after.paidAmount}`);
  return `busy=${busy}; ${before.paidAmount} → ${after.paidAmount}`;
});

// 23. Refresh in the middle of saving: either saved fully or not at all, and the page shows the truth.
await check(23, "Refresh mid-save: no half-saved order, page shows what's stored", async () => {
  const before = await get("QA-1005");
  const s = await openRecordPayment("QA-1005");
  await s.locator("input[type=number]").fill("20");
  await throttle(true);
  await s.locator("button[type=submit]").click();
  await p.waitForTimeout(400);
  await throttle(false);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const after = await get("QA-1005");
  const delta = Math.round((after.paidAmount - before.paidAmount) * 100) / 100;
  expect(delta === 0 || delta === 20, `half-saved? delta ${delta}`);
  const c = await card("QA-1005");
  const text = await c.textContent();
  expect(text.includes(`₹${after.paidAmount.toLocaleString("en-IN")}`), `card doesn't show stored ₹${after.paidAmount}`);
  return `delta ${delta} (whole or nothing); card shows ₹${after.paidAmount} received`;
});

// 15. Refund more than received → refused. Then a part refund.
await check(15, "A refund larger than what was received is refused; a part refund is recorded once", async () => {
  const c = await card("QA-1004");
  await moreActions(c);
  await c.getByRole("button", { name: "Record refund" }).click();
  const s = sheet("Record refund");
  await s.waitFor();
  const input = s.locator("input[type=number]");
  await input.evaluate((el) => el.removeAttribute("max"));
  await input.fill("9999");
  await s.locator("button[type=submit]").click();
  const refused = await waitToast(/can be refunded/);
  const mid = await get("QA-1004");
  expect(!(mid.refundAmount > 0), "over-refund saved");
  await input.fill("100");
  await s.locator("button[type=submit]").dblclick();
  await waitToast(/Refund of|recorded a moment ago/);
  await p.waitForTimeout(1000);
  const after = await get("QA-1004");
  expect(after.refundAmount === 100, `refund ${after.refundAmount}`);
  return `"${refused}" then ${snap(after)}`;
});

// 7. Undo: not offered for a WhatsApp-confirmed payment; works for a staff-recorded one.
await check(7, "Undo payment: hidden for WhatsApp-confirmed, works for staff-recorded", async () => {
  let c = await card("QA-1003");
  await moreActions(c);
  const metaUndo = await c.getByRole("button", { name: "Undo payment" }).count();
  expect(metaUndo === 0, "Undo offered on a WhatsApp-confirmed payment");
  c = await card("QA-1010");
  await moreActions(c);
  await c.getByRole("button", { name: "Undo payment" }).click();
  await p.getByRole("alertdialog").getByRole("button", { name: "Undo payment" }).click();
  await waitToast(/Payment removed/);
  const after = await get("QA-1010");
  expect(!after.paidAt && !after.paidAmount && after.status === "CONFIRMED", snap(after));
  return `QA-1003 no Undo; QA-1010 → ${snap(after)}`;
});

// 3. Customer says paid → staff verify → Paid.
await check(3, "Customer says paid → 'Payment received' marks it paid", async () => {
  const c = await card("QA-1012");
  const text = await c.textContent();
  expect(/Customer says paid/.test(text), "claim not shown on the card");
  await c.getByRole("button", { name: "Payment received" }).first().click();
  await waitToast(/checked and recorded/);
  const after = await get("QA-1012");
  expect(after.paidAt && after.paymentSource === "verified", snap(after));
  return snap(after);
});

// 5. Cash on delivery: delivered + cash collected.
await check(5, "Cash on delivery: 'Delivered, cash received' records the cash and delivers", async () => {
  const c = await card("QA-1006");
  await c.getByRole("button", { name: /Delivered, cash received/ }).click();
  await waitToast(/Cash .* recorded|recorded/);
  const after = await get("QA-1006");
  expect(after.status === "DELIVERED" && after.paidAt && after.paymentMethod === "cod" && after.paidAmount === after.total, snap(after));
  return snap(after);
});

// 17. Editing items on a paid order: the payment stays, the balance due is shown.
await check(17, "Editing items on a paid order keeps the payment and shows the balance due", async () => {
  const before = await get("QA-1003");
  const c = await card("QA-1003");
  await moreActions(c);
  await c.getByRole("button", { name: "Edit order" }).click();
  const s = sheet("Edit items");
  await s.waitFor();
  const qty = s.locator("input[type=number]").first();
  await qty.fill("3");
  await p.getByRole("button", { name: "Save items" }).click();
  await waitToast(/./);
  await p.waitForTimeout(800);
  const after = await get("QA-1003");
  expect(after.paidAmount === before.paidAmount && after.total > before.total, `${snap(before)} → ${snap(after)}`);
  const text = await (await card("QA-1003")).textContent();
  const due = after.total - after.paidAmount;
  expect(/Part paid/.test(text) && text.includes(`₹${due.toLocaleString("en-IN")} due`), `card text lacks Part paid / ₹${due} due`);
  return `${snap(after)}; card: Part paid, ₹${due} due`;
});

// 19. Payment request refused with a clear message: opted-out customer, closed window without a pay template.
await check(19, "Payment request: opted-out customer and closed 24-hour window get a clear message, nothing sent", async () => {
  const shop = S.shopId;
  const optedOut =
    (await db.customer.findFirst({ where: { clientId: shop, phone: "919990007777" } })) ??
    (await db.customer.create({ data: { clientId: shop, name: "QA Opted Out", phone: "919990007777", optedOut: true } }));
  const quiet = await db.customer.findFirstOrThrow({ where: { clientId: shop, name: "Muthu Selvam" } });
  const mk = (cust, ref) => db.order.create({ data: { ref, clientId: shop, customerId: cust.id, items: [{ id: "QA-001", name: "Groundnut oil 1L", quantity: 1, price: 360 }], total: 420, status: "NEW" } });
  await mk(optedOut, `QA-7${run}`);
  await mk(quiet, `QA-8${run}`);
  const msgsBefore = await db.message.count();
  let c = await card(`QA-7${run}`);
  await moreActions(c);
  await c.getByRole("button", { name: "Send payment link" }).first().click();
  const t1 = await waitToast(/opted out/);
  c = await card(`QA-8${run}`);
  await moreActions(c);
  await c.getByRole("button", { name: "Send payment link" }).first().click();
  const t2 = await waitToast(/24-hour window|not connected|template|WhatsApp/);
  const o1 = await get(`QA-7${run}`);
  const o2 = await get(`QA-8${run}`);
  expect(!o1.paymentRequestedAt && !o2.paymentRequestedAt && (await db.message.count()) === msgsBefore, "a request was logged as sent");
  return `"${t1}" / "${t2.slice(0, 110)}"`;
});

// 26. UPI reference on Payments: WhatsApp's UPI mode gives no transaction id, so a message id or "WA-UPI" was saved and
// shown as the reference. Neither is shown now, and staff can add the UTR from the UPI app once.
await check(26, "Payments › All: no WhatsApp message id shown as the reference; 'Add UTR' saves it once", async () => {
  const cust = await db.customer.findFirstOrThrow({ where: { clientId: S.shopId, name: "Muthu Selvam" } });
  const ref = `QA-U${run}`;
  await db.order.create({
    data: { ref, clientId: S.shopId, customerId: cust.id, items: [{ id: "QA-001", name: "Groundnut oil 1L", quantity: 1, price: 360 }], total: 360, status: "PAID", paidAt: new Date(), paidAmount: 360, paymentMethod: "upi", paymentSource: "staff", paymentTxnId: `wamid.HBgMQATEST${run}` },
  });
  await p.goto(`${BASE}/dashboard/revenue?tab=all`, { waitUntil: "networkidle" });
  const row = p.locator("tr", { hasText: ref }).first();
  await row.waitFor({ timeout: 15000 });
  expect(!/wamid/.test(await row.textContent()), "wamid still shown as the reference");
  await row.getByRole("button", { name: "Add UTR" }).click();
  await row.getByLabel("UPI reference (UTR)").fill("4123 4567 8901");
  await row.getByRole("button", { name: "Save" }).click();
  await waitToast(/Saved reference 412345678901/);
  const after = await get(ref);
  // A UTR goes in its own field (paymentUtr); the transaction reference is left as it was.
  expect(after.paymentUtr === "412345678901", `saved utr ${after.paymentUtr ?? "-"}, txn ${after.paymentTxnId}`);
  await p.reload({ waitUntil: "networkidle" });
  const row2 = p.locator("tr", { hasText: ref }).first();
  expect(/412345678901/.test(await row2.textContent()) && (await row2.getByRole("button", { name: "Add UTR" }).count()) === 0, "UTR not shown, or Add UTR still offered");
  return `wamid hidden; UTR saved and shown: ${after.paymentUtr}`;
});

// 27. Chat: "Payment received: confirm" opens Record payment with the UTR field; recording sets Paid with the reference.
await check(27, "Chat confirm opens Record payment; recording with the UTR marks it paid and keeps the UTR", async () => {
  const cust = await db.customer.create({ data: { clientId: S.shopId, name: `QA Chat Pay ${run}`, phone: `9199900088${run}` } });
  const reply = await db.reply.create({ data: { customerId: cust.id, text: "Paid ₹360 by UPI", kind: "text" } });
  const ref = `QA-C${run}`;
  await db.order.create({
    data: { ref, clientId: S.shopId, customerId: reply.customerId, items: [{ id: "QA-001", name: "Groundnut oil 1L", quantity: 1, price: 360 }], total: 360, status: "CONFIRMED", paymentClaimedAt: new Date(), paymentRequestedAt: new Date() },
  });
  await p.goto(`${BASE}/dashboard/replies?r=${reply.customerId}`, { waitUntil: "networkidle" });
  const more = p.locator("details.more").first();
  if ((await more.getAttribute("open")) === null) await more.locator("summary").click();
  await p.getByRole("button", { name: "Payment received: confirm" }).click();
  const sh = sheet("Record payment");
  await sh.waitFor();
  await sh.getByPlaceholder("12-digit number", { exact: true }).fill("512345678902");
  await sh.locator("button[type=submit]").click();
  await waitToast(/is paid/);
  const after = await get(ref);
  expect(after.paidAt && after.status === "PAID" && after.paymentTxnId === "512345678902", snap(after) + `, txn ${after.paymentTxnId}`);
  return `${snap(after)}, txn ${after.paymentTxnId}`;
});

// 25. Session expired mid-action → sign-in, nothing saved.
await check(25, "Session expired mid-action: sent to sign in, nothing saved", async () => {
  const s2 = await openRecordPayment(`QA-8${run}`);
  await s2.locator("input[type=number]").fill("100");
  await ctx.clearCookies();
  await s2.locator("button[type=submit]").click();
  await p.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  const url = p.url();
  const after = await get(`QA-8${run}`);
  await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  expect(!(after.paidAmount > 0), `saved without a session: ${snap(after)}`);
  expect(/\/login/.test(url) || /sign in|session/i.test(await lastToast()), `stayed on ${url} with "${await lastToast()}"`);
  return `landed on ${url.replace(BASE, "")}; ${snap(after)}`;
});

await browser.close();
await db.$disconnect();
fs.writeFileSync(".git/qa-payments-ui.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.no}] ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed; page errors: ${pageErrors.length ? pageErrors.slice(0, 3).join(" | ") : "none"}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
