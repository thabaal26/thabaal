// API, authentication and data-isolation checks against the QA app (node tests/qa/serve.mjs first).
// Every /api route is called without a login, with each role, with forged or stale sessions, and with another
// business's login, and the status code AND the body are checked (a 200 alone proves nothing).
//   node tests/qa/api.mjs        → prints one line per check; results in .git/qa-api.json
import crypto from "node:crypto";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = process.env.BASE ?? S.base;
if (!/localhost|127\.0\.0\.1/.test(BASE) || !/@localhost:/.test(S.dbUrl)) throw new Error("QA app and QA database only");
const db = new PrismaClient({ datasources: { db: { url: S.dbUrl } } });
const AUTH_SECRET = "qa-auth-secret-0123456789abcdefghijklmnopqr"; // tests/qa/serve.mjs

const results = [];
const check = async (id, name, fn) => {
  try {
    const detail = await fn();
    results.push({ id, name, status: "PASS", detail: detail ?? "" });
    console.log(`PASS ${id} ${name}`);
  } catch (e) {
    results.push({ id, name, status: "FAIL", detail: String(e?.message ?? e).slice(0, 300) });
    console.log(`FAIL ${id} ${name}: ${String(e?.message ?? e).slice(0, 200)}`);
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const cookie = (t) => ({ cookie: `wp_session=${t}` });
const get = (path, headers = {}, init = {}) => fetch(BASE + path, { redirect: "manual", headers, ...init });
const isLoginRedirect = (r) => [302, 303, 307, 308].includes(r.status) && /\/(login|api\/session\/clear)/.test(r.headers.get("location") ?? "");
const sign = (payload, secret = AUTH_SECRET, exp = "1h") =>
  new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(exp).sign(new TextEncoder().encode(secret));
const users = Object.fromEntries((await db.user.findMany({ select: { id: true, email: true } })).map((u) => [u.email, u.id]));
const managerId = users[Object.keys(users).find((e) => /^manager@qa\.test$/.test(e))];

// ── Scheduler and webhooks ──
await check("API-01", "cron: no secret → 401", async () => {
  const r = await get("/api/cron");
  expect(r.status === 401, `got ${r.status}`);
});
await check("API-02", "cron: wrong Bearer secret → 401", async () => {
  const r = await get("/api/cron?probe=key", { authorization: "Bearer wrong" });
  expect(r.status === 401, `got ${r.status}`);
});
await check("API-03", "cron: right secret, key probe → 200 with key fingerprint only", async () => {
  const r = await get("/api/cron?probe=key", { authorization: `Bearer ${S.cronSecret}` });
  const j = await r.json();
  expect(r.status === 200 && typeof j.encryptionKey === "string" && Object.keys(j).length === 1, `got ${r.status} ${JSON.stringify(j)}`);
});
await check("API-04", "Meta webhook verify: wrong token → 403, right token echoes challenge", async () => {
  const bad = await get("/api/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123");
  const ok = await get("/api/webhook?hub.mode=subscribe&hub.verify_token=qa-verify-token&hub.challenge=9876");
  expect(bad.status === 403, `wrong token got ${bad.status}`);
  expect(ok.status === 200 && (await ok.text()) === "9876", `right token got ${ok.status}`);
});
const hmac = (raw) => "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(raw).digest("hex");
await check("API-05", "Meta webhook POST: no signature → 401, forged signature → 401", async () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const a = await get("/api/webhook", { "content-type": "application/json" }, { method: "POST", body });
  const b = await get("/api/webhook", { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) }, { method: "POST", body });
  expect(a.status === 401 && b.status === 401, `got ${a.status}, ${b.status}`);
});
await check("API-06", "Meta webhook POST: signed but malformed JSON → 400; signed empty event → 200", async () => {
  const bad = "{not json";
  const r = await get("/api/webhook", { "content-type": "application/json", "x-hub-signature-256": hmac(bad) }, { method: "POST", body: bad });
  const good = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const r2 = await get("/api/webhook", { "content-type": "application/json", "x-hub-signature-256": hmac(good) }, { method: "POST", body: good });
  expect(r.status === 400, `malformed got ${r.status}`);
  expect(r2.status === 200, `empty event got ${r2.status}`);
});
await check("API-07", "WAHA webhook: no key → 403", async () => {
  const r = await get("/api/waha/webhook", { "content-type": "application/json" }, { method: "POST", body: "{}" });
  expect(r.status === 403, `got ${r.status}`);
});

// ── Logged-in JSON and CSV endpoints ──
for (const [id, path] of [["API-08", "/api/calls"], ["API-09", "/api/notifications"], ["API-10", "/api/customers/export"], ["API-11", "/api/messages/export"]]) {
  await check(id, `${path}: no login → 401`, async () => {
    const r = await get(path);
    expect(r.status === 401, `got ${r.status}`);
  });
}
await check("API-12", "calls + notifications: manager → 200 JSON", async () => {
  for (const p of ["/api/calls", "/api/notifications"]) {
    const r = await get(p, cookie(S.tokens.manager));
    expect(r.status === 200 && /json/.test(r.headers.get("content-type") ?? ""), `${p} got ${r.status} ${r.headers.get("content-type")}`);
    await r.json();
  }
});
await check("API-13", "customers export: viewer and staff → 403 (managers only)", async () => {
  for (const role of ["viewer", "staff"]) {
    const r = await get("/api/customers/export", cookie(S.tokens[role]));
    expect(r.status === 403, `${role} got ${r.status}`);
  }
});
await check("API-14", "customers export: manager gets own customers as CSV, none of the other shop's", async () => {
  const r = await get("/api/customers/export", cookie(S.tokens.manager));
  const t = await r.text();
  const own = await db.customer.findMany({ where: { clientId: S.shopId }, select: { name: true }, take: 3 });
  const other = await db.customer.findMany({ where: { clientId: S.otherId }, select: { name: true } });
  expect(r.status === 200 && /text\/csv/.test(r.headers.get("content-type") ?? ""), `got ${r.status} ${r.headers.get("content-type")}`);
  for (const c of own) expect(t.includes(c.name), `own customer ${c.name} missing`);
  for (const c of other) expect(!t.includes(c.name), `other shop's customer ${c.name} leaked`);
  return `${t.split("\n").length - 1} rows`;
});
await check("API-15", "customers export: other shop's manager never sees QA Test Shop customers", async () => {
  const t = await (await get("/api/customers/export", cookie(S.tokens.otherManager))).text();
  const own = await db.customer.findMany({ where: { clientId: S.shopId }, select: { phone: true } });
  for (const c of own) expect(!t.includes(c.phone), `QA customer ${c.phone} leaked to the other shop`);
});
await check("API-16", "messages export: other shop's manager never sees QA Test Shop messages", async () => {
  const r = await get("/api/messages/export", cookie(S.tokens.otherManager));
  const t = await r.text();
  const own = await db.customer.findMany({ where: { clientId: S.shopId }, select: { phone: true } });
  expect(r.status === 200, `got ${r.status}`);
  for (const c of own) expect(!t.includes(c.phone), `QA customer ${c.phone} leaked in messages export`);
});

// ── Sessions ──
await check("API-17", "dashboard without a login redirects to /login", async () => {
  const r = await get("/dashboard");
  expect(isLoginRedirect(r), `got ${r.status} → ${r.headers.get("location")}`);
});
await check("API-18", "session signed with the wrong secret is rejected (page and API)", async () => {
  const t = await sign({ sub: managerId, sv: 0 }, "not-the-real-secret-0123456789abcdefgh");
  const page = await get("/dashboard", cookie(t));
  const api = await get("/api/notifications", cookie(t));
  expect(isLoginRedirect(page), `page got ${page.status}`);
  expect(api.status === 401, `api got ${api.status}`);
});
await check("API-19", "expired session is rejected", async () => {
  const t = await new SignJWT({ sub: managerId, sv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(new TextEncoder().encode(AUTH_SECRET));
  const page = await get("/dashboard", cookie(t));
  const api = await get("/api/notifications", cookie(t));
  expect(isLoginRedirect(page) && api.status === 401, `page ${page.status}, api ${api.status}`);
});
await check("API-20", "'alg: none' token is rejected", async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const t = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: managerId, sv: 0, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
  const api = await get("/api/notifications", cookie(t));
  expect(api.status === 401, `api got ${api.status}`);
});
await check("API-21", "after 'sign out everywhere' (session version bumped) an old session is refused on pages and APIs", async () => {
  const before = await db.user.findUnique({ where: { id: managerId }, select: { sessionVersion: true } });
  const old = await sign({ sub: managerId, sv: before.sessionVersion });
  await db.user.update({ where: { id: managerId }, data: { sessionVersion: { increment: 1 } } });
  try {
    const page = await get("/dashboard", cookie(old));
    const results = {};
    for (const p of ["/api/notifications", "/api/calls", "/api/customers/export", "/api/messages/export"]) results[p] = (await get(p, cookie(old))).status;
    expect(isLoginRedirect(page), `page got ${page.status}`);
    const leaked = Object.entries(results).filter(([, s]) => s === 200);
    expect(!leaked.length, `old session still accepted by ${leaked.map(([p]) => p).join(", ")}`);
    return JSON.stringify(results);
  } finally {
    await db.user.update({ where: { id: managerId }, data: { sessionVersion: before.sessionVersion } });
  }
});
await check("API-22", "/api/session/clear removes the cookie and goes to /login", async () => {
  const r = await get("/api/session/clear", cookie(S.tokens.manager));
  const sc = r.headers.get("set-cookie") ?? "";
  expect(isLoginRedirect(r), `got ${r.status}`);
  expect(/wp_session=;|wp_session=""|wp_session=.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i.test(sc), `cookie not cleared: ${sc.slice(0, 120)}`);
});
await check("API-23", "Google sign-in: not configured → clear error; callback with a forged state → state_mismatch", async () => {
  const a = await get("/api/auth/google");
  const b = await get("/api/auth/google/callback?code=x&state=forged");
  expect(/error=google_not_configured/.test(a.headers.get("location") ?? ""), `start → ${a.headers.get("location")}`);
  expect(/error=(state_mismatch|google_not_configured|google_auth_failed)/.test(b.headers.get("location") ?? ""), `callback → ${b.headers.get("location")}`);
});

// ── Uploads ──
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
// The route takes the raw file as the body, its type in Content-Type and its name in ?filename= (as the editor sends it).
const upload = (token, bytes, type, name) =>
  get(`/api/upload?filename=${encodeURIComponent(name)}`, { "content-type": type, ...(token ? cookie(token) : {}) }, { method: "POST", body: bytes });
await check("API-24", "upload: no login or viewer → refused, nothing stored", async () => {
  const n0 = await db.uploadedImage?.count?.().catch(() => null);
  const a = await upload(null, PNG, "image/png", "a.png");
  const b = await upload(S.tokens.viewer, PNG, "image/png", "a.png");
  expect([401, 403].includes(a.status) || [302, 303, 307].includes(a.status), `no login got ${a.status}`);
  expect(b.status === 403, `viewer got ${b.status}`);
  const n1 = await db.uploadedImage?.count?.().catch(() => null);
  if (n0 != null) expect(n0 === n1, "a refused upload was stored");
});
await check("API-25", "upload: wrong type and a text file named .png → 400", async () => {
  const a = await upload(S.tokens.manager, Buffer.from("hello"), "text/plain", "a.txt");
  const b = await upload(S.tokens.manager, Buffer.from("<script>alert(1)</script>"), "image/png", "evil.png");
  expect(a.status === 400 && b.status === 400, `text ${a.status}, fake png ${b.status}`);
});
await check("API-26", "upload: real PNG → 200, served back with nosniff and a sandbox CSP", async () => {
  const r = await upload(S.tokens.manager, PNG, "image/png", "pixel.png");
  const j = await r.json();
  expect(r.status === 200, `got ${r.status} ${JSON.stringify(j)}`);
  const url = j.url ?? j.path ?? (j.id ? `/api/upload/${j.id}` : null);
  expect(url, `no url in ${JSON.stringify(j)}`);
  const g = await get(new URL(url, BASE).pathname);
  expect(g.status === 200 && g.headers.get("content-type") === "image/png", `served ${g.status} ${g.headers.get("content-type")}`);
  expect(g.headers.get("x-content-type-options") === "nosniff" && /sandbox/.test(g.headers.get("content-security-policy") ?? ""), "missing safety headers");
});
await check("API-27", "upload: unknown id → 404", async () => {
  const r = await get("/api/upload/doesnotexist123");
  expect(r.status === 404, `got ${r.status}`);
});

// ── Media of another business ──
await check("API-28", "media: a reply belonging to the other shop → 404 for the QA manager", async () => {
  const otherCustomer = await db.customer.findFirst({ where: { clientId: S.otherId } });
  const rep = await db.reply.create({ data: { customerId: otherCustomer.id, text: "ZzOther photo", kind: "image", mediaId: "qa-media-other" } });
  try {
    const mine = await get(`/api/media/${rep.id}`, cookie(S.tokens.manager));
    const theirs = await get(`/api/media/${rep.id}`, cookie(S.tokens.otherManager));
    expect(mine.status === 404, `QA manager got ${mine.status}`);
    expect(theirs.status === 503, `owner got ${theirs.status} (expected 503: no WhatsApp in QA)`);
  } finally {
    await db.reply.delete({ where: { id: rep.id } });
  }
});
await check("API-29", "manifest: public, valid install manifest", async () => {
  const r = await get(`/api/manifest/${S.shopId}`);
  const j = await r.json();
  expect(r.status === 200 && j.name === "Thabaal" && j.icons?.length >= 2 && j.start_url === "/dashboard", `got ${r.status}`);
});
await check("API-30", "unknown API route → 404, not a crash", async () => {
  const r = await get("/api/does-not-exist");
  expect(r.status === 404, `got ${r.status}`);
});

// ── Database: the Postgres trigger that stamps order step times (prisma/sql/2026-10-18-order-step-times.sql) ──
await check("DB-01", "order step times: stamped on the way forward, cleared when an order moves back", async () => {
  const o = await db.order.findFirst({ where: { clientId: S.shopId, status: "NEW" } });
  expect(o, "no NEW order in the QA shop");
  const at = async () => db.order.findUnique({ where: { id: o.id }, select: { confirmedAt: true, dispatchedAt: true, deliveredAt: true } });
  const shape = (r) => [r.confirmedAt ? "c" : "-", r.dispatchedAt ? "d" : "-", r.deliveredAt ? "v" : "-"].join("");
  const seen = [];
  try {
    for (const status of ["CONFIRMED", "DISPATCHED", "DELIVERED", "CONFIRMED", "NEW"]) {
      await db.order.update({ where: { id: o.id }, data: { status } });
      seen.push(`${status}:${shape(await at())}`);
    }
  } finally {
    await db.order.update({ where: { id: o.id }, data: { status: o.status, confirmedAt: o.confirmedAt, dispatchedAt: o.dispatchedAt, deliveredAt: o.deliveredAt } });
  }
  expect(seen.join(" ") === "CONFIRMED:c-- DISPATCHED:cd- DELIVERED:cdv CONFIRMED:c-- NEW:---", `got ${seen.join(" ")}`);
  return seen.join(" ");
});
await check("DB-02", "order references are unique (the database refuses a second order with the same ref)", async () => {
  const o = await db.order.findFirst({ where: { clientId: S.shopId, ref: { not: null } } });
  expect(o, "no order with a ref");
  const dup = await db.order.create({ data: { clientId: S.shopId, customerId: o.customerId, ref: o.ref, total: 1, items: [] } }).then(
    async (x) => {
      await db.order.delete({ where: { id: x.id } });
      return "created";
    },
    (e) => e.code ?? "error",
  );
  expect(dup === "P2002", `duplicate ref → ${dup}`);
});

await db.$disconnect();
fs.writeFileSync(".git/qa-api.json", JSON.stringify(results, null, 1));
const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
