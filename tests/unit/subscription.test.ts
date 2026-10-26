// Plan payments and periods (lib/subscription.ts, lib/subscription-core.ts): a plan changes only through a
// verified payment, and a payment made early waits for the current paid period to end.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { db } from "../../src/lib/db";
import {
  cancelPlanPayment,
  effectivePlan,
  planCapacityBlock,
  recordExistingPeriod,
  rejectPlanPayment,
  submitPlanPayment,
  verifyPlanPayment,
  type Actor,
} from "../../src/lib/subscription";
import { accessState, openWhenLocked, periodEnd, summarize, timeLeft, type PurchaseLike } from "../../src/lib/subscription-core";
import { clientAccess, lockedClientIds } from "../../src/lib/plan-access";

const TZ = "Asia/Kolkata";
const ist = (s: string) => fromZonedTime(s, TZ);
const NOW = ist("2026-10-26T10:00:00");
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

const admin: Actor = { isAdmin: true, clientId: null, canManage: true, name: "Thabaal admin" };
const manager = (clientId: string): Actor => ({ isAdmin: false, clientId, canManage: true, name: "Owner" });
const staff = (clientId: string): Actor => ({ isAdmin: false, clientId, canManage: false, name: "Packer" });

let seq = 0;
const utr = () => `${Date.now()}${++seq}`.slice(-12).padStart(12, "7");

async function newClient(tag: string) {
  return db.client.create({ data: { name: `Sub ${tag} ${Date.now()} ${++seq}` } });
}

/** A client on Growth (monthly) paid 12 Oct 2026, so its period ends 12 Nov 2026 00:00 IST. */
async function growthClient(tag: string) {
  const c = await newClient(tag);
  const r = await recordExistingPeriod(admin, { clientId: c.id, plan: "growth", cycle: "m", startDate: "2026-10-12" }, NOW);
  assert.equal(r.ok, true, r.message);
  return c;
}

const rowsOf = (clientId: string) => db.planPurchase.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });

describe("period dates", () => {
  test("7. month ends and leap years", () => {
    assert.equal(iso(periodEnd(ist("2027-01-31T10:00:00"), "m", TZ)), iso(ist("2027-02-28T10:00:00")));
    assert.equal(iso(periodEnd(ist("2028-01-31T10:00:00"), "m", TZ)), iso(ist("2028-02-29T10:00:00")), "leap February");
    assert.equal(iso(periodEnd(ist("2028-02-29T09:15:00"), "y", TZ)), iso(ist("2029-02-28T09:15:00")), "29 Feb + 12 months");
    assert.equal(iso(periodEnd(ist("2026-11-30T00:00:00"), "q", TZ)), iso(ist("2027-02-28T00:00:00")), "quarter into a short month");
    assert.equal(iso(periodEnd(ist("2026-08-31T23:30:00"), "q", TZ)), iso(ist("2026-11-30T23:30:00")));
    assert.equal(iso(periodEnd(ist("2026-03-15T12:00:00"), "y", TZ)), iso(ist("2027-03-15T12:00:00")));
    // Late evening IST is the previous day in UTC: the calendar month is still counted in IST.
    assert.equal(iso(periodEnd(ist("2026-01-31T23:00:00"), "m", TZ)), iso(ist("2026-02-28T23:00:00")));
  });

  test("time left comes from the stored end timestamp", () => {
    const end = ist("2026-11-12T00:00:00");
    const left = timeLeft(end, NOW);
    assert.equal(left.ms, end.getTime() - NOW.getTime());
    assert.equal(left.days, 16);
    assert.equal(left.hours, 14);
    assert.equal(timeLeft(end, new Date(end.getTime() + 1)).ms, 0);
  });
});

describe("plan payments", () => {
  before(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  test("1. choosing another plan without paying changes nothing", async () => {
    const c = await growthClient("choose");
    // Picking a plan in the screen sends nothing to the server; the only way in is a payment.
    const eff = await effectivePlan(c.id, NOW);
    assert.equal(eff.status, "active");
    assert.equal(eff.plan?.k, "growth");
    assert.equal(eff.plan?.lim.staff, 3);
    assert.equal((await rowsOf(c.id)).length, 1);
  });

  test("2. sending a UPI reference stays pending and grants nothing", async () => {
    const c = await growthClient("pending");
    const r = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "business", cycle: "m", utr: utr() }, NOW);
    assert.equal(r.ok, true, r.message);
    const row = await db.planPurchase.findUniqueOrThrow({ where: { id: r.id! } });
    assert.equal(row.status, "PENDING");
    assert.equal(row.startsAt, null);
    assert.equal(row.endsAt, null);
    assert.equal(row.amountPaise, 499_900, "price from the plan table, not the browser");
    const eff = await effectivePlan(c.id, NOW);
    assert.equal(eff.plan?.k, "growth", "still Growth");
    const s = summarize(await rowsOf(c.id), NOW);
    assert.equal(s.scheduled, null);
    assert.equal(s.pending?.id, r.id);
    // Even after the Growth period ends, an unverified payment never starts a plan.
    const later = await effectivePlan(c.id, ist("2026-11-20T00:00:00"));
    assert.equal(later.status, "expired");
    assert.equal(later.plan, null);
  });

  test("3-5. verifying an early upgrade schedules it after the current end, with the full duration", async () => {
    const c = await growthClient("upgrade");
    const sent = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "business", cycle: "q", utr: utr() }, NOW);
    const v = await verifyPlanPayment(admin, sent.id!, {}, NOW);
    assert.equal(v.ok, true, v.message);
    const row = await db.planPurchase.findUniqueOrThrow({ where: { id: sent.id! } });
    const growthEnd = ist("2026-11-12T00:00:00");
    assert.equal(row.status, "VERIFIED");
    assert.equal(iso(row.startsAt), iso(growthEnd), "starts when Growth ends, not today");
    assert.equal(iso(row.endsAt), iso(ist("2027-02-12T00:00:00")), "full 3 months from its start");
    assert.ok(row.billNo);

    // 4. Growth stays in force (with Growth's limits) for the whole remaining period.
    for (const at of [NOW, ist("2026-11-01T00:00:00"), new Date(growthEnd.getTime() - 1)]) {
      const eff = await effectivePlan(c.id, at);
      assert.equal(eff.plan?.k, "growth", `Growth at ${at.toISOString()}`);
    }
    // 5. Business takes over exactly at the scheduled start and runs to its end.
    assert.equal((await effectivePlan(c.id, growthEnd)).plan?.k, "business");
    assert.equal((await effectivePlan(c.id, new Date(row.endsAt!.getTime() - 1))).plan?.k, "business");
    const after = await effectivePlan(c.id, row.endsAt!);
    assert.equal(after.status, "expired", "an ended period keeps no paid plan");
    assert.equal(after.plan, null);
  });

  test("6. a downgrade waits too", async () => {
    const c = await growthClient("downgrade");
    const sent = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "starter", cycle: "y", utr: utr() }, NOW);
    assert.equal((await verifyPlanPayment(admin, sent.id!, {}, NOW)).ok, true);
    const row = await db.planPurchase.findUniqueOrThrow({ where: { id: sent.id! } });
    assert.equal(iso(row.startsAt), iso(ist("2026-11-12T00:00:00")));
    assert.equal(iso(row.endsAt), iso(ist("2027-11-12T00:00:00")));
    assert.equal((await effectivePlan(c.id, NOW)).plan?.k, "growth", "Growth features kept until it ends");
    assert.equal((await effectivePlan(c.id, ist("2026-11-12T00:00:00"))).plan?.k, "starter");
  });

  test("8. verifying twice, or at the same moment, applies the payment once", async () => {
    const c = await growthClient("twice");
    const sent = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "growth", cycle: "m", utr: utr() }, NOW);
    const [a, b] = await Promise.all([verifyPlanPayment(admin, sent.id!, {}, NOW), verifyPlanPayment(admin, sent.id!, {}, NOW)]);
    assert.ok(a.ok && b.ok);
    assert.ok([a.code, b.code].includes("already"), "one of the two calls changed nothing");
    const first = await db.planPurchase.findUniqueOrThrow({ where: { id: sent.id! } });
    const again = await verifyPlanPayment(admin, sent.id!, {}, ist("2026-12-01T00:00:00"));
    assert.equal(again.code, "already");
    const after = await db.planPurchase.findUniqueOrThrow({ where: { id: sent.id! } });
    assert.equal(iso(after.endsAt), iso(first.endsAt), "the term isn't extended again");
    assert.equal(iso(after.startsAt), iso(ist("2026-11-12T00:00:00")));
    const verified = await db.planPurchase.count({ where: { clientId: c.id, status: "VERIFIED" } });
    assert.equal(verified, 2, "the recorded Growth period plus this one");
    // A turned-down payment can't be verified later by a stray click either.
    const other = await growthClient("twice-b");
    const s2 = await submitPlanPayment(manager(other.id), { clientId: other.id, plan: "starter", cycle: "m", utr: utr() }, NOW);
    assert.equal((await rejectPlanPayment(admin, s2.id!, "Not in bank")).ok, true);
    assert.equal((await verifyPlanPayment(admin, s2.id!, {}, NOW)).ok, false);
    assert.equal((await rejectPlanPayment(admin, s2.id!, "again")).ok, false);
  });

  test("8b. one UPI reference pays once, and one payment at a time", async () => {
    const c = await growthClient("dup");
    const d = await growthClient("dup-b");
    const ref = utr();
    assert.equal((await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "growth", cycle: "m", utr: ref }, NOW)).ok, true);
    const again = await submitPlanPayment(manager(d.id), { clientId: d.id, plan: "growth", cycle: "m", utr: ref.toLowerCase() }, NOW);
    assert.equal(again.ok, false);
    assert.equal(again.code, "duplicate");
    // While one is being checked, another can't be started.
    const second = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "business", cycle: "m", utr: utr() }, NOW);
    assert.equal(second.code, "pending");
    // Once verified and waiting to start, no overlapping purchase either.
    const pend = summarize(await rowsOf(c.id), NOW).pending!;
    await verifyPlanPayment(admin, pend.id, {}, NOW);
    const third = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "business", cycle: "m", utr: utr() }, NOW);
    assert.equal(third.code, "scheduled");
    // Once that period has started, the next one can be bought; it queues after it.
    const later = ist("2026-11-15T00:00:00");
    const fourth = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "business", cycle: "m", utr: utr() }, later);
    assert.equal(fourth.ok, true, fourth.message);
    await verifyPlanPayment(admin, fourth.id!, {}, later);
    const row = await db.planPurchase.findUniqueOrThrow({ where: { id: fourth.id! } });
    assert.equal(iso(row.startsAt), iso(ist("2026-12-12T00:00:00")));
  });

  test("9. a client can't verify, record periods or touch another business's payments", async () => {
    const a = await growthClient("auth-a");
    const b = await growthClient("auth-b");
    const sent = await submitPlanPayment(manager(a.id), { clientId: a.id, plan: "business", cycle: "m", utr: utr() }, NOW);
    assert.equal((await verifyPlanPayment(manager(a.id), sent.id!, {}, NOW)).code, "forbidden", "own payment");
    assert.equal((await verifyPlanPayment(manager(b.id), sent.id!, {}, NOW)).code, "forbidden");
    assert.equal((await rejectPlanPayment(manager(b.id), sent.id!, "x")).code, "forbidden");
    assert.equal((await cancelPlanPayment(manager(b.id), sent.id!)).code, "not_found", "another business's payment is invisible");
    assert.equal((await recordExistingPeriod(manager(a.id), { clientId: a.id, plan: "business", cycle: "y", startDate: "2026-10-01" }, NOW)).code, "forbidden");
    assert.equal((await submitPlanPayment(manager(b.id), { clientId: a.id, plan: "starter", cycle: "m", utr: utr() }, NOW)).code, "forbidden");
    assert.equal((await submitPlanPayment(staff(a.id), { clientId: a.id, plan: "starter", cycle: "m", utr: utr() }, NOW)).code, "forbidden", "staff can't pay");
    const still = await db.planPurchase.findUniqueOrThrow({ where: { id: sent.id! } });
    assert.equal(still.status, "PENDING");
    // The owner may withdraw their own unchecked payment; that grants nothing either.
    assert.equal((await cancelPlanPayment(manager(a.id), sent.id!)).ok, true);
    assert.equal((await effectivePlan(a.id, NOW)).plan?.k, "growth");
    // Unknown plans and cycles are refused.
    assert.equal((await submitPlanPayment(manager(b.id), { clientId: b.id, plan: "enterprise", cycle: "m", utr: utr() }, NOW)).code, "invalid");
    assert.equal((await submitPlanPayment(manager(b.id), { clientId: b.id, plan: "growth", cycle: "w", utr: utr() }, NOW)).code, "invalid");
  });

  test("10. a business with no paid period starts on verification, but only when the admin confirms", async () => {
    const c = await newClient("fresh");
    const sent = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "starter", cycle: "m", utr: utr() }, NOW);
    const ask = await verifyPlanPayment(admin, sent.id!, {}, NOW);
    assert.equal(ask.ok, false);
    assert.equal(ask.code, "needs_confirm", "a missing record isn't taken as 'never paid'");
    assert.equal((await db.planPurchase.findUniqueOrThrow({ where: { id: sent.id! } })).status, "PENDING");
    const ok = await verifyPlanPayment(admin, sent.id!, { startNowIfNoHistory: true }, NOW);
    assert.equal(ok.ok, true, ok.message);
    const row = await db.planPurchase.findUniqueOrThrow({ where: { id: sent.id! } });
    assert.equal(iso(row.startsAt), iso(NOW));
    assert.equal(iso(row.endsAt), iso(ist("2026-11-26T10:00:00")));
    assert.equal((await effectivePlan(c.id, NOW)).plan?.k, "starter");
  });

  test("10b. after a plan has ended, a new payment starts when verified", async () => {
    const c = await newClient("lapsed");
    await recordExistingPeriod(admin, { clientId: c.id, plan: "growth", cycle: "m", startDate: "2026-08-01" }, NOW);
    assert.equal((await effectivePlan(c.id, NOW)).status, "expired");
    const sent = await submitPlanPayment(manager(c.id), { clientId: c.id, plan: "growth", cycle: "m", utr: utr() }, NOW);
    const v = await verifyPlanPayment(admin, sent.id!, {}, NOW);
    assert.equal(v.ok, true, v.message);
    const row = await db.planPurchase.findUniqueOrThrow({ where: { id: sent.id! } });
    assert.equal(iso(row.startsAt), iso(NOW), "no back-dating into the gap");
  });

  test("recorded periods can't overlap", async () => {
    const c = await growthClient("overlap");
    const r = await recordExistingPeriod(admin, { clientId: c.id, plan: "business", cycle: "m", startDate: "2026-10-20" }, NOW);
    assert.equal(r.code, "overlap");
  });

  test("limits follow the plan in force; an ended plan keeps no capacity; untracked businesses are unchanged", async () => {
    const c = await growthClient("limits");
    for (let i = 0; i < 3; i++) await db.user.create({ data: { name: `Staff ${i}`, email: `lim-${c.id}-${i}@test.local`, passwordHash: "x", role: "CLIENT", clientId: c.id } });
    assert.match((await planCapacityBlock(c.id, "staff", NOW)) ?? "", /allows 3 staff logins/);
    assert.equal(await planCapacityBlock(c.id, "num", NOW), null);
    assert.match((await planCapacityBlock(c.id, "num", ist("2026-12-01T00:00:00"))) ?? "", /plan ended/);
    const legacy = await newClient("legacy");
    assert.equal(await planCapacityBlock(legacy.id, "staff", NOW), null);
  });
});

describe("access: due soon, overdue, locked, never paid", () => {
  const period = (startIso: string, endIso: string, extra: Partial<PurchaseLike> = {}): PurchaseLike => ({
    id: Math.random().toString(36).slice(2),
    plan: "growth",
    cycle: "m",
    status: "VERIFIED",
    startsAt: ist(startIso),
    endsAt: ist(endIso),
    createdAt: ist(startIso),
    ...extra,
  });
  const growth = [period("2026-10-12T00:00:00", "2026-11-12T00:00:00")];

  test("paid with more than 5 days left is ok; 5 days or fewer is due", () => {
    assert.equal(accessState(growth, true, NOW).state, "ok");
    const due = accessState(growth, true, ist("2026-11-08T12:00:00"));
    assert.equal(due.state, "due");
    assert.equal(due.days, 4);
    assert.equal(due.locked, false);
  });

  test("due is not shown when the next period is already paid", () => {
    const rows = [...growth, period("2026-11-12T00:00:00", "2026-12-12T00:00:00")];
    assert.equal(accessState(rows, true, ist("2026-11-10T00:00:00")).state, "ok");
  });

  test("after the end: overdue for the grace days, then locked", () => {
    const over = accessState(growth, true, ist("2026-11-13T00:00:00"));
    assert.equal(over.state, "overdue");
    assert.equal(over.locked, false);
    const locked = accessState(growth, true, ist("2026-11-14T00:00:00"));
    assert.equal(locked.state, "locked");
    assert.equal(locked.locked, true);
    assert.equal(locked.plan, "growth");
  });

  test("a payment waiting to be checked never unlocks", () => {
    const rows = [...growth, { ...period("2026-11-20T00:00:00", "2026-11-20T00:00:00"), status: "PENDING", startsAt: null, endsAt: null }];
    assert.equal(accessState(rows, true, ist("2026-11-20T00:00:00")).locked, true);
  });

  test("never paid: locked only when the business needs a plan", () => {
    assert.equal(accessState([], true, NOW).state, "new");
    assert.equal(accessState([], true, NOW).locked, true);
    assert.equal(accessState([], false, NOW).state, "unmanaged");
    assert.equal(accessState([], false, NOW).locked, false);
  });

  test("only Home, My account and Settings stay open", () => {
    for (const p of ["/dashboard", "/dashboard/", "/dashboard/account", "/dashboard/account?pay=now", "/dashboard/settings", "/dashboard/settings/sheet"]) assert.equal(openWhenLocked(p), true, p);
    for (const p of ["/dashboard/orders", "/dashboard/campaigns/new", "/dashboard/customers/abc", "/dashboard/accounts", "/dashboard/report", "/dashboard/guide"]) assert.equal(openWhenLocked(p), false, p);
  });

  test("locked businesses are found for the scheduler; old untracked ones are not", async () => {
    const paid = await growthClient("lock-paid");
    const neverPaid = await db.client.create({ data: { name: `Sub lock-new ${Date.now()} ${++seq}`, planRequired: true } });
    const legacy = await newClient("lock-legacy");
    const later = ist("2026-11-20T00:00:00");
    const lockedNow = await lockedClientIds(NOW);
    assert.equal(lockedNow.has(paid.id), false);
    assert.equal(lockedNow.has(neverPaid.id), true);
    assert.equal(lockedNow.has(legacy.id), false);
    const lockedLater = await lockedClientIds(later);
    assert.equal(lockedLater.has(paid.id), true, "Growth ended 12 Nov, past the grace days");
    // Verifying a payment opens it again.
    const sent = await submitPlanPayment(manager(paid.id), { clientId: paid.id, plan: "growth", cycle: "m", utr: utr() }, later);
    assert.equal((await clientAccess(paid.id, later)).locked, true, "still locked while the payment is checked");
    await verifyPlanPayment(admin, sent.id!, {}, later);
    assert.equal((await clientAccess(paid.id, later)).locked, false);
    assert.equal((await lockedClientIds(later)).has(paid.id), false);
  });
});
