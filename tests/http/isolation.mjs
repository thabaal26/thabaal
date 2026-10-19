// Two businesses, each with customers, orders, replies, messages, templates and a campaign, all marked with unique
// words. Each one's manager opens every page and export of the running app; none may ever show the other's words.
// Also checks a reply sent to one business's WhatsApp number lands with that business only.
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3200";
const db = new PrismaClient();
const results = [];
const check = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

async function seed(tag, city) {
  const client = await db.client.create({ data: { name: `Iso ${tag} Traders`, homeCity: city, orderPrefix: `I${tag}` } });
  const user = await db.user.create({ data: { email: `manager-${tag.toLowerCase()}@iso.test`, name: `Manager ${tag}`, passwordHash: "x", role: "CLIENT", access: "MANAGER", clientId: client.id } });
  const customers = [];
  for (let i = 1; i <= 3; i++) {
    customers.push(await db.customer.create({ data: { clientId: client.id, phone: `91900000${tag === "A" ? 1 : 2}00${i}`, name: `Zq${tag}Customer${i}`, location: `Zq${tag}Street ${i}`, tags: [`zq${tag.toLowerCase()}tag`] } }));
  }
  // The same phone number is a customer of both businesses.
  customers.push(await db.customer.create({ data: { clientId: client.id, phone: "919999900000", name: `Zq${tag}Shared` } }));
  const template = await db.template.create({ data: { clientId: client.id, name: `zq${tag.toLowerCase()}_offer`, language: "en", category: "MARKETING", body: `Zq${tag} offer body`, status: "APPROVED" } });
  await db.campaign.create({ data: { clientId: client.id, name: `Zq${tag} Campaign`, templateId: template.id } });
  for (const [i, c] of customers.entries()) {
    await db.order.create({ data: { ref: `I${tag}-${1001 + i}`, clientId: client.id, customerId: c.id, items: [{ id: `sku-${tag}`, name: `Zq${tag}Product`, quantity: 1, price: 100, currency: "INR" }], total: 100, note: `Zq${tag}Address` } });
    await db.reply.create({ data: { customerId: c.id, text: `Zq${tag} reply text ${i}`, kind: "text" } });
    await db.message.create({ data: { customerId: c.id, templateName: template.name, body: `Zq${tag} message body`, status: "DELIVERED", provider: "META", sentAt: new Date() } });
  }
  await db.whatsAppNumber.create({ data: { clientId: client.id, label: `Zq${tag}Number`, phoneNumberId: `PNISO${tag}`, businessAccountId: `WABAISO${tag}`, token: `EAAisotoken${tag}` } });
  const token = await new SignJWT({ sub: user.id, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  return { tag, client, token, customers };
}

const PAGES = [
  "/dashboard", "/dashboard/customers", "/dashboard/customers/audiences", "/dashboard/settings/fields", "/dashboard/settings/sheet",
  "/dashboard/orders", "/dashboard/orders/packing", "/dashboard/replies", "/dashboard/replies/priority", "/dashboard/messages",
  "/dashboard/notifications", "/dashboard/campaigns", "/dashboard/campaigns/new", "/dashboard/campaigns/compare", "/dashboard/templates",
  "/dashboard/catalogue", "/dashboard/refills", "/dashboard/report", "/dashboard/revenue", "/dashboard/wallet", "/dashboard/calls",
  "/dashboard/settings", "/api/customers/export", "/api/messages/export", "/api/notifications",
];

async function get(path, token) {
  const r = await fetch(BASE + path, { headers: { cookie: `wp_session=${token}` }, redirect: "manual" });
  return { status: r.status, location: r.headers.get("location") ?? "", body: await r.text() };
}

const words = (tag) => [`Zq${tag}Customer`, `Zq${tag}Street`, `zq${tag.toLowerCase()}tag`, `Zq${tag} reply text`, `Zq${tag} message body`, `Zq${tag} Campaign`, `zq${tag.toLowerCase()}_offer`, `Zq${tag}Product`, `Zq${tag}Address`, `Zq${tag}Number`, `I${tag}-100`, `Iso ${tag} Traders`];

try {
  const A = await seed("A", "Chennai");
  const B = await seed("B", "Coimbatore");
  for (const [me, other] of [[A, B], [B, A]]) {
    let leaks = 0;
    for (const p of PAGES) {
      const r = await get(p, me.token);
      const leaked = words(other.tag).filter((w) => r.body.includes(w));
      const ok = r.status === 200 && !leaked.length;
      if (!ok) leaks++;
      if (!ok || process.env.VERBOSE) check(`${me.tag} manager ${p}`, ok, `${r.status}${r.location ? " → " + r.location : ""}${leaked.length ? " leaked: " + leaked.join(", ") : ""}`);
    }
    check(`${me.tag} manager: ${PAGES.length} pages and exports show none of ${other.tag}'s data`, leaks === 0);
    // And the pages really show this business's own data (so an empty or login page can't pass by accident).
    const own = [
      ["/dashboard/customers", `Zq${me.tag}Customer1`],
      ["/dashboard/orders", `I${me.tag}-1001`],
      ["/api/customers/export", `Zq${me.tag}Customer2`],
    ];
    for (const [p, w] of own) {
      const r = await get(p, me.token);
      check(`${me.tag} manager sees own data on ${p}`, r.status === 200 && r.body.includes(w), String(r.status));
    }
    // Opening the other business's customer directly must not show it.
    const r = await get(`/dashboard/customers/${other.customers[0].id}`, me.token);
    check(`${me.tag} manager can't open ${other.tag}'s customer`, !r.body.includes(other.customers[0].name), String(r.status));
    // Searching the other business's order number finds nothing.
    const s = await get(`/dashboard/orders?q=I${other.tag}-1001`, me.token);
    check(`${me.tag} manager can't find ${other.tag}'s order by number`, !s.body.includes(`Zq${other.tag}Product`), String(s.status));
  }

  // A reply to business A's number, from a phone that is a customer of both, is recorded for A only.
  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABAISOA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PNISOA", display_phone_number: "910000000000" }, contacts: [{ wa_id: "919999900000", profile: { name: "Shared" } }], messages: [{ from: "919999900000", id: "wamid.ISO1", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "ZqRoutedReply" } }] } }] }],
  });
  const sig = "sha256=" + createHmac("sha256", process.env.META_APP_SECRET).update(payload).digest("hex");
  const w = await fetch(BASE + "/api/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body: payload });
  await new Promise((r) => setTimeout(r, 1500));
  const routed = await db.reply.findMany({ where: { text: "ZqRoutedReply" }, select: { customer: { select: { clientId: true } } } });
  check("webhook reply lands with the business whose number received it", w.status === 200 && routed.length === 1 && routed[0].customer.clientId === A.client.id, `status ${w.status}, ${routed.length} stored`);
  const unsigned = await fetch(BASE + "/api/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: payload });
  check("webhook without Meta's signature is refused", unsigned.status === 401 || unsigned.status === 403, String(unsigned.status));
} finally {
  await db.$disconnect();
}
const failed = results.filter((r) => !r.pass);
console.log(`\nIsolation: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
