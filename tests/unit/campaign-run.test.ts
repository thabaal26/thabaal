// A campaign end to end (lib/dispatcher.ts), as a shop with a new number sends it: one run for more customers than
// Meta's 250-a-day limit goes out over two days by itself; a late scheduler call sends the batches it missed; a
// template back in review, or quiet hours, make the run wait and then go on; an image header is uploaded to Meta
// once for parallel sends; WhatsApp's webhook can move a due campaign along between scheduler calls. Meta is a fake.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { kickCampaigns, runDueCampaigns } from "../../src/lib/dispatcher";

const DAY = 86_400_000;
const MIN = 60_000;
// The campaign is due far in the future and started with that clock, so other test files that start "every due
// campaign" on the same database at the same time never see it (and this file only ever runs its own shop's).
const FAR = new Date("2099-01-01T04:30:00Z");
const LATE = new Date(FAR.getTime() + MIN);
// The second run of test 5 (a campaign runs once per scheduled time).
const FAR2 = new Date(FAR.getTime() + DAY);
const LATE2 = new Date(FAR2.getTime() + MIN);

describe("a campaign run, end to end", () => {
  let clientId: string;
  let templateId: string;
  let campaignId: string;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  const tag = `qa-run-${Date.now()}`;
  const PNID = `qa-run-pnid-${Date.now()}`;
  const IMAGE = "https://img.qa-run.example/poster.jpg";
  const PHONE = `9188${String(Date.now()).slice(-5)}`;

  const run = () => db.campaignRun.findFirstOrThrow({ where: { campaignId }, orderBy: { startedAt: "desc" } });
  const count = async (status: string) => db.message.count({ where: { run: { campaignId }, status: status as never } });
  // Only this shop's sends: other test files may run campaigns on the same database at the same time.
  const sends = () => calls.filter((c) => c.url.endsWith("/messages") && String(c.body.to ?? "").startsWith(PHONE)).length;
  // Moves the run's next batch (or wait) to `ms` ago, as if the scheduler came late.
  const dueAgo = async (ms: number) => db.campaignRun.update({ where: { id: (await run()).id }, data: { nextBatchAt: new Date(Date.now() - ms) } });

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {} });
      if (u === IMAGE) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { status: 200, headers: { "Content-Type": "image/jpeg" } });
      if (u.endsWith("/media")) return new Response(JSON.stringify({ id: "media-qa-run" }), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.run${++n}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    // No quiet hours and no gap between offers here; those are tested on their own below.
    const client = await db.client.create({ data: { name: `QA Run Shop ${Date.now()}`, orderPrefix: "QR", quietFrom: null, quietTo: null, marketingGapHours: 0 } });
    clientId = client.id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: PNID, businessAccountId: "qa-run-waba", token: "qa-fake-token", isDefault: true, messagingTier: "TIER_250", qualityRating: "GREEN" } });
    await db.customer.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ clientId, phone: `${PHONE}${String(i).padStart(3, "0")}`, name: `Run ${i}`, tags: [tag] })) });
    templateId = (
      await db.template.create({
        data: { clientId, businessAccountId: "qa-run-waba", name: "qa_run_poster", category: "MARKETING", status: "APPROVED", language: "en", headerType: "IMAGE", headerMediaUrl: IMAGE, body: "Fresh oils at your door", buttons: [{ type: "PHONE_NUMBER", text: "Call to Order", phone: "+918925390439" }, { type: "URL", text: "Chat to Order", url: "https://www.thabaal.in/go/x" }] },
      })
    ).id;
    campaignId = (
      await db.campaign.create({
        data: { clientId, name: "QA run", templateId, scheduleType: "ONCE", sendTime: "10:00", runAt: FAR, nextRunAt: FAR, active: true, batchSize: 100, intervalMinutes: 10, audienceTag: tag },
      })
    ).id;
  });

  beforeEach(() => {
    calls.length = 0;
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

  test("1. a due campaign starts and sends its first batch; the picture goes to Meta once; buttons need nothing per send", async () => {
    await runDueCampaigns(LATE, undefined, [clientId]);
    const r = await run();
    assert.equal(r.total, 300);
    assert.equal(r.status, "RUNNING");
    assert.equal(await count("SENT"), 100);
    assert.equal(calls.filter((c) => c.url.endsWith("/media")).length, 1, "one upload for the whole batch");
    const t = calls.find((c) => c.url.endsWith("/messages") && String(c.body.to ?? "").startsWith(PHONE))!.body.template as { components: { type: string; parameters: { image?: { id?: string } }[] }[] };
    assert.deepEqual(t.components.map((c) => c.type), ["header"], "only the image: static link and call buttons take no parameters");
    assert.equal(t.components[0].parameters[0].image?.id, "media-qa-run");
    const camp = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    assert.equal(camp.active, false, "a one-time campaign doesn't start again");
    assert.ok(r.nextBatchAt && r.nextBatchAt.getTime() > Date.now() + 9 * MIN, "next batch in 10 minutes");
  });

  test("2. a scheduler that comes 35 minutes late sends the batches it missed, up to Meta's daily limit (240 with margin)", async () => {
    await dueAgo(35 * MIN);
    await runDueCampaigns(LATE, undefined, [clientId]);
    assert.equal(await count("SENT"), 240);
    assert.equal(sends(), 140);
  });

  test("3. the limit reached, the run waits for the first send to turn 24 hours old, not giving up", async () => {
    await dueAgo(MIN);
    await runDueCampaigns(LATE, undefined, [clientId]);
    const r = await run();
    assert.equal(r.status, "WAITING_LIMIT");
    assert.equal(sends(), 0);
    const first = await db.message.findFirstOrThrow({ where: { run: { campaignId }, status: "SENT" }, orderBy: { sentAt: "asc" } });
    assert.ok(Math.abs(r.nextBatchAt!.getTime() - (first.sentAt!.getTime() + DAY + MIN)) < 5_000, "waits until the window frees");
    assert.equal(await count("QUEUED"), 60);
  });

  test("4. the next day the rest go out by themselves and the run completes", async () => {
    // A day later: yesterday's sends left the 24-hour window.
    await db.message.updateMany({ where: { run: { campaignId }, status: "SENT" }, data: { sentAt: new Date(Date.now() - DAY - 5 * MIN) } });
    await dueAgo(MIN);
    await runDueCampaigns(LATE, undefined, [clientId]);
    assert.equal(await count("SENT"), 300);
    assert.equal(await count("QUEUED"), 0);
    assert.equal((await run()).status, "COMPLETED");
  });

  test("5. a template sent back to Meta for review holds the run, which goes on once it is approved", async () => {
    await db.message.updateMany({ where: { run: { campaignId } }, data: { sentAt: new Date(Date.now() - 2 * DAY) } });
    await db.campaign.update({ where: { id: campaignId }, data: { active: true, runAt: FAR2, nextRunAt: FAR2 } });
    await db.template.update({ where: { id: templateId }, data: { status: "PENDING" } });
    await runDueCampaigns(LATE2, undefined, [clientId]);
    assert.equal((await run()).status, "WAITING_TEMPLATE");
    assert.equal(sends(), 0);
    await db.template.update({ where: { id: templateId }, data: { status: "APPROVED" } });
    await dueAgo(MIN);
    await runDueCampaigns(LATE2, undefined, [clientId]);
    assert.equal((await run()).status, "RUNNING");
    assert.equal(sends(), 100);
  });

  test("6. inside quiet hours an offer waits until they end", async () => {
    const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
    await db.client.update({ where: { id: clientId }, data: { quietFrom: hhmm(new Date(Date.now() - 60 * MIN)), quietTo: hhmm(new Date(Date.now() + 60 * MIN)) } });
    await dueAgo(MIN);
    await runDueCampaigns(LATE2, undefined, [clientId]);
    const r = await run();
    assert.equal(r.status, "WAITING_QUIET");
    assert.equal(sends(), 0);
    assert.ok(r.nextBatchAt!.getTime() > Date.now() + 55 * MIN && r.nextBatchAt!.getTime() < Date.now() + 62 * MIN, "resumes when quiet hours end");
    await db.client.update({ where: { id: clientId }, data: { quietFrom: null, quietTo: null } });
  });

  test("7. WhatsApp's webhook moves a due run along between scheduler calls, at most once a minute", async () => {
    await dueAgo(MIN);
    const first = await kickCampaigns();
    assert.ok(first, "the first kick runs");
    assert.ok(sends() > 0, "it sent the due batch");
    await dueAgo(MIN);
    assert.equal(await kickCampaigns(), null, "a second kick within a minute waits");
  });
});
