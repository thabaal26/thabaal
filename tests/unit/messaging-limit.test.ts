// Meta's messaging limit follows the business up its tiers (250, 2,000, 10,000, 100,000, unlimited). Meta's deprecated
// field can keep saying TIER_250 after a raise, so it must never overwrite the portfolio limit, and an answer without a
// limit must never reset what we know. Meta is never called: fetch is a fake.
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { allowance, freshenNumbers, numberHealth, refreshNumberStatus, tierFromMeta, tierLimit } from "../../src/lib/limits";
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

  test("a raised limit lets a campaign reach more people today, up to unlimited", async () => {
    const n = await db.whatsAppNumber.findUniqueOrThrow({ where: { id: numberId } });
    assert.ok((await allowance({ ...n, messagingTier: "TIER_250" })).left <= 250);
    assert.ok((await allowance({ ...n, messagingTier: "TIER_2K" })).left > 1_000);
    assert.equal((await allowance({ ...n, messagingTier: "TIER_UNLIMITED" })).unlimited, true);
  });
});
