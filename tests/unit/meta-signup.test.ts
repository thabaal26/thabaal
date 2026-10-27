import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test, before } from "node:test";
import { db } from "../../src/lib/db";
import {
  appSecretProof,
  closeSignup,
  fetchCustomerToken,
  getSignup,
  listSignups,
  parsePartnerAdded,
  pendingSignupCount,
  recordMetaSignup,
  subscribeToAccount,
} from "../../src/lib/meta-signup";

const TOKEN = "EAAB" + "x".repeat(40);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Meta hosted sign-up: PARTNER_ADDED events", () => {
  test("reads the account and business ids from Meta's event, ignores everything else", () => {
    assert.deepEqual(parsePartnerAdded("999", { event: "PARTNER_ADDED", waba_info: { waba_id: "1234567890", owner_business_id: "9876543210" } }), {
      wabaId: "1234567890",
      ownerBusinessId: "9876543210",
    });
    // The account id may only be on the entry.
    assert.deepEqual(parsePartnerAdded("1234567890", { event: "PARTNER_ADDED" }), { wabaId: "1234567890", ownerBusinessId: null });
    assert.equal(parsePartnerAdded("1234567890", { event: "VERIFIED_ACCOUNT" }), null);
    assert.equal(parsePartnerAdded("1234567890", null), null);
    assert.equal(parsePartnerAdded("", { event: "PARTNER_ADDED" }), null);
    // Ids are plain digits only.
    assert.equal(parsePartnerAdded("x", { event: "PARTNER_ADDED", waba_info: { waba_id: "12; DROP TABLE" } }), null);
    assert.equal(parsePartnerAdded("1234567890", { event: "PARTNER_ADDED", waba_info: { owner_business_id: "abc" } })?.ownerBusinessId, null);
  });

  before(async () => {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "PortalMetaSignup"`);
  });

  test("is saved once per account and counted until it is closed", async () => {
    const ev = { event: "PARTNER_ADDED", waba_info: { waba_id: "5550001111", owner_business_id: "7770001111" } };
    assert.equal(await recordMetaSignup("5550001111", ev), true);
    assert.equal(await recordMetaSignup("5550001111", ev), true); // Meta may resend: still one row
    assert.equal(await recordMetaSignup("5550001111", { event: "ACCOUNT_UPDATE" }), false);
    const all = (await listSignups()).filter((s) => s.wabaId === "5550001111");
    assert.equal(all.length, 1);
    assert.equal(all[0].status, "NEW");
    assert.equal(all[0].ownerBusinessId, "7770001111");
    assert.ok((await pendingSignupCount()) >= 1);

    assert.equal(await closeSignup(all[0].id, "ATTACHED", null, "test"), true);
    assert.equal(await closeSignup(all[0].id, "IGNORED", null, "again"), false, "only a waiting one can be closed");
    assert.equal((await getSignup(all[0].id))?.status, "ATTACHED");
  });

  test("an account a business already uses is not listed as new", async () => {
    const client = await db.client.upsert({ where: { name: "Meta Signup Test Shop" }, update: {}, create: { name: "Meta Signup Test Shop" } });
    await db.whatsAppNumber.deleteMany({ where: { phoneNumberId: "meta-signup-test-phone" } });
    await db.whatsAppNumber.create({ data: { clientId: client.id, label: "Main", phoneNumberId: "meta-signup-test-phone", businessAccountId: "5550002222" } });
    assert.equal(await recordMetaSignup("5550002222", { event: "PARTNER_ADDED", waba_info: { waba_id: "5550002222", owner_business_id: "7770002222" } }), false);
    assert.equal((await listSignups()).some((s) => s.wabaId === "5550002222"), false);
    await db.whatsAppNumber.deleteMany({ where: { phoneNumberId: "meta-signup-test-phone" } });
  });
});

describe("Meta hosted sign-up: fetching the customer's token", () => {
  test("proof is HMAC-SHA256 of the system token keyed with the app secret", () => {
    assert.equal(appSecretProof("tok", "secret"), createHmac("sha256", "secret").update("tok").digest("hex"));
  });

  test("sends the system token and proof, and returns the customer's token", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const r = await fetchCustomerToken({
      businessId: "7770001111",
      systemToken: "SYS",
      appSecret: "sec",
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url: String(url), init };
        return json({ access_token: TOKEN });
      }) as never,
    });
    assert.deepEqual(r, { ok: true, token: TOKEN });
    assert.match(seen!.url, /\/7770001111\/system_user_access_tokens$/);
    assert.equal(seen!.init.method, "POST");
    assert.equal((seen!.init.headers as Record<string, string>).Authorization, "Bearer SYS");
    const body = String(seen!.init.body);
    assert.match(body, /fetch_only=true/);
    assert.ok(body.includes(`appsecret_proof=${appSecretProof("SYS", "sec")}`));
  });

  test("turns every failure into a plain message and never throws", async () => {
    const base = { businessId: "7770001111", systemToken: "SYS", appSecret: "sec" };
    const refused = await fetchCustomerToken({ ...base, fetchImpl: (async () => json({ error: { message: "Invalid OAuth access token", code: 190 } }, 400)) as never });
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? "" : refused.message, /Invalid OAuth access token \(code 190\)/);
    const odd = await fetchCustomerToken({ ...base, fetchImpl: (async () => json({ access_token: "nope" })) as never });
    assert.equal(odd.ok, false);
    const down = await fetchCustomerToken({ ...base, fetchImpl: (async () => { throw new Error("offline"); }) as never });
    assert.equal(down.ok, false);
    const noId = await fetchCustomerToken({ ...base, businessId: "", fetchImpl: (async () => json({ access_token: TOKEN })) as never });
    assert.equal(noId.ok, false);
  });

  test("webhook subscription reports whether Meta confirmed it", async () => {
    assert.equal(await subscribeToAccount("5550001111", TOKEN, (async () => json({ success: true })) as never), true);
    assert.equal(await subscribeToAccount("5550001111", TOKEN, (async () => json({ error: { message: "x" } }, 400)) as never), false);
    assert.equal(await subscribeToAccount("5550001111", TOKEN, (async () => { throw new Error("offline"); }) as never), false);
  });
});
