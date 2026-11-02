// A campaign's people: added by hand on top of "Send to", left out by hand (test numbers), and, when the campaign
// says so, people who didn't open their last 3 offers left out at send time with the reason. Meta is a fake.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { campaignAudienceWhere } from "../../src/lib/audiences";
import { db } from "../../src/lib/db";
import { runDueCampaigns } from "../../src/lib/dispatcher";
import { notOpeningOffers } from "../../src/lib/engagement";

const DAY = 86_400_000;
const FAR = new Date("2099-03-01T04:30:00Z");

describe("campaign people", () => {
  let clientId: string;
  let templateId: string;
  const ids: Record<string, string> = {};
  const realFetch = globalThis.fetch;
  const sentTo: string[] = [];
  const PHONE = `9177${String(Date.now()).slice(-6)}`;

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (String(url).endsWith("/messages") && body.to) sentTo.push(body.to);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.people${sentTo.length}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    clientId = (await db.client.create({ data: { name: `QA People ${Date.now()}`, orderPrefix: "QP", quietFrom: null, quietTo: null, marketingGapHours: 0 } })).id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: `qa-people-${Date.now()}`, businessAccountId: "qa-people-waba", token: "qa-fake-token", isDefault: true, messagingTier: "TIER_1K" } });
    for (const [k, i, tags] of [["anu", 1, ["ghee"]], ["bala", 2, ["ghee"]], ["chitra", 3, []], ["test", 4, ["test"]], ["unread", 5, []]] as const) {
      ids[k] = (await db.customer.create({ data: { clientId, phone: `${PHONE}${i}`, name: k, tags: [...tags] } })).id;
    }
    templateId = (await db.template.create({ data: { clientId, businessAccountId: "qa-people-waba", name: "qa_people_offer", category: "MARKETING", status: "APPROVED", language: "en", body: "Offer" } })).id;
    // "unread": their last 3 offers were delivered and none read; "chitra": 3 offers, one read.
    const old = await db.campaign.create({ data: { clientId, name: "old", templateId, scheduleType: "ONCE", active: false } });
    const run = await db.campaignRun.create({ data: { campaignId: old.id, scheduledFor: new Date(Date.now() - 20 * DAY), status: "COMPLETED", total: 6 } });
    for (const [who, statuses] of [["unread", ["DELIVERED", "DELIVERED", "DELIVERED"]], ["chitra", ["DELIVERED", "READ", "DELIVERED"]], ["bala", ["DELIVERED", "DELIVERED"]]] as const)
      for (const [k, st] of statuses.entries())
        await db.message.create({ data: { runId: run.id, customerId: ids[who], templateId, templateName: "qa_people_offer", status: st, sentAt: new Date(Date.now() - (10 + k) * DAY) } });
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.message.deleteMany({ where: { customer: { clientId } } });
    await db.campaignRun.deleteMany({ where: { campaign: { clientId } } });
    await db.campaign.deleteMany({ where: { clientId } });
    await db.template.deleteMany({ where: { clientId } });
    await db.customer.deleteMany({ where: { clientId } });
    await db.whatsAppNumber.deleteMany({ where: { clientId } });
    await db.client.delete({ where: { id: clientId } });
  });

  const reach = async (tag: string | null, people = {}) =>
    (await db.customer.findMany({ where: await campaignAudienceWhere(clientId, tag, people), select: { name: true }, orderBy: { name: "asc" } })).map((c) => c.name);

  test("1. people added join a tag's audience; people left out leave any audience", async () => {
    assert.deepEqual(await reach("ghee"), ["anu", "bala"]);
    assert.deepEqual(await reach("ghee", { includeIds: [ids.chitra] }), ["anu", "bala", "chitra"]);
    assert.deepEqual(await reach(null, { excludeIds: [ids.test, ids.bala] }), ["anu", "chitra", "unread"]);
    assert.deepEqual(await reach("ghee", { includeIds: [ids.test], excludeIds: [ids.test] }), ["anu", "bala"], "left out wins");
  });

  test("2. not opening offers: the last 3 delivered and none read; fewer than 3, or one read, doesn't count", async () => {
    assert.deepEqual([...(await notOpeningOffers(clientId))], [ids.unread]);
    assert.deepEqual([...(await notOpeningOffers(clientId, [ids.chitra, ids.bala]))], []);
  });

  test("3. a campaign that leaves them out skips them with the reason, and the test number isn't sent", async () => {
    const c = await db.campaign.create({
      data: { clientId, name: "people", templateId, scheduleType: "ONCE", runAt: FAR, nextRunAt: FAR, active: true, batchSize: 50, intervalMinutes: 10, excludeIds: [ids.test], skipUnread: true },
    });
    await runDueCampaigns(new Date(FAR.getTime() + 60_000), undefined, [clientId]);
    const msgs = await db.message.findMany({ where: { run: { campaignId: c.id } }, select: { customerId: true, status: true, error: true } });
    const by = new Map(msgs.map((m) => [m.customerId, m]));
    assert.equal(msgs.length, 4, "the test number is never queued");
    assert.equal(by.get(ids.unread)?.status, "SKIPPED");
    assert.equal(by.get(ids.unread)?.error, "Didn't open the last 3 offers");
    for (const k of ["anu", "bala", "chitra"]) assert.equal(by.get(ids[k])?.status, "SENT", k);
    assert.ok(!sentTo.includes(`${PHONE}4`) && !sentTo.includes(`${PHONE}5`));
  });
});
