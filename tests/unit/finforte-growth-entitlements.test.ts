import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, type PlanDef } from "../../src/lib/account-plans";
import { accessState, type PurchaseLike } from "../../src/lib/subscription-core";

test("Finforte Growth Plan Entitlements & Verification Suite", async (t) => {
  const growthPlan = PLANS.find((p) => p.k === "growth");

  await t.test("1. Growth plan definition exists in authoritative plan list", () => {
    assert.ok(growthPlan, "Growth plan definition must exist");
    assert.equal(growthPlan.k, "growth");
    assert.equal(growthPlan.n, "Growth");
  });

  await t.test("2. Growth plan limits match authoritative pricing specification", () => {
    assert.ok(growthPlan);
    assert.equal(growthPlan.lim.num, 3, "Growth includes 3 WhatsApp numbers");
    assert.equal(growthPlan.lim.staff, 3, "Growth includes 3 staff logins");
    assert.equal(growthPlan.lim.camp, 20, "Growth includes 20 campaigns/month");
    assert.equal(growthPlan.lim.tmpl, 50, "Growth includes 50 templates");
  });

  await t.test("3. Growth plan features list includes commerce, payments, loyalty, and refill tracking", () => {
    assert.ok(growthPlan);
    const features = growthPlan.f;
    assert.ok(features.some((f) => f.includes("payment requests")), "Includes auto payment requests");
    assert.ok(features.some((f) => f.includes("Packing lists")), "Includes packing lists");
    assert.ok(features.some((f) => f.includes("Loyalty points")), "Includes loyalty points");
    assert.ok(features.some((f) => f.includes("Refill reminders")), "Includes refill reminders");
    assert.ok(features.some((f) => f.includes("customer reports")), "Includes customer reports");
  });

  await t.test("4. Subscription accessState computes active status for Finforte verified period", () => {
    const now = new Date("2026-11-19T06:30:00.000Z");
    const finfortePurchases: PurchaseLike[] = [
      {
        id: "cmwi1ektf0003kznacmahxrry",
        plan: "growth",
        cycle: "m",
        status: "VERIFIED",
        startsAt: new Date("2026-11-15T16:16:35.802Z"),
        endsAt: new Date("2026-12-15T16:16:35.802Z"),
        createdAt: new Date("2026-11-15T16:16:35.812Z"),
      },
    ];

    const access = accessState(finfortePurchases, false, now);
    assert.equal(access.locked, false, "Tenant must not be locked");
    assert.equal(access.state, "ok", "Access state must be ok");
    assert.equal(access.plan, "growth", "Plan must be growth");
    assert.equal(access.cycle, "m", "Cycle must be monthly");
    assert.ok(access.days > 0, "Remaining days must be positive");
  });
});
