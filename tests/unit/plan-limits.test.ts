// Plan limits (lib/subscription.ts planUsage, planCapacityBlock; lib/dispatcher.ts startDueCampaigns): Starter allows
// 2 numbers, 1 staff login besides the owner, 5 campaign sends a month and 10 templates; a business with no plan on
// record (let off paying) has no limits; a scheduled send over the month's limit is skipped, not sent.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { startDueCampaigns } from "../../src/lib/dispatcher";
import { planCapacityBlock, planUsage } from "../../src/lib/subscription";

let seq = 0;
async function shop(plan: "starter" | "growth" | null) {
  const c = await db.client.create({ data: { name: `Limits ${Date.now()} ${++seq}`, planRequired: plan !== null } });
  if (plan) {
    const now = Date.now();
    await db.planPurchase.create({
      data: { clientId: c.id, plan, cycle: "m", amountPaise: 119_900, status: "VERIFIED", method: "ADMIN_RECORD", startsAt: new Date(now - 5 * 86_400_000), endsAt: new Date(now + 25 * 86_400_000), decidedAt: new Date(now - 5 * 86_400_000), submittedBy: "test" },
    });
  }
  return c;
}
const login = (clientId: string, access: "MANAGER" | "STAFF" = "STAFF") =>
  db.user.create({ data: { clientId, role: "CLIENT", access, name: "L", email: `lim-${Date.now()}-${++seq}@example.test`, passwordHash: "x" } });
const template = (clientId: string, status: "APPROVED" | "REJECTED" | "PENDING" = "APPROVED") =>
  db.template.create({ data: { clientId, name: `t_${++seq}`, category: "MARKETING", body: "Hello", status } });

describe("plan limits", () => {
  test("1. staff logins count everyone but the owner; Starter allows one", async () => {
    const c = await shop("starter");
    await login(c.id, "MANAGER"); // the owner
    assert.equal((await planUsage(c.id)).staff, 0);
    assert.equal(await planCapacityBlock(c.id, "staff"), null);
    await login(c.id);
    assert.equal((await planUsage(c.id)).staff, 1);
    assert.match((await planCapacityBlock(c.id, "staff")) ?? "", /Starter plan allows 1 staff logins, and all are in use/);
  });

  test("2. templates: 10 on Starter, rejected ones don't count", async () => {
    const c = await shop("starter");
    for (let i = 0; i < 9; i++) await template(c.id);
    await template(c.id, "REJECTED");
    assert.equal((await planUsage(c.id)).tmpl, 9);
    assert.equal(await planCapacityBlock(c.id, "tmpl"), null);
    await template(c.id, "PENDING");
    assert.match((await planCapacityBlock(c.id, "tmpl")) ?? "", /allows 10 templates/);
  });

  test("3. campaign sends: 5 a month on Starter; last month's don't count", async () => {
    const c = await shop("starter");
    const t = await template(c.id);
    const camp = await db.campaign.create({ data: { clientId: c.id, templateId: t.id, name: "c", scheduleType: "ONCE", active: false } });
    await db.campaignRun.create({ data: { campaignId: camp.id, scheduledFor: new Date(), total: 0, startedAt: new Date(Date.now() - 40 * 86_400_000) } });
    for (let i = 0; i < 4; i++) await db.campaignRun.create({ data: { campaignId: camp.id, scheduledFor: new Date(), total: 0 } });
    assert.equal((await planUsage(c.id)).camp, 4);
    assert.equal(await planCapacityBlock(c.id, "camp"), null);
    await db.campaignRun.create({ data: { campaignId: camp.id, scheduledFor: new Date(), total: 0 } });
    assert.match((await planCapacityBlock(c.id, "camp")) ?? "", /allows 5 campaign sends a month, and all 5 are used this month/);
  });

  test("4. a business with no plan on record (let off paying) has no limits", async () => {
    const c = await shop(null);
    await login(c.id, "MANAGER");
    for (let i = 0; i < 4; i++) await login(c.id);
    assert.equal(await planCapacityBlock(c.id, "staff"), null);
  });

  test("5. a scheduled send over the month's limit is skipped (next one still scheduled); under the limit it starts", async () => {
    const c = await shop("starter");
    const t = await template(c.id);
    const used = await db.campaign.create({ data: { clientId: c.id, templateId: t.id, name: "used", scheduleType: "ONCE", active: false } });
    for (let i = 0; i < 5; i++) await db.campaignRun.create({ data: { campaignId: used.id, scheduledFor: new Date(), total: 0 } });
    const due = new Date(Date.now() - 60_000);
    const weekly = await db.campaign.create({
      data: { clientId: c.id, templateId: t.id, name: "weekly", scheduleType: "WEEKLY", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], sendTime: "10:00", nextRunAt: due },
    });
    await startDueCampaigns(new Date(), new Set());
    assert.equal(await db.campaignRun.count({ where: { campaignId: weekly.id } }), 0, "over the limit: not started");
    const after = await db.campaign.findUniqueOrThrow({ where: { id: weekly.id } });
    assert.ok(after.active && after.nextRunAt && after.nextRunAt > new Date(), "the next send is still scheduled");

    const g = await shop("growth");
    const t2 = await template(g.id);
    const ok = await db.campaign.create({ data: { clientId: g.id, templateId: t2.id, name: "ok", scheduleType: "ONCE", runAt: due, nextRunAt: due } });
    await startDueCampaigns(new Date(), new Set());
    assert.equal(await db.campaignRun.count({ where: { campaignId: ok.id } }), 1, "Growth with room: started");
  });
});
