// A run stopped from the dashboard sends nothing more: its held-back messages (Meta 131049) aren't retried, and the
// campaign page says so instead of "waiting for a retry". A run that wasn't stopped still gets its one retry. Meta is a fake.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { heldSummary, retryHeldBack } from "../../src/lib/held";

const DAY = 86_400_000;

describe("held-back messages of a stopped run", () => {
  let clientId: string;
  let campaignId: string;
  let stoppedRun: string;
  let doneRun: string;
  const ids: Record<string, string> = {};
  const realFetch = globalThis.fetch;
  const sentTo: string[] = [];
  const PHONE = `9178${String(Date.now()).slice(-6)}`;

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (String(url).endsWith("/messages") && body.to) sentTo.push(body.to);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.heldstop${sentTo.length}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    clientId = (await db.client.create({ data: { name: `QA Held Stop ${Date.now()}`, orderPrefix: "QH", quietFrom: null, quietTo: null, marketingGapHours: 0 } })).id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: `qa-heldstop-${Date.now()}`, businessAccountId: "qa-heldstop-waba", token: "qa-fake-token", isDefault: true, messagingTier: "TIER_1K" } });
    for (const [k, i] of [["stopped", 1], ["done", 2]] as const) ids[k] = (await db.customer.create({ data: { clientId, phone: `${PHONE}${i}`, name: k } })).id;
    const templateId = (await db.template.create({ data: { clientId, businessAccountId: "qa-heldstop-waba", name: "qa_heldstop_offer", category: "MARKETING", status: "APPROVED", language: "en", body: "Offer" } })).id;
    campaignId = (await db.campaign.create({ data: { clientId, name: "held stop", templateId, scheduleType: "ONCE", active: false } })).id;
    const failedAt = new Date(Date.now() - 4 * DAY);
    stoppedRun = (await db.campaignRun.create({ data: { campaignId, scheduledFor: new Date(Date.now() - 4 * DAY), status: "CANCELLED", total: 1 } })).id;
    doneRun = (await db.campaignRun.create({ data: { campaignId, scheduledFor: new Date(Date.now() - 4 * DAY + 60_000), status: "COMPLETED", total: 1 } })).id;
    for (const [runId, who] of [[stoppedRun, "stopped"], [doneRun, "done"]] as const)
      await db.message.create({ data: { runId, customerId: ids[who], templateId, templateName: "qa_heldstop_offer", status: "FAILED", errorCode: 131049, failedAt, sentAt: failedAt } });
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

  test("1. the stopped run's held message shows as stopped, not waiting", async () => {
    const s = await heldSummary([stoppedRun]);
    assert.equal(s.stopped, 1);
    assert.equal(s.waiting, 0);
    assert.equal(s.nextRetry, null);
    assert.equal((await heldSummary([doneRun])).waiting, 1, "a finished run still waits for its retry");
  });

  test("2. only the run that wasn't stopped is retried", async () => {
    const r = await retryHeldBack({ campaignId, deadline: Date.now() + 20_000 });
    assert.equal(r.retried, 1);
    assert.deepEqual(sentTo, [`${PHONE}2`]);
    assert.equal((await heldSummary([doneRun])).retriedOk, 1);
    assert.equal((await heldSummary([stoppedRun])).stopped, 1);
  });
});
