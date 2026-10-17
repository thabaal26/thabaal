// QA data for the throw-away test database only (tests/qa/serve.mjs): "QA Test Shop" with a manager, staff and viewer,
// customers and orders in every payment state, chats, templates and a campaign, plus "QA Other Shop" to prove one
// business never sees another's data. Fake phone numbers (91999000xxxx); nothing here reaches WhatsApp or Meta.
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const DAY = 86_400_000;
const ago = (d, h = 10) => new Date(Date.now() - d * DAY - (24 - h) * 3_600_000);

export async function seedQa(db = new PrismaClient()) {
  await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });

  const shop = await db.client.create({
    data: { name: "QA Test Shop", homeCity: "Madurai", businessType: "retail", orderPrefix: "QA", orderSeq: 1000, paymentConfig: "qa_test_upi", tagline: "Cold pressed oils (QA)" },
  });
  const other = await db.client.create({ data: { name: "QA Other Shop", homeCity: "Chennai", businessType: "retail", orderPrefix: "QO", orderSeq: 1000 } });

  const user = (email, name, role, access, clientId) => db.user.create({ data: { email, name, passwordHash: "x", role, access, clientId } });
  const admin = await user("admin@qa.test", "QA Admin", "ADMIN", "MANAGER", null);
  const manager = await user("manager@qa.test", "QA Manager", "CLIENT", "MANAGER", shop.id);
  const staff = await user("staff@qa.test", "QA Staff", "CLIENT", "STAFF", shop.id);
  const viewer = await user("viewer@qa.test", "QA Viewer", "CLIENT", "VIEWER", shop.id);
  const otherMgr = await user("manager@qaother.test", "Other Manager", "CLIENT", "MANAGER", other.id);

  const names = ["Meena Raj", "Karthik S", "Priya Devi", "Arun Kumar", "Lakshmi N", "Suresh Babu", "Divya R", "Ganesh M", "Anitha P", "Vignesh T", "Revathi K", "Muthu Selvam"];
  const areas = ["Anna Nagar", "KK Nagar", "Tallakulam", "Simmakkal", "Thirunagar", "Sellur"];
  const customers = [];
  for (const [i, name] of names.entries()) {
    customers.push(
      await db.customer.create({
        data: {
          clientId: shop.id,
          name,
          phone: `91999000${String(1000 + i).slice(-4)}`,
          location: areas[i % areas.length],
          locationRaw: `No. ${10 + i}, ${areas[i % areas.length]} Main Road, Madurai 6250${10 + (i % 9)}`,
          region: "Madurai city",
          tags: i % 3 === 0 ? ["vip"] : i % 3 === 1 ? ["regular"] : [],
          purchases: i < 3 ? "Groundnut oil, Gingelly oil" : null,
          createdAt: ago(90 - i * 5),
        },
      }),
    );
  }
  const otherCust = await db.customer.create({ data: { clientId: other.id, name: "ZzOther Customer", phone: "919990009999", location: "ZzOtherStreet" } });

  const P = {
    groundnut: { id: "QA-001", name: "Groundnut oil 1L", price: 360 },
    gingelly: { id: "QA-002", name: "Gingelly oil 1L", price: 460 },
    coconut: { id: "QA-003", name: "Coconut oil 500ml", price: 255 },
    ghee: { id: "QA-004", name: "Ghee 200ml", price: 300 },
    jaggery: { id: "QA-005", name: "Palm jaggery 1kg", price: 550 },
  };
  const line = (p, q = 1) => ({ id: p.id, name: p.name, quantity: q, price: p.price, currency: "INR" });
  let seq = 1000;
  const order = async (c, items, extra = {}) => {
    seq += 1;
    const sub = items.reduce((n, i) => n + i.price * i.quantity, 0);
    return db.order.create({
      data: { ref: `QA-${seq}`, clientId: shop.id, customerId: c.id, items, total: sub + 60 - (extra.pointsRedeemed ?? 0) / 2, note: c.locationRaw, ...extra },
    });
  };
  const O = {};
  O.newUnpaid = await order(customers[0], [line(P.groundnut, 2), line(P.ghee)], { status: "NEW", createdAt: ago(0, 9), paymentRequestedAt: ago(0, 9) });
  O.confirmedUnpaid = await order(customers[1], [line(P.gingelly)], { status: "CONFIRMED", createdAt: ago(1), paymentMethod: "upi_whatsapp" });
  O.paidMeta = await order(customers[2], [line(P.coconut, 2)], { status: "PAID", createdAt: ago(2), paidAt: ago(2, 11), paidAmount: 570, paymentMethod: "upi_whatsapp", paymentSource: "meta", paymentTxnId: "QAUPI000111" });
  O.paidCash = await order(customers[3], [line(P.jaggery)], { status: "PAID", createdAt: ago(3), paidAt: ago(3, 12), paidAmount: 610, paymentMethod: "cash", paymentSource: "staff" });
  O.partPaid = await order(customers[4], [line(P.groundnut, 3)], { status: "CONFIRMED", createdAt: ago(1, 15), paidAmount: 500, paymentMethod: "upi", paymentSource: "staff" });
  O.codDispatched = await order(customers[5], [line(P.ghee, 2)], { status: "DISPATCHED", createdAt: ago(2, 8), paymentMethod: "cod" });
  O.delivered = await order(customers[6], [line(P.gingelly), line(P.coconut)], { status: "DELIVERED", createdAt: ago(10), paidAt: ago(10, 12), paidAmount: 775, paymentMethod: "upi_whatsapp", paymentSource: "meta", paymentTxnId: "QAUPI000222" });
  O.cancelled = await order(customers[7], [line(P.jaggery, 2)], { status: "CANCELLED", createdAt: ago(4), internalNote: "Superseded by QA-1013 (₹610.00) · Customer sent a newer cart" });
  O.claim = await order(customers[8], [line(P.groundnut)], { status: "CONFIRMED", createdAt: ago(0, 7), paymentClaimedAt: ago(0, 8), paymentClaimNote: "Customer says paid · UTR 412345678901", paymentMethod: "upi" });
  O.failed = await order(customers[9], [line(P.coconut)], { status: "NEW", createdAt: ago(0, 6), paymentRequestedAt: ago(0, 6), paymentFailedAt: ago(0, 7), paymentFailReason: "Payment declined by bank" });
  O.refunded = await order(customers[10], [line(P.ghee)], { status: "CANCELLED", createdAt: ago(6), paidAt: ago(6, 11), paidAmount: 360, paymentMethod: "upi_whatsapp", paymentSource: "meta", paymentTxnId: "QAUPI000333", refundedAt: ago(5), refundAmount: 360, refundNote: "Out of stock" });
  O.points = await order(customers[0], [line(P.gingelly), line(P.jaggery)], { status: "NEW", createdAt: ago(0, 5), pointsRedeemed: 100 });
  for (let d = 15; d <= 60; d += 9) await order(customers[d % customers.length], [line(P.groundnut), line(P.coconut)], { status: "DELIVERED", createdAt: ago(d), paidAt: ago(d, 12), paidAmount: 675, paymentMethod: "upi_whatsapp", paymentSource: "meta", paymentTxnId: `QAUPIHIST${d}` });
  await db.client.update({ where: { id: shop.id }, data: { orderSeq: seq } });
  await db.order.create({ data: { ref: "QO-1001", clientId: other.id, customerId: otherCust.id, items: [{ id: "ZZ", name: "ZzOtherProduct", quantity: 1, price: 100 }], total: 160 } });

  const tpl = (name, category, body, status = "APPROVED", extra = {}) => db.template.create({ data: { clientId: shop.id, name, category, body, status, language: "en", ...extra } });
  const tMarketing = await tpl("qa_diwali_offer", "MARKETING", "Hi {{1}}, Deepavali offer: 10% off cold pressed oils this week!", "APPROVED", { variables: { "1": "name" } });
  await tpl("order_confirmation", "UTILITY", "Hello {{1}}, thank you for your order. Items: {{2}}. Total: Rs {{3}}.");
  await tpl("payment_request", "UTILITY", "Hello {{1}}, your order is ready. Tap Review and pay to pay by UPI.");
  await tpl("qa_draft_template", "MARKETING", "Draft body {{1}}", "DRAFT");
  await tpl("qa_rejected_template", "MARKETING", "Rejected body", "REJECTED", { statusReason: "Promotional content in utility category" });
  await db.template.create({ data: { clientId: other.id, name: "zz_other_offer", category: "MARKETING", body: "ZzOther body", status: "APPROVED" } });

  await db.campaign.create({ data: { clientId: shop.id, name: "QA Weekend offer", templateId: tMarketing.id, active: false, daysOfWeek: [6], sendTime: "10:00" } });
  for (const [i, c] of customers.slice(0, 8).entries()) {
    const st = ["READ", "DELIVERED", "SENT", "FAILED"][i % 4];
    await db.message.create({ data: { customerId: c.id, templateId: tMarketing.id, templateName: tMarketing.name, body: "Deepavali offer", status: st, simulated: true, provider: "META", createdAt: ago(3, 10), sentAt: ago(3, 10), ...(st === "FAILED" ? { failedAt: ago(3, 10), error: "Message undeliverable" } : {}), ...(st === "READ" ? { readAt: ago(3, 11), deliveredAt: ago(3, 10) } : st === "DELIVERED" ? { deliveredAt: ago(3, 10) } : {}) } });
  }
  const replies = [
    [0, "Hi, is groundnut oil available?", false, 0],
    [1, "What time will you deliver?", false, 0],
    [2, "Thank you, received the order", true, 1],
    [8, "I paid by GPay, UTR 412345678901", false, 0],
    [3, "Send price list", true, 2],
  ];
  for (const [ci, text, handled, d] of replies) await db.reply.create({ data: { customerId: customers[ci].id, text, kind: "text", handled, receivedAt: ago(d, 9 + ci) } });
  await db.reply.create({ data: { customerId: otherCust.id, text: "ZzOther reply", kind: "text" } });

  const sign = (u) => new SignJWT({ sub: u.id, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("24h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return {
    shopId: shop.id,
    otherId: other.id,
    orders: Object.fromEntries(Object.entries(O).map(([k, v]) => [k, { id: v.id, ref: v.ref }])),
    customerId: customers[0].id,
    tokens: { admin: await sign(admin), manager: await sign(manager), staff: await sign(staff), viewer: await sign(viewer), otherManager: await sign(otherMgr) },
  };
}
