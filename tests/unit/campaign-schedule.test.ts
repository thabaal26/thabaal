// Campaign timing, scenario by scenario (lib/schedule.ts computeNextRun, lib/dispatcher.ts startDueCampaigns): a
// campaign starts at its time in India time, once, and never early, twice, while paused or while the business is
// locked; a weekly one moves on to its next day. Nothing is sent: these only start runs (queued messages).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { db } from "../../src/lib/db";
import { startDueCampaigns } from "../../src/lib/dispatcher";
import { computeNextRun } from "../../src/lib/schedule";

const TZ = "Asia/Kolkata";
const ist = (s: string) => fromZonedTime(s, TZ);
const iso = (d: Date | null) => d?.toISOString() ?? null;
const weekly = (days: number[], sendTime: string) => ({ scheduleType: "WEEKLY" as const, daysOfWeek: days, sendTime, runAt: null, timezone: TZ });

describe("when a campaign runs next", () => {
  test("1. one-off: its date and time while still ahead; none once it has passed", () => {
    const at = ist("2026-11-05T10:00:00");
    const once = { scheduleType: "ONCE" as const, daysOfWeek: [], sendTime: "10:00", runAt: at, timezone: TZ };
    assert.equal(iso(computeNextRun(once, ist("2026-11-04T18:00:00"))), iso(at));
    assert.equal(computeNextRun(once, at), null, "exactly at the time: already due, nothing after it");
    assert.equal(computeNextRun(once, ist("2026-11-06T09:00:00")), null);
  });

  test("2. weekly Mon + Thu at 10:00 India time: the next of those days, never the same moment twice", () => {
    const s = weekly([1, 4], "10:00"); // Monday, Thursday
    assert.equal(iso(computeNextRun(s, ist("2026-11-03T09:00:00"))), iso(ist("2026-11-05T10:00:00")), "Tuesday → Thursday");
    assert.equal(iso(computeNextRun(s, ist("2026-11-02T09:59:00"))), iso(ist("2026-11-02T10:00:00")), "Monday before 10 → today");
    assert.equal(iso(computeNextRun(s, ist("2026-11-02T10:00:00"))), iso(ist("2026-11-05T10:00:00")), "Monday at 10 → Thursday");
    assert.equal(iso(computeNextRun(s, ist("2026-11-05T11:00:00"))), iso(ist("2026-11-09T10:00:00")), "Thursday after → next Monday");
  });

  test("3. weekly late at night: 23:30 India time is still that India day (18:00 UTC)", () => {
    const s = weekly([0], "23:30"); // Sunday
    const next = computeNextRun(s, ist("2026-11-07T12:00:00"));
    assert.equal(iso(next), iso(ist("2026-11-08T23:30:00")));
    assert.equal(next?.toISOString(), "2026-11-08T18:00:00.000Z");
  });

  test("4. every day of the week, and an empty week", () => {
    assert.equal(iso(computeNextRun(weekly([0, 1, 2, 3, 4, 5, 6], "08:00"), ist("2026-11-03T08:00:00"))), iso(ist("2026-11-04T08:00:00")));
    assert.equal(computeNextRun(weekly([], "08:00"), ist("2026-11-03T08:00:00")), null);
  });
});

describe("starting campaigns on time", () => {
  let clientId: string;
  let templateId: string;

  before(async () => {
    const c = await db.client.create({ data: { name: `Campaign timing ${Date.now()}` } });
    clientId = c.id;
    const t = await db.template.create({ data: { clientId, name: "timing_offer", category: "MARKETING", body: "Hello, new stock is in.", status: "APPROVED" } });
    templateId = t.id;
    await db.customer.createMany({
      data: [
        { clientId, name: "A", phone: `9198${Date.now().toString().slice(-8)}` },
        { clientId, name: "B", phone: `9197${Date.now().toString().slice(-8)}` },
      ],
    });
  });
  after(async () => {
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
  });

  const campaign = (data: Record<string, unknown>) =>
    db.campaign.create({ data: { clientId, templateId, name: `C ${Math.random()}`, scheduleType: "ONCE", sendTime: "10:00", timezone: TZ, ...data } });
  const runs = (campaignId: string) => db.campaignRun.findMany({ where: { campaignId } });

  test("5. a one-off starts at its time with everyone queued, once; then it is done", async () => {
    const at = ist("2026-11-05T10:00:00");
    const c = await campaign({ runAt: at, nextRunAt: at });
    assert.equal(await startDueCampaigns(ist("2026-11-05T09:59:00"), new Set()), 0, "not a minute early");
    assert.equal((await runs(c.id)).length, 0);
    await startDueCampaigns(ist("2026-11-05T10:01:00"), new Set());
    const r = await runs(c.id);
    assert.equal(r.length, 1);
    assert.equal(r[0].total, 2);
    assert.equal(iso(r[0].scheduledFor), iso(at));
    const after1 = await db.campaign.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(after1.active, false);
    assert.equal(after1.nextRunAt, null);
    await startDueCampaigns(ist("2026-11-05T10:06:00"), new Set());
    assert.equal((await runs(c.id)).length, 1, "the next tick doesn't start it again");
  });

  test("6. two ticks at the same moment start it only once", async () => {
    const at = ist("2026-11-06T10:00:00");
    const c = await campaign({ runAt: at, nextRunAt: at });
    await Promise.all([startDueCampaigns(ist("2026-11-06T10:00:30"), new Set()), startDueCampaigns(ist("2026-11-06T10:00:30"), new Set())]);
    assert.equal((await runs(c.id)).length, 1);
  });

  test("7. weekly: starts on its day and moves to the next one", async () => {
    const first = ist("2026-11-02T10:00:00"); // Monday
    const c = await campaign({ scheduleType: "WEEKLY", daysOfWeek: [1, 4], runAt: null, nextRunAt: first });
    await startDueCampaigns(ist("2026-11-02T10:02:00"), new Set());
    const after1 = await db.campaign.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(after1.active, true);
    assert.equal(iso(after1.nextRunAt), iso(ist("2026-11-05T10:00:00")), "Thursday next");
    assert.equal((await runs(c.id)).length, 1);
  });

  test("8. a paused campaign, or one in the future, doesn't start", async () => {
    const at = ist("2026-11-07T10:00:00");
    const paused = await campaign({ runAt: at, nextRunAt: null, active: false });
    const later = await campaign({ runAt: ist("2026-12-01T10:00:00"), nextRunAt: ist("2026-12-01T10:00:00") });
    await startDueCampaigns(ist("2026-11-07T10:05:00"), new Set());
    assert.equal((await runs(paused.id)).length, 0);
    assert.equal((await runs(later.id)).length, 0);
  });

  test("9. a business locked for an unpaid plan waits; it starts once it has paid", async () => {
    const at = ist("2026-11-08T10:00:00");
    const c = await campaign({ runAt: at, nextRunAt: at });
    await startDueCampaigns(ist("2026-11-08T10:05:00"), new Set([clientId]));
    assert.equal((await runs(c.id)).length, 0, "locked: waits");
    assert.equal(iso((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).nextRunAt), iso(at), "still due");
    await startDueCampaigns(ist("2026-11-09T11:00:00"), new Set());
    assert.equal((await runs(c.id)).length, 1, "paid: starts");
  });
});
