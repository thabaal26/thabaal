// Usage tracking (lib/usage-record.ts) and the admin Usage page's numbers (lib/admin-data.ts): only business logins
// count, each day is counted once per login and key, and nothing is shown that wasn't recorded.
// Dates are in 2030 so these rows never mix with other test files' data.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { db } from "../../src/lib/db";
import { loadClientRows, loadHistory, loadUsage } from "../../src/lib/admin-data";
import { recordUsage, sectionOf } from "../../src/lib/usage-record";

const ist = (s: string) => fromZonedTime(s, "Asia/Kolkata");
let seq = 0;

async function shop(tag: string, planRequired = false) {
  const c = await db.client.create({ data: { name: `Usage ${tag} ${Date.now()} ${++seq}`, planRequired } });
  const u = await db.user.create({ data: { email: `usage-${Date.now()}-${++seq}@example.test`, name: "Owner", passwordHash: "x", role: "CLIENT", clientId: c.id } });
  return { client: c, who: { id: u.id, role: "CLIENT", clientId: c.id } };
}

describe("recording usage", () => {
  test("1. a /dashboard address maps to its section; anything else is ignored", () => {
    assert.equal(sectionOf("/dashboard"), "");
    assert.equal(sectionOf("/dashboard/orders/abc123"), "orders");
    assert.equal(sectionOf("/dashboard/replies?c=1"), "replies");
    assert.equal(sectionOf("/dashboard/no-such-page"), null);
    assert.equal(sectionOf("/admin/usage"), null);
    assert.equal(sectionOf("/dashboardx"), null);
    assert.equal(sectionOf("/dashboard/../../admin"), null);
    assert.equal(sectionOf("/dashboard/orders/../x"), null);
    assert.equal(sectionOf("/dashboard/customers/c1a2b3"), "customers");
  });

  test("2. business logins are counted per day; Thabaal's admins and unknown keys never are", async () => {
    const { client, who } = await shop("count");
    const at = ist("2030-02-10T11:00:00");
    assert.equal(await recordUsage(who, "open", "orders", at), true);
    assert.equal(await recordUsage(who, "open", "orders", ist("2030-02-10T18:00:00")), true);
    assert.equal(await recordUsage(who, "open", "orders", ist("2030-02-11T09:00:00")), true);
    assert.equal(await recordUsage(who, "press", "payment.record", at), true);
    assert.equal(await recordUsage(who, "login", "login", at), true);
    assert.equal(await recordUsage(who, "open", "no-such-section", at), false);
    assert.equal(await recordUsage(who, "press", "drop.tables", at), false);
    const admin = await db.user.create({ data: { email: `usage-admin-${Date.now()}@example.test`, name: "Admin", passwordHash: "x", role: "ADMIN" } });
    assert.equal(await recordUsage({ id: admin.id, role: "ADMIN", clientId: client.id }, "open", "orders", at), false, "admin helping a client");
    assert.equal(await recordUsage(null, "open", "orders", at), false);

    const rows = await db.usageDay.findMany({ where: { clientId: client.id }, orderBy: [{ day: "asc" }, { kind: "asc" }] });
    const orders = rows.filter((r) => r.kind === "open" && r.key === "orders");
    assert.deepEqual(orders.map((r) => r.count), [2, 1], "two opens on the 10th, one on the 11th");
    assert.equal(orders[0].lastAt.toISOString(), ist("2030-02-10T18:00:00").toISOString());
    assert.equal(rows.length, 4, "nothing recorded for the admin or the unknown keys");
  });
});

describe("the Usage page numbers", () => {
  test("3. sections opened, buttons pressed and the 14-day heatmap come from what was recorded", async () => {
    const now = ist("2031-05-20T12:00:00");
    const a = await shop("feat-a");
    const b = await shop("feat-b");
    const c = await shop("feat-c");
    await recordUsage(c.who, "open", "templates", ist("2031-05-01T00:30:00")); // first half-hour of the month still counts
    await recordUsage(a.who, "open", "orders", ist("2031-05-19T10:00:00"));
    await recordUsage(a.who, "open", "calls", ist("2031-05-19T10:05:00"));
    await recordUsage(a.who, "open", "replies", ist("2031-05-18T10:00:00"));
    await recordUsage(b.who, "open", "orders", ist("2031-05-19T12:00:00"));
    await recordUsage(b.who, "login", "login", ist("2031-05-12T12:00:00"));
    for (let i = 0; i < 3; i++) await recordUsage(a.who, "press", "payment.record", ist("2031-05-19T10:00:00"));
    await recordUsage(b.who, "press", "order.new", ist("2031-05-19T10:00:00"));
    await recordUsage(b.who, "press", "order.new", ist("2031-04-19T10:00:00")); // last month: not counted

    const u = await loadUsage(now);
    assert.equal(u.activeShops, 3);
    assert.deepEqual(u.sections.find((s) => s.label === "Orders"), { label: "Orders", shops: 2, pct: 67 });
    assert.deepEqual(u.sections.find((s) => s.label === "Chats"), { label: "Chats", shops: 1, pct: 33 }, "calls and replies fold into Chats, one business once");
    assert.deepEqual(u.sections.find((s) => s.label === "Templates"), { label: "Templates", shops: 1, pct: 33 });
    assert.deepEqual(u.presses, [
      { label: "Mark as paid", count: 3 },
      { label: "New order", count: 1 },
    ]);
    const day = (k: string) => u.days.find((d) => d.key === k)?.opened;
    assert.equal(u.days.length, 14);
    assert.equal(day("2031-05-19"), 2);
    assert.equal(day("2031-05-18"), 1);
    assert.equal(day("2031-05-12"), 1, "a sign-in counts as opening the app");
    assert.equal(day("2031-05-13"), 0);
  });

  test("4. last opened, sign-ins and the 'hasn't opened thabaal' risk", async () => {
    const now = ist("2032-03-20T12:00:00");
    const quiet = await shop("quiet", true);
    const busy = await shop("busy", true);
    await recordUsage(quiet.who, "open", "orders", ist("2032-03-01T10:00:00"));
    await recordUsage(busy.who, "login", "login", ist("2032-03-19T10:00:00"));
    await recordUsage(busy.who, "login", "login", ist("2032-03-19T15:00:00"));
    const { rows } = await loadClientRows(now);
    const q = rows.find((r) => r.id === quiet.client.id)!;
    const b = rows.find((r) => r.id === busy.client.id)!;
    assert.equal(q.lastOpened?.toISOString(), ist("2032-03-01T10:00:00").toISOString());
    assert.ok(q.reasons.includes("hasn't opened thabaal in 14 days"), q.reasons.join(", "));
    assert.equal(b.logins30, 2);
    assert.ok(!b.reasons.some((r) => r.includes("opened thabaal")), b.reasons.join(", "));
  });

  test("5. businesses kept: of those paying at the end of a month, the share still paying a month later", async () => {
    const p = (clientId: string, from: string, to: string) => ({
      id: `${clientId}-${from}`,
      clientId,
      plan: "growth",
      cycle: "m",
      status: "VERIFIED",
      method: "RAZORPAY",
      startsAt: ist(`${from}T00:00:00`),
      endsAt: ist(`${to}T00:00:00`),
      createdAt: ist(`${from}T00:00:00`),
      decidedAt: ist(`${from}T00:00:00`),
      amountPaise: 299_900,
      utr: null,
    });
    const purchases = [p("A", "2033-01-01", "2033-04-05"), p("B", "2033-01-01", "2033-02-01"), p("C", "2033-02-01", "2033-04-05")];
    const hist = await loadHistory(purchases, ist("2033-03-20T12:00:00"), 3);
    assert.deepEqual(
      hist.map((h) => [h.label, h.paying, h.kept]),
      [
        ["Jan", 2, null],
        ["Feb", 2, 50],
        ["Mar", 2, 100],
      ],
    );
  });
});
