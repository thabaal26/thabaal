// Smoke test on the VPS, from a copy of the source, while it still has TEST keys and data (deploy/vps/README.md):
//   node --env-file=/srv/thabaal/shared/.env tests/qa/vps-smoke.mjs
// It adds QA data, so it refuses to run on anything but a test setup.
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedQa } from "./seed.mjs";
if (process.env.THABAAL_QA !== "1") {
  console.error("vps-smoke: THABAAL_QA is not 1, so this may be the live database. Not running.");
  process.exit(2);
}
const B = "http://127.0.0.1:3000";
const db = new PrismaClient();
const S = await seedQa(db);
let bad = 0;
const ok = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); if (!c) bad++; };
const get = async (p, tok) => fetch(B + p, { redirect: "manual", headers: tok ? { cookie: `wp_session=${tok}` } : {} });
let r = await get("/api/health"); ok("health", r.status === 200, r.status);
r = await get("/login"); const html = await r.text(); ok("login page", r.status === 200, r.status);
const asset = html.match(/\/_next\/static\/[^"']+\.(?:js|css)/)?.[0];
r = await get(asset ?? "/x"); ok("static asset", r.status === 200, asset?.slice(0, 40));
r = await get("/brands/thabaal/mark.png"); ok("public file", r.status === 200, r.status);
r = await get("/_next/image?url=%2Fbrands%2Fthabaal%2Fmark.png&w=64&q=75"); ok("image optimizer (sharp)", r.status === 200, r.status);
r = await get("/icon"); ok("app icon", r.status === 200, r.status);
r = await get("/dashboard"); ok("no login goes to login", r.status >= 300 && r.status < 400, r.status);
for (const p of ["/dashboard", "/dashboard/replies", "/dashboard/campaigns", "/dashboard/customers", "/dashboard/orders", "/dashboard/templates", "/dashboard/report"]) {
  const t0 = Date.now(); r = await get(p, S.tokens.manager); ok("manager " + p, r.status === 200, `${r.status} ${Date.now() - t0}ms`);
}
r = await get("/admin", S.tokens.admin); ok("admin page", r.status === 200, r.status);
r = await get("/admin", S.tokens.manager); ok("manager kept out of admin", r.status !== 200, r.status);
const page = await (await get("/dashboard/replies", S.tokens.manager)).text();
ok("other shop's chats hidden", !page.includes("ZzOther reply"));
r = await get("/api/chats-live", S.tokens.manager); ok("live check", r.status === 200, r.status);
const c = await db.customer.findUnique({ where: { id: S.customerId } });
const before = await db.reply.count();
const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "w", changes: [{ field: "messages", value: { metadata: { phone_number_id: "qa-pnid-1" }, contacts: [{ wa_id: c.phone, profile: { name: "T" } }], messages: [{ from: c.phone, id: "wamid.vps-smoke-" + Date.now(), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "வணக்கம் VPS" } }] } }] }] });
const sig = "sha256=" + crypto.createHmac("sha256", process.env.META_APP_SECRET).update(body).digest("hex");
r = await fetch(B + "/api/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body }); ok("signed webhook", r.status === 200, r.status);
r = await fetch(B + "/api/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" }, body }); ok("forged webhook refused", r.status >= 400, r.status);
await new Promise((z) => setTimeout(z, 1500));
ok("reply saved", (await db.reply.count()) === before + 1);
const trig = await db.$queryRaw`select count(*)::int n from pg_trigger where not tgisinternal`; ok("triggers from SQL files", trig[0].n > 0, trig[0].n);
await db.$disconnect();
console.log(bad ? `SMOKE FAILED ${bad}` : "SMOKE OK");
process.exit(bad ? 1 : 0);
