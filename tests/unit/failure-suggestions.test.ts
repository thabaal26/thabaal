// What a campaign page suggests after failures, and nothing happening by itself: an offer Meta held back (131049)
// can be sent once more after 24 hours when the business asks (a stopped run too); 131026 / 130472 / held twice can
// be moved to Inactive, and campaigns then leave Inactive people out. Meta is a fake.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { campaignAudienceWhere } from "../../src/lib/audiences";
import { db } from "../../src/lib/db";
import { startRun } from "../../src/lib/dispatcher";
import { heldSummary, retryHeldBack } from "../../src/lib/held";
import { inactiveCandidates, moveToInactive } from "../../src/lib/inactive";

const HOUR = 3_600_000;

describe("failure suggestions: send again after 24 h, Inactive", () => {
  let clientId: string;
  let campaignId: string;
  const runs: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const realFetch = globalThis.fetch;
  const sentTo: string[] = [];
  const PHONE = `9178${String(Date.now()).slice(-6)}`;

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (String(url).endsWith("/messages") && body.to) sentTo.push(body.to);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.suggest${sentTo.length}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    clientId = (await db.client.create({ data: { name: `QA Suggest ${Date.now()}`, orderPrefix: "QS", quietFrom: null, quietTo: null, marketingGapHours: 0 } })).id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: `qa-suggest-${Date.now()}`, businessAccountId: "qa-suggest-waba", token: "qa-fake-token", isDefault: true, messagingTier: "TIER_1K" } });
    for (const [k, i] of [["stopped", 1], ["done", 2], ["fresh", 3], ["gone", 4], ["test", 5], ["twice", 6], ["ok", 7]] as const)
      ids[k] = (await db.customer.create({ data: { clientId, phone: `${PHONE}${i}`, name: k } })).id;
    const templateId = (await db.template.create({ data: { clientId, businessAccountId: "qa-suggest-waba", name: "qa_suggest_offer", category: "MARKETING", status: "APPROVED", language: "en", body: "Offer" } })).id;
    campaignId = (await db.campaign.create({ data: { clientId, name: "suggest", templateId, scheduleType: "ONCE", active: false } })).id;
    const ago = (h: number) => new Date(Date.now() - h * HOUR);
    runs.stopped = (await db.campaignRun.create({ data: { campaignId, scheduledFor: ago(30), status: "CANCELLED", total: 1 } })).id;
    runs.done = (await db.campaignRun.create({ data: { campaignId, scheduledFor: ago(29), status: "COMPLETED", total: 6 } })).id;
    const fail = (run: string, who: string, code: number, h: number) =>
      db.message.create({ data: { runId: runs[run], customerId: ids[who], templateId, templateName: "qa_suggest_offer", status: "FAILED", errorCode: code, failedAt: ago(h), sentAt: ago(h), createdAt: ago(h) } });
    await fail("stopped", "stopped", 131049, 30);
    await fail("done", "done", 131049, 29);
    await fail("done", "fresh", 131049, 2);
    await fail("done", "gone", 131026, 29);
    await fail("done", "test", 130472, 29);
    await fail("done", "twice", 131049, 29);
    await fail("done", "twice", 131049, 5);
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

  test("1. held back: ready after 24 hours (a stopped run too), the rest wait; held twice counts once", async () => {
    const s = await heldSummary([runs.stopped, runs.done]);
    assert.equal(s.ready, 2, "stopped + done");
    assert.equal(s.waiting, 1, "fresh, 2 hours ago");
    assert.ok(s.readyAt && s.readyAt.getTime() > Date.now());
    assert.equal(s.heldTwice, 1);
  });

  test("2. suggestions to move to Inactive, by reason", async () => {
    const c = await inactiveCandidates([runs.stopped, runs.done]);
    assert.deepEqual(c.unreachable, [ids.gone]);
    assert.deepEqual(c.experiment, [ids.test]);
    assert.deepEqual(c.heldTwice, [ids.twice]);
  });

  test("3. sending again goes only to the ready ones, when asked", async () => {
    const r = await retryHeldBack({ campaignId, deadline: Date.now() + 20_000 });
    assert.equal(r.retried, 2);
    assert.deepEqual(sentTo.sort(), [`${PHONE}1`, `${PHONE}2`]);
    const s = await heldSummary([runs.stopped, runs.done]);
    assert.equal(s.retriedOk, 2);
    assert.equal(s.ready, 0);
  });

  test("4. Inactive people are left out of campaigns unless the campaign picks the tag or adds them", async () => {
    assert.equal(await moveToInactive(clientId, [ids.gone, ids.test]), 2);
    assert.equal(await moveToInactive(clientId, [ids.gone]), 0, "already there");
    const names = async (tag: string | null, people = {}) =>
      (await db.customer.findMany({ where: await campaignAudienceWhere(clientId, tag, people), select: { name: true }, orderBy: { name: "asc" } })).map((c) => c.name);
    const everyone = await names(null);
    assert.ok(!everyone.includes("test") && !everyone.includes("gone") && everyone.includes("ok"));
    assert.deepEqual(await names("inactive"), ["gone", "test"]);
    assert.ok((await names(null, { includeIds: [ids.test] })).includes("test"), "added by hand");
    assert.equal((await inactiveCandidates([runs.done])).experiment.length, 0, "no suggestion once moved");
  });

  test("5. a one-time campaign sent again (resumed) skips who it already reached, even with no gap between offers", async () => {
    const before = sentTo.length;
    const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { template: { select: { name: true } } } });
    const run = await startRun(c, new Date(Date.now() + 60_000));
    const queued = (await db.message.findMany({ where: { runId: run.id }, select: { customerId: true } })).map((m) => m.customerId);
    assert.ok(!queued.includes(ids.stopped) && !queued.includes(ids.done), "the two reached by the retry aren't queued again");
    assert.ok(queued.includes(ids.ok) && queued.includes(ids.fresh), "the rest are");
    assert.equal(sentTo.length, before);
  });
});
