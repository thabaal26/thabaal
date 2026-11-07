// Meta's messaging limit follows the business up its tiers (250, 2,000, 10,000, 100,000, unlimited). Meta's deprecated
// field can keep saying TIER_250 after a raise, so it must never overwrite the portfolio limit, and an answer without a
// limit must never reset what we know. Meta is never called: fetch is a fake.
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { allowance, estimateTier, freshenNumbers, numberHealth, refreshNumberStatus, tierFromMeta, tierLimit } from "../../src/lib/limits";
import { fetchMetaLiveStatus } from "../../src/lib/meta-balance";

const realFetch = globalThis.fetch;
let clientId = "";
let numberId = "";
const PHONE = "limit-test-pnid";

function fakeMeta(phone: Record<string, unknown>) {
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/phone_numbers")) return Response.json({ data: [{ id: PHONE, ...phone }] });
    if (u.includes(`/${PHONE}`)) return Response.json({ id: PHONE, ...phone });
    return Response.json({ id: "limit-test-waba", name: "Limit Test", data: [] });
  }) as typeof fetch;
}
const stored = async () => (await db.whatsAppNumber.findUniqueOrThrow({ where: { id: numberId } })).messagingTier;
const setTier = (messagingTier: string | null) => db.whatsAppNumber.update({ where: { id: numberId }, data: { messagingTier } });

describe("Meta messaging limit", () => {
  before(async () => {
    const c = await db.client.create({ data: { name: `Limit Test ${Date.now()}`, waToken: "plain-test-token", waBusinessAccountId: "limit-test-waba", waPhoneNumberId: PHONE } });
    clientId = c.id;
    const n = await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: PHONE, businessAccountId: "limit-test-waba", isDefault: true } });
    numberId = n.id;
  });
  afterEach(() => { globalThis.fetch = realFetch; });
  after(async () => { await db.client.delete({ where: { id: clientId } }).catch(() => {}); });

  test("every tier on Meta's ladder has its limit", () => {
    assert.deepEqual(
      ["TIER_250", "TIER_2K", "TIER_10K", "TIER_100K", "TIER_UNLIMITED"].map(tierLimit),
      [250, 2_000, 10_000, 100_000, null],
    );
  });

  test("the portfolio limit wins over the deprecated field", () => {
    assert.equal(tierFromMeta({ whatsapp_business_manager_messaging_limit: "TIER_2K", messaging_limit_tier: "TIER_250" }), "TIER_2K");
    assert.equal(tierFromMeta({ whatsapp_business_manager_messaging_limit: { current_limit: "TIER_10K" } }), "TIER_10K");
    assert.equal(tierFromMeta({ messaging_limit_tier: "TIER_250" }), "TIER_250");
    assert.equal(tierFromMeta({}), null);
  });

  test("a refresh raises the limit, and an answer without one keeps it", async () => {
    await setTier("TIER_250");
    fakeMeta({ whatsapp_business_manager_messaging_limit: "TIER_2K", messaging_limit_tier: "TIER_250" });
    await refreshNumberStatus({ id: numberId, phoneNumberId: PHONE, token: "t" }, null);
    assert.equal(await stored(), "TIER_2K");

    fakeMeta({ quality_rating: "GREEN" });
    await refreshNumberStatus({ id: numberId, phoneNumberId: PHONE, token: "t" }, null);
    assert.equal(await stored(), "TIER_2K");
  });

  test("a field Meta removed doesn't stop the limit from coming through", async () => {
    await db.whatsAppNumber.update({ where: { id: numberId }, data: { messagingTier: "TIER_250", statusCheckedAt: null } });
    // Meta refuses any request that still asks for the removed per-number field.
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes("messaging_limit_tier")) return Response.json({ error: { message: "Tried accessing nonexisting field (messaging_limit_tier)", code: 100 } });
      if (u.includes("/phone_numbers")) return Response.json({ data: [{ id: PHONE, whatsapp_business_manager_messaging_limit: "TIER_2K" }] });
      return Response.json({ id: PHONE, whatsapp_business_manager_messaging_limit: "TIER_2K", quality_rating: "GREEN" });
    }) as typeof fetch;
    await refreshNumberStatus({ id: numberId, phoneNumberId: PHONE, token: "t" }, null);
    assert.equal(await stored(), "TIER_2K");
    await setTier("TIER_250");
    await fetchMetaLiveStatus(clientId);
    assert.equal(await stored(), "TIER_2K");
  });

  test("the Home status check doesn't pull a raised limit back to 250", async () => {
    await setTier("TIER_2K");
    fakeMeta({ whatsapp_business_manager_messaging_limit: "TIER_2K", messaging_limit_tier: "TIER_250" });
    await fetchMetaLiveStatus(clientId);
    assert.equal(await stored(), "TIER_2K");

    await setTier("TIER_10K");
    fakeMeta({ quality_rating: "GREEN" });
    await fetchMetaLiveStatus(clientId);
    assert.equal(await stored(), "TIER_10K");
  });

  test("an old limit is asked again by itself; a fresh one isn't", async () => {
    await db.whatsAppNumber.update({ where: { id: numberId }, data: { messagingTier: "TIER_250", statusCheckedAt: new Date(Date.now() - 60 * 60_000) } });
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({ id: PHONE, whatsapp_business_manager_messaging_limit: "TIER_2K" }); }) as typeof fetch;
    const health = await numberHealth(clientId);
    assert.equal(await stored(), "TIER_2K");
    assert.equal(health[0].limit, 2_000);
    const before = calls;
    assert.equal(await freshenNumbers({ ids: [numberId] }), 0);
    assert.equal(calls, before);
  });

  test("what's shown left is exact: the limit minus people reached in 24 hours", async () => {
    await db.whatsAppNumber.update({ where: { id: numberId }, data: { messagingTier: "TIER_2K", statusCheckedAt: new Date() } });
    const c = await db.customer.create({ data: { clientId, name: "Limit test", phone: `9199${Date.now()}`.slice(0, 12) } });
    await db.message.create({ data: { customerId: c.id, templateName: "t", status: "SENT", senderId: numberId, sentAt: new Date() } });
    const [h] = await numberHealth(clientId);
    assert.equal(h.limit, 2_000);
    assert.equal(h.used, 1);
    assert.equal(h.left, 1_999);
  });

  test("Meta's limit never holds sends back; only an admin's warm-up cap does", async () => {
    const n = await db.whatsAppNumber.findUniqueOrThrow({ where: { id: numberId } });
    assert.equal((await allowance({ ...n, messagingTier: "TIER_250", dailyCap: null })).unlimited, true);
    const capped = await allowance({ ...n, messagingTier: "TIER_UNLIMITED", dailyCap: 50 });
    assert.equal(capped.unlimited, false);
    assert.ok(capped.left <= 50);
  });

  test("the limit rises by itself from our own sends, the way Meta raises it", async () => {
    await db.message.deleteMany({ where: { senderId: numberId } });
    await db.whatsAppNumber.update({ where: { id: numberId }, data: { messagingTier: "TIER_250", qualityRating: "GREEN" } });
    let e = await estimateTier(clientId);
    assert.equal(e?.tier, "TIER_250");
    assert.deepEqual(e?.next && { need: e.next.need, days: e.next.days }, { need: 2_000, days: 30 });
    const stamp = Date.now();
    await db.customer.createMany({ data: Array.from({ length: 2_000 }, (_, k) => ({ clientId, name: `Reach ${k}`, phone: `7${stamp}${String(k).padStart(4, "0")}` })) });
    const cs = await db.customer.findMany({ where: { clientId, name: { startsWith: "Reach " } }, select: { id: true } });
    await db.message.createMany({ data: cs.map((c) => ({ customerId: c.id, templateName: "t", status: "DELIVERED" as const, senderId: numberId, sentAt: new Date() })) });
    e = await estimateTier(clientId);
    assert.equal(e?.tier, "TIER_2K");
    assert.equal(await stored(), "TIER_2K");
    // 2,000 reached this week is half of 2,000: one more step; 10,000 then needs 5,000.
    e = await estimateTier(clientId);
    assert.equal(e?.tier, "TIER_10K");
    assert.equal(e?.next?.need, 5_000);
    assert.equal((await estimateTier(clientId))?.tier, "TIER_10K");
    // Low quality: no raise.
    await db.whatsAppNumber.update({ where: { id: numberId }, data: { messagingTier: "TIER_2K", qualityRating: "RED" } });
    assert.equal((await estimateTier(clientId))?.tier, "TIER_2K");
    await db.message.deleteMany({ where: { senderId: numberId } });
    await db.whatsAppNumber.update({ where: { id: numberId }, data: { qualityRating: "GREEN" } });
  });

});
