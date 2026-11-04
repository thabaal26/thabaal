// Smart campaign engine (lib/engagement-segments.ts, lib/meta-errors.ts, lib/audiences.ts): engagement groups from a
// business's whole campaign history, kept apart from suppression; two businesses never see each other's records; a
// campaign with groups queues exactly the customers counted; Meta errors are classified and retried by category.
// Meta is a fake: nothing leaves the machine.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { campaignAudienceWhere } from "../../src/lib/audiences";
import { db } from "../../src/lib/db";
import { runDueCampaigns } from "../../src/lib/dispatcher";
import { campaignInteractions, engagementRows, hasCampaignHistory, segmentOf, segmentSummary } from "../../src/lib/engagement-segments";
import { linkCustomers } from "../../src/lib/linked-numbers";
import { errorCategory, throttleDelayMinutes } from "../../src/lib/meta-errors";
import { recordReply } from "../../src/lib/replies";

const DAY = 86_400_000;
const FAR = new Date("2099-05-01T04:30:00Z");
const ago = (d: number) => new Date(Date.now() - d * DAY);

describe("engagement: the rule", () => {
  test("1. tap/reply/order within the window = Super active; reached, no response = Active; N offers in a row = Inactive; never reached = Not reached yet", () => {
    const rules = { days: 90, offers: 3 };
    assert.equal(segmentOf({ lastInteractionAt: ago(5), delivered: 0, sinceInteraction: 0 }, rules), "super");
    assert.equal(segmentOf({ lastInteractionAt: null, delivered: 2, sinceInteraction: 2 }, rules), "active");
    assert.equal(segmentOf({ lastInteractionAt: null, delivered: 3, sinceInteraction: 3 }, rules), "inactive");
    assert.equal(segmentOf({ lastInteractionAt: null, delivered: 0, sinceInteraction: 0 }, rules), "new");
    assert.equal(segmentOf({ lastInteractionAt: ago(200), delivered: 1, sinceInteraction: 1 }, rules), "active", "answered long ago, one offer since");
    assert.equal(segmentOf({ lastInteractionAt: ago(200), delivered: 4, sinceInteraction: 3 }, rules), "inactive");
    assert.equal(segmentOf({ lastInteractionAt: null, delivered: 3, sinceInteraction: 3 }, { days: 90, offers: 5 }), "active", "the business's own threshold");
  });

  test("2. Meta errors by category, checked against Meta's error-code page; throttling backs off", () => {
    const cases: [number, string][] = [
      [131026, "permanent"], [131047, "template"], [131048, "account"], [131049, "marketing"], [130472, "marketing"], [131050, "opt-out"],
      [130429, "rate"], [131056, "rate"], [132000, "template"], [132001, "template"], [131031, "account"], [131016, "temporary"], [999999, "permanent"],
    ];
    for (const [code, cat] of cases) assert.equal(errorCategory(code), cat, String(code));
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(throttleDelayMinutes), [5, 10, 20, 40, 80, 120, 120]);
  });
});

describe("engagement: two businesses, real records", () => {
  const realFetch = globalThis.fetch;
  const sentTo: string[] = [];
  /** Numbers Meta answers with an error code, by recipient. */
  const failFor = new Map<string, number>();
  let A: string;
  let B: string;
  let templateA: string;
  let templateB: string;
  const P = `9155${String(Date.now()).slice(-5)}`;
  const id: Record<string, string> = {};
  let wamid = 0;

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (String(url).endsWith("/messages") && body.to) {
        const code = failFor.get(body.to);
        if (code) return new Response(JSON.stringify({ error: { code, message: `fake ${code}` } }), { status: 400, headers: { "Content-Type": "application/json" } });
        sentTo.push(body.to);
        return new Response(JSON.stringify({ messages: [{ id: `wamid.seg${++wamid}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const mk = async (name: string, prefix: string) => {
      const c = await db.client.create({ data: { name: `${name} ${Date.now()}`, orderPrefix: prefix, quietFrom: null, quietTo: null, marketingGapHours: 0 } });
      await db.whatsAppNumber.create({ data: { clientId: c.id, label: "Main", phoneNumberId: `qa-seg-${prefix}-${Date.now()}`, businessAccountId: `waba-${prefix}`, token: "qa-fake-token", isDefault: true, messagingTier: "TIER_1K" } });
      const t = await db.template.create({ data: { clientId: c.id, businessAccountId: `waba-${prefix}`, name: `qa_seg_${prefix}`, category: "MARKETING", status: "APPROVED", language: "en", body: "Offer" } });
      return [c.id, t.id];
    };
    [A, templateA] = await mk("QA Seg A", "SA");
    [B, templateB] = await mk("QA Seg B", "SB");
    // Business A: customers with history.
    const people = ["tapper", "replier", "reader", "deliveredOnly", "cold", "tempFail", "optedOut", "unreach", "oldFan", "fresh", "linkedA", "linkedB"];
    for (const [k, name] of people.entries()) id[name] = (await db.customer.create({ data: { clientId: A, phone: `${P}${String(k).padStart(2, "0")}`, name } })).id;
    await db.customer.update({ where: { id: id.optedOut }, data: { optedOut: true } });
    await db.customer.update({ where: { id: id.unreach }, data: { unreachable: true } });
    await linkCustomers(A, [id.linkedA, id.linkedB]);
    // Business B: a new shop, no campaigns.
    for (let k = 0; k < 3; k++) id[`b${k}`] = (await db.customer.create({ data: { clientId: B, phone: `${P}9${k}`, name: `b${k}` } })).id;

    // A's history: three past campaigns (one run each), 20, 12 and 4 days ago.
    const runs: string[] = [];
    for (const d of [20, 12, 4]) {
      const camp = await db.campaign.create({ data: { clientId: A, name: `past ${d}`, templateId: templateA, scheduleType: "ONCE", active: false } });
      runs.push((await db.campaignRun.create({ data: { campaignId: camp.id, scheduledFor: ago(d), status: "COMPLETED", total: 10 } })).id);
    }
    const msg = (run: number, who: string, status: "DELIVERED" | "READ" | "FAILED", extra: Record<string, unknown> = {}) =>
      db.message.create({
        data: {
          runId: runs[run], customerId: id[who], templateId: templateA, templateName: "qa_seg_SA", status, waMessageId: `wamid.hist-${run}-${who}`,
          sentAt: ago([20, 12, 4][run]), ...(status !== "FAILED" && { deliveredAt: ago([20, 12, 4][run]) }), ...(status === "READ" && { readAt: ago([20, 12, 4][run] - 0.1) }),
          ...(status === "FAILED" && { failedAt: ago([20, 12, 4][run]), errorCode: 131049 }), ...extra,
        },
      });
    for (const who of ["tapper", "replier", "reader", "deliveredOnly", "optedOut", "linkedA", "linkedB"]) await msg(2, who, who === "reader" ? "READ" : "DELIVERED");
    for (const r of [0, 1, 2]) await msg(r, "cold", "DELIVERED"); // three campaigns, no response: Inactive across all history
    for (const r of [0, 1]) await msg(r, "oldFan", "READ");
    for (const r of [0, 1, 2]) await msg(r, "tempFail", "FAILED", r === 2 ? { failedAt: ago(1) } : {}); // only failures: never Inactive; the last one recent
    // Responses: a tap on the latest offer (Meta's context.id), a reply without context, an old fan's tap 200 days ago.
    await db.reply.create({ data: { customerId: id.tapper, text: "View Products", kind: "button", contextId: "wamid.hist-2-tapper", receivedAt: ago(3.9) } });
    await db.reply.create({ data: { customerId: id.replier, text: "price?", kind: "text", receivedAt: ago(3.5) } });
    await db.reply.create({ data: { customerId: id.optedOut, text: "Order now", kind: "button", contextId: "wamid.hist-2-optedOut", receivedAt: ago(3.8) } });
    await db.reply.create({ data: { customerId: id.oldFan, text: "hi", kind: "text", receivedAt: ago(200) } });
    await db.reply.create({ data: { customerId: id.linkedB, text: "Order now", kind: "button", receivedAt: ago(3.7) } });
  });

  after(async () => {
    globalThis.fetch = realFetch;
    for (const c of [A, B]) {
      await db.message.deleteMany({ where: { customer: { clientId: c } } });
      await db.reply.deleteMany({ where: { customer: { clientId: c } } });
      await db.campaignRun.deleteMany({ where: { campaign: { clientId: c } } });
      await db.campaign.deleteMany({ where: { clientId: c } });
      await db.template.deleteMany({ where: { clientId: c } });
      await db.customer.deleteMany({ where: { clientId: c } });
      await db.whatsAppNumber.deleteMany({ where: { clientId: c } });
      await db.client.delete({ where: { id: c } });
    }
  });

  const segs = async (clientId: string) => new Map((await engagementRows(clientId)).map((r) => [r.id, r]));

  test("3. every group from all of the business's campaigns; delivery problems and suppression kept apart", async () => {
    const s = await segs(A);
    assert.equal(s.get(id.tapper)!.segment, "super");
    assert.equal(s.get(id.tapper)!.buttons, 1);
    assert.equal(s.get(id.replier)!.segment, "super");
    assert.equal(s.get(id.reader)!.segment, "active");
    assert.equal(s.get(id.reader)!.read, 1);
    assert.equal(s.get(id.deliveredOnly)!.segment, "active");
    assert.equal(s.get(id.cold)!.segment, "inactive", "3 delivered offers over 3 campaigns, no response");
    assert.equal(s.get(id.tempFail)!.segment, "new", "failed sends never make anyone Inactive");
    assert.ok(s.get(id.tempFail)!.pausedUntil, "Meta's hold is a separate, temporary state");
    assert.equal(s.get(id.tempFail)!.lastOffer?.errorCode, 131049);
    assert.equal(s.get(id.optedOut)!.segment, "super", "the tap still counts…");
    assert.equal(s.get(id.optedOut)!.suppressed, "opted-out", "…but opting out wins for sending");
    assert.equal(s.get(id.unreach)!.suppressed, "unreachable");
    assert.equal(s.get(id.oldFan)!.segment, "active", "answered 200 days ago, two offers since");
    assert.equal(s.get(id.fresh)!.segment, "new");
    assert.equal(s.get(id.linkedA)!.segment, "super", "one person: a tap on either number counts for both");
  });

  test("4. two businesses: A has history and groups; new business B sees a first campaign; nothing crosses over", async () => {
    assert.equal(await hasCampaignHistory(A), true);
    assert.equal(await hasCampaignHistory(B), false);
    const b = await segmentSummary(B);
    assert.equal(b.history, false);
    assert.equal(b.totals.customers, 3);
    assert.equal(b.segments.new.eligible, 3);
    assert.equal(b.segments.super.eligible + b.segments.active.eligible + b.segments.inactive.eligible, 0, "no made-up groups");
    const bRows = await engagementRows(B);
    assert.deepEqual(bRows.map((r) => r.id).sort(), [id.b0, id.b1, id.b2].sort(), "B reads only its own customers");
    assert.deepEqual((await engagementRows(B, { customerIds: [id.tapper] })).length, 0, "asking B for A's customer gets nothing");
    const a = await segmentSummary(A);
    assert.equal(a.history, true);
    assert.equal(a.segments.super.eligible, 4, "tapper, replier, linkedA, linkedB (the opted-out tapper is excluded)");
    assert.equal(a.segments.super.excluded, 1);
    assert.equal(a.activeRead, 2, "reader and the old fan read an offer");
    assert.equal(a.totals.optedOut, 1);
    assert.equal(a.totals.unreachable, 1);
    assert.equal(a.totals.paused, 1);
  });

  test("5. groups in a campaign: one or several, opted-out never included, each number once", async () => {
    const reach = async (segments: string[], clientId = A) =>
      (await db.customer.findMany({ where: await campaignAudienceWhere(clientId, null, { segments }), select: { id: true, phone: true } })).map((c) => c.id).sort();
    assert.deepEqual(await reach(["super"]), [id.tapper, id.replier, id.linkedA, id.linkedB].sort());
    assert.deepEqual(await reach(["super", "active"]), [id.tapper, id.replier, id.linkedA, id.linkedB, id.reader, id.deliveredOnly, id.oldFan].sort());
    assert.deepEqual(await reach(["inactive"]), [id.cold]);
    assert.equal((await reach(["super"])).includes(id.optedOut), false);
    const all = await db.customer.findMany({ where: await campaignAudienceWhere(A, null, { segments: ["super", "active", "inactive", "new"] }), select: { phone: true } });
    assert.equal(new Set(all.map((c) => c.phone)).size, all.length, "no phone twice");
    assert.deepEqual(await reach(["super"], B), [], "B has no Super active customers");
  });

  test("6. a new tap moves the customer at once, and the audience follows", async () => {
    await db.reply.create({ data: { customerId: id.deliveredOnly, text: "View Products", kind: "button", contextId: "wamid.hist-2-deliveredOnly", receivedAt: new Date() } });
    assert.equal((await segs(A)).get(id.deliveredOnly)!.segment, "super");
    const where = await campaignAudienceWhere(A, null, { segments: ["super"] });
    assert.ok((await db.customer.findMany({ where, select: { id: true } })).some((c) => c.id === id.deliveredOnly));
  });

  test("7. a campaign's taps and replies: Meta's context.id, or within 3 days for older replies; other businesses count nothing", async () => {
    const runs = await db.campaignRun.findMany({ where: { campaign: { clientId: A, name: "past 4" } }, select: { id: true } });
    const r = await campaignInteractions(A, runs.map((x) => x.id));
    assert.equal(r.buttons, 4, "tapper, optedOut, linkedB, and the new tap");
    assert.equal(r.replies, 1, "the replier (no context, within 3 days)");
    assert.equal(r.interacted, 5);
    assert.deepEqual(await campaignInteractions(B, runs.map((x) => x.id)), { buttons: 0, replies: 0, orders: 0, interacted: 0 });
  });

  test("8. a duplicate webhook keeps one reply", async () => {
    const one = { phone: `${P}09`, text: "Order now", kind: "button" as const, waMessageId: `wamid.dup-${Date.now()}`, contextId: "wamid.hist-x", anyClient: true };
    await recordReply(one);
    await recordReply(one);
    assert.equal(await db.reply.count({ where: { waMessageId: one.waMessageId } }), 1);
    assert.equal((await db.reply.findFirst({ where: { waMessageId: one.waMessageId } }))?.contextId, "wamid.hist-x");
  });

  test("9. the queued run is exactly the audience counted; 131056 fails only that person; 130429 backs off", async () => {
    const counted = await db.customer.count({ where: await campaignAudienceWhere(A, null, { segments: ["active"] }) });
    failFor.set(`${P}03`, 131056); // deliveredOnly moved to super in test 6; reader (02) and oldFan (08) are Active
    failFor.set(`${P}02`, 131056);
    const c = await db.campaign.create({ data: { clientId: A, name: "active only", templateId: templateA, scheduleType: "ONCE", runAt: FAR, nextRunAt: FAR, active: true, batchSize: 50, intervalMinutes: 10, segments: ["active"] } });
    await runDueCampaigns(new Date(FAR.getTime() + 60_000), undefined, [A]);
    const msgs = await db.message.findMany({ where: { run: { campaignId: c.id } }, select: { customerId: true, status: true, errorCode: true } });
    assert.equal(msgs.length, counted, "the snapshot matches the preview count");
    const by = new Map(msgs.map((m) => [m.customerId, m]));
    assert.equal(by.get(id.reader)?.status, "FAILED");
    assert.equal(by.get(id.reader)?.errorCode, 131056);
    assert.equal(by.get(id.oldFan)?.status, "SENT", "the rest of the batch still went");
    const run = await db.campaignRun.findFirstOrThrow({ where: { campaignId: c.id } });
    assert.equal(run.throttles, 0, "a per-person limit doesn't throttle the run");

    // Throughput: every send says 130429; the run waits 5 minutes, then 10.
    failFor.clear();
    // Super active by now: tapper, replier, linkedA, linkedB, deliveredOnly (test 6) and fresh (test 8's reply).
    for (const k of ["00", "01", "03", "09", "10", "11"]) failFor.set(`${P}${k}`, 130429);
    const t0 = new Date(FAR.getTime() + 2 * DAY);
    const c2 = await db.campaign.create({ data: { clientId: A, name: "throttled", templateId: templateA, scheduleType: "ONCE", runAt: t0, nextRunAt: t0, active: true, batchSize: 50, intervalMinutes: 10, segments: ["super"] } });
    await runDueCampaigns(new Date(t0.getTime() + 60_000), undefined, [A]);
    let r2 = await db.campaignRun.findFirstOrThrow({ where: { campaignId: c2.id } });
    assert.equal(r2.throttles, 1);
    const wait1 = r2.nextBatchAt.getTime() - Date.now();
    assert.ok(wait1 > 4 * 60_000 && wait1 <= 5 * 60_000 + 5_000, `first wait ${wait1}`);
    // Due again (running batches go by the real clock).
    await db.campaignRun.update({ where: { id: r2.id }, data: { nextBatchAt: new Date(Date.now() - 1000) } });
    await runDueCampaigns(new Date(t0.getTime() + 120_000), undefined, [A]);
    r2 = await db.campaignRun.findFirstOrThrow({ where: { campaignId: c2.id } });
    assert.equal(r2.throttles, 2);
    const wait2 = r2.nextBatchAt.getTime() - Date.now();
    assert.ok(wait2 > 9 * 60_000 && wait2 <= 10 * 60_000 + 5_000, `second wait ${wait2}`);
    assert.equal(await db.message.count({ where: { run: { campaignId: c2.id }, status: "FAILED" } }), 0, "throttled messages stay queued, none lost");
    failFor.clear();
    void templateB;
  });

  test("10. moved to Inactive: counted in the Inactive group and left out; a reply brings them back to Super active at once", async () => {
    await db.customer.update({ where: { id: id.cold }, data: { tags: ["inactive"], unreachable: true } });
    let s = (await segs(A)).get(id.cold)!;
    assert.equal(s.segment, "inactive");
    assert.equal(s.movedToInactive, true);
    const sum = await segmentSummary(A);
    assert.equal(sum.segments.inactive.moved, 1, "shown on the Inactive card");
    assert.equal((await db.customer.findMany({ where: await campaignAudienceWhere(A, null, { segments: ["inactive"] }), select: { id: true } })).some((c) => c.id === id.cold), false, "never sent");
    await recordReply({ phone: `${P}04`, text: "price?", kind: "text", waMessageId: `wamid.back-${Date.now()}`, anyClient: true });
    const back = await db.customer.findUniqueOrThrow({ where: { id: id.cold } });
    assert.equal(back.tags.includes("inactive"), false, "tag removed by their reply");
    assert.equal(back.unreachable, false, "they wrote to us, so they can receive");
    s = (await segs(A)).get(id.cold)!;
    assert.equal(s.segment, "super");
  });
});
