// Payment scenarios against the QA app (tests/qa/serve.mjs): WhatsApp payment webhooks built and signed locally with
// the QA app secret, sent to localhost only, and the saved order checked in the QA database after each.
//   node tests/qa/payments.mjs        (start a fresh QA app first: every run expects the seeded data)
import fs from "node:fs";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost|127\.0\.0\.1/.test(S.base) || !/localhost|127\.0\.0\.1/.test(S.dbUrl)) throw new Error("QA only: base and database must be local");
const db = new PrismaClient({ datasources: { db: { url: S.dbUrl } } });
const QA_NUMBER = "qa-pnid-1";
const results = [];
const order = (key) => db.order.findUniqueOrThrow({ where: { id: S.orders[key].id } });
const byRef = (ref) => db.order.findFirstOrThrow({ where: { ref } });

function envelope(value) {
  return { object: "whatsapp_business_account", entry: [{ id: "qa-waba-1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: QA_NUMBER, display_phone_number: "919990001999" }, ...value } }] }] };
}
let n = 0;
function paymentStatus({ ref, rupees, status = "captured", txnStatus = "success", txnId, currency = "INR", error, phoneNumberId }) {
  n += 1;
  const body = envelope({
    statuses: [
      {
        id: `wamid.QA${Date.now()}${n}`,
        status,
        type: "payment",
        recipient_id: "919990001000",
        timestamp: String(Math.floor(Date.now() / 1000)),
        payment: {
          reference_id: ref,
          amount: { value: Math.round(rupees * 100), offset: 100 },
          currency,
          transaction: { id: txnId ?? `QATXN${Date.now()}${n}`, type: "upi", status: txnStatus, ...(error && { error }) },
        },
      },
    ],
  });
  if (phoneNumberId) body.entry[0].changes[0].value.metadata.phone_number_id = phoneNumberId;
  return body;
}
async function post(body, { sign = true, secret = S.metaSecret, raw } = {}) {
  const text = raw ?? JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if (sign) headers["x-hub-signature-256"] = "sha256=" + createHmac("sha256", secret).update(text).digest("hex");
  const r = await fetch(`${S.base}/api/webhook`, { method: "POST", headers, body: text });
  return r.status;
}
async function check(no, name, fn) {
  try {
    const detail = await fn();
    results.push({ no, name, pass: true, detail: detail ?? "" });
  } catch (e) {
    results.push({ no, name, pass: false, detail: String(e.message ?? e).slice(0, 300) });
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const snap = (o) => `status ${o.status}, paid ${o.paidAmount ?? 0}, paidAt ${o.paidAt ? "set" : "null"}, txn ${o.paymentTxnId ?? "-"}, source ${o.paymentSource ?? "-"}, claim ${o.paymentClaimedAt ? "yes" : "no"}, failed ${o.paymentFailReason ?? "-"}`;

// 9. Bad / missing signature: rejected, nothing saved.
await check(9, "Bad or missing webhook signature is rejected and saves nothing", async () => {
  const before = await order("newUnpaid");
  const body = paymentStatus({ ref: S.orders.newUnpaid.ref, rupees: before.total });
  const s1 = await post(body, { secret: "wrong-secret" });
  const s2 = await post(body, { sign: false });
  const after = await order("newUnpaid");
  expect(s1 === 401 && s2 === 401, `expected 401/401, got ${s1}/${s2}`);
  expect(!after.paidAt && (after.paidAmount ?? 0) === 0, `order changed: ${snap(after)}`);
  return `HTTP ${s1} and ${s2}; ${snap(after)}`;
});

await check(9, "Malformed JSON with a valid signature is refused (400), nothing saved", async () => {
  const s = await post(null, { raw: "{not json" });
  expect(s === 400, `expected 400, got ${s}`);
  return `HTTP ${s}`;
});

// 1. Paid webhook → order paid, method/source/txn saved.
await check(1, "Review-and-pay webhook marks the order paid with the WhatsApp transaction", async () => {
  const o = await order("newUnpaid");
  const s = await post(paymentStatus({ ref: o.ref, rupees: o.total, txnId: "QATXN-PAY-1" }));
  const a = await order("newUnpaid");
  expect(s === 200, `HTTP ${s}`);
  expect(a.status === "PAID" && a.paidAt && a.paidAmount === o.total && a.paymentTxnId === "QATXN-PAY-1" && a.paymentSource === "meta" && a.paymentMethod === "upi_whatsapp", snap(a));
  return snap(a);
});

// 10. Same webhook twice / out of order.
await check(10, "The same payment webhook twice is saved once", async () => {
  const o = await order("newUnpaid");
  const s = await post(paymentStatus({ ref: o.ref, rupees: o.total, txnId: "QATXN-PAY-1" }));
  const a = await order("newUnpaid");
  expect(s === 200 && a.paidAmount === o.paidAmount, `paid amount changed to ${a.paidAmount}`);
  return snap(a);
});
await check(10, "A 'failed' update arriving after the success leaves the order paid", async () => {
  const o = await order("newUnpaid");
  await post(paymentStatus({ ref: o.ref, rupees: o.total, status: "failed", txnStatus: "failed", error: { reason: "Timed out" } }));
  const a = await order("newUnpaid");
  expect(a.paidAt && a.status === "PAID" && !a.paymentFailedAt, snap(a));
  return snap(a);
});
await check(10, "Five copies of one webhook in parallel are saved once", async () => {
  const o = await order("confirmedUnpaid");
  const body = paymentStatus({ ref: o.ref, rupees: o.total, txnId: "QATXN-PAR-1" });
  const codes = await Promise.all(Array.from({ length: 5 }, () => post(body)));
  const a = await order("confirmedUnpaid");
  expect(codes.every((c) => c === 200), `codes ${codes}`);
  expect(a.paidAmount === o.total, `paid ${a.paidAmount} for total ${o.total}`);
  return snap(a);
});

// 11. Less than due → part paid; other currency → flagged, not paid.
await check(11, "A smaller amount is kept as a part payment, not 'Paid'", async () => {
  const o = await order("failed");
  await post(paymentStatus({ ref: o.ref, rupees: 100, txnId: "QATXN-PART-1" }));
  const a = await order("failed");
  expect(!a.paidAt && a.paidAmount === 100 && a.status !== "PAID", snap(a));
  return snap(a);
});
await check(11, "A payment in another currency is flagged for staff, never counted", async () => {
  const o = await order("points");
  await post(paymentStatus({ ref: o.ref, rupees: o.total, currency: "USD", txnId: "QATXN-USD-1" }));
  const a = await order("points");
  expect(!a.paidAt && !(a.paidAmount > 0) && a.paymentClaimedAt, snap(a));
  return snap(a);
});

// 12. Another business's reference → ignored.
await check(12, "A payment naming another business's order is ignored", async () => {
  const before = await byRef("QO-1001");
  await post(paymentStatus({ ref: "QO-1001", rupees: before.total }));
  const a = await byRef("QO-1001");
  expect(!a.paidAt && !(a.paidAmount > 0), `QO-1001 changed: ${snap(a)}`);
  return `QO-1001 still ${snap(a)}`;
});

// 13. Payment on a replaced (cancelled) cart → the customer's latest active order.
await check(13, "Paying a replaced cart's link pays the customer's latest open order", async () => {
  const cancelled = await order("cancelled");
  const fresh = await db.order.create({
    data: { ref: "QA-1901", clientId: S.shopId, customerId: cancelled.customerId, items: [{ id: "QA-005", name: "Palm jaggery 1kg", quantity: 2, price: 550 }], total: 1160, status: "NEW", paymentRequestedAt: new Date() },
  });
  await post(paymentStatus({ ref: cancelled.ref, rupees: 1160, txnId: "QATXN-ROUTE-1" }));
  const a = await db.order.findUniqueOrThrow({ where: { id: fresh.id } });
  const c = await order("cancelled");
  expect(a.paidAt && a.paidAmount === 1160, `new order: ${snap(a)}`);
  expect(!c.paidAt, `cancelled order took the money: ${snap(c)}`);
  return `QA-1901 ${snap(a)}; cancelled cart note: ${(c.internalNote ?? "").split("\n").pop()?.slice(0, 90)}`;
});

// 14. Failed webhook → reason shown, unpaid, retry possible.
await check(14, "A failed payment keeps the order unpaid with the reason", async () => {
  const o = await order("claim");
  await post(paymentStatus({ ref: o.ref, rupees: o.total, status: "failed", txnStatus: "failed", error: { reason: "Insufficient balance" } }));
  const a = await order("claim");
  expect(!a.paidAt && a.paymentFailReason === "Insufficient balance", snap(a));
  return snap(a);
});
await check(14, "After a failure, a successful retry marks it paid", async () => {
  const o = await order("claim");
  await post(paymentStatus({ ref: o.ref, rupees: o.total, txnId: "QATXN-RETRY-1" }));
  const a = await order("claim");
  expect(a.paidAt && a.paidAmount === o.total && !a.paymentFailedAt, snap(a));
  return snap(a);
});

// 24. Late webhook after staff recorded the payment → no double payment.
await check(24, "A WhatsApp payment arriving after staff recorded it adds nothing", async () => {
  const o = await order("paidCash");
  await post(paymentStatus({ ref: o.ref, rupees: o.total, txnId: "QATXN-LATE-1" }));
  const a = await order("paidCash");
  expect(a.paidAmount === o.paidAmount && a.paymentSource === "staff", snap(a));
  return snap(a);
});

// Inbound "payment" message bubble with a failed transaction is not counted as paid.
await check(14, "A payment bubble whose transaction failed is not counted as paid", async () => {
  const o = await order("partPaid");
  const cust = await db.customer.findUniqueOrThrow({ where: { id: o.customerId } });
  await db.order.update({ where: { id: o.id }, data: { paymentRequestedAt: new Date() } });
  const body = envelope({
    contacts: [{ wa_id: cust.phone, profile: { name: cust.name } }],
    messages: [{ from: cust.phone, id: `wamid.QAIN${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "payment", payment: { reference_id: o.ref, amount: { value: 58000, offset: 100 }, transaction: { id: "QATXN-BUB-1", status: "failed", error: { reason: "Declined" } } } }],
  });
  const s = await post(body);
  const a = await order("partPaid");
  expect(s === 200 && a.paidAmount === o.paidAmount && !a.paidAt, snap(a));
  return snap(a);
});

await db.$disconnect();
fs.mkdirSync("docs/qa", { recursive: true });
fs.writeFileSync(".git/qa-payments.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.no}] ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
