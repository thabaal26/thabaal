import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ORDER_FLOWS, readFlow, DEFAULT_FLOW } from "../../src/lib/order-flow";

test("Thabaal Dual Payment Tracks Architectural Separation Suite", async (t) => {
  const rootDir = path.resolve(__dirname, "../../");

  await t.test("1. TRACK 1: WhatsApp Customer Commerce files have ZERO Razorpay SaaS billing dependencies", () => {
    const track1Files = [
      path.join(rootDir, "src/lib/payments.ts"),
      path.join(rootDir, "src/lib/order-flow.ts"),
      path.join(rootDir, "src/lib/cod.ts"),
    ];

    for (const filePath of track1Files) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        assert.ok(
          !content.includes("startPlanSubscription"),
          `${path.basename(filePath)} must not reference startPlanSubscription`
        );
        assert.ok(
          !content.includes("startPlanOrder"),
          `${path.basename(filePath)} must not reference startPlanOrder`
        );
        assert.ok(
          !content.includes("startWalletOrder"),
          `${path.basename(filePath)} must not reference startWalletOrder`
        );
      }
    }
  });

  await t.test("2. TRACK 2: Razorpay SaaS Billing has ZERO orderFlow dependencies", () => {
    const razorpayBillingPath = path.join(rootDir, "src/lib/razorpay-billing.ts");
    assert.ok(fs.existsSync(razorpayBillingPath), "razorpay-billing.ts must exist");

    const content = fs.readFileSync(razorpayBillingPath, "utf8");
    assert.ok(
      !content.includes("ORDER_FLOWS"),
      "razorpay-billing.ts must not reference ORDER_FLOWS"
    );
    assert.ok(
      !content.includes("readFlow"),
      "razorpay-billing.ts must not reference readFlow"
    );
    assert.ok(
      !content.includes("flowShips"),
      "razorpay-billing.ts must not reference flowShips"
    );
  });

  await t.test("3. TRACK 1: orderFlow strictly governs customer fulfillment (pickup, deliver, courier, service)", () => {
    const validKeys = Object.keys(ORDER_FLOWS);
    assert.deepEqual(validKeys.sort(), ["courier", "deliver", "pickup", "service"].sort());
    assert.equal(DEFAULT_FLOW, "deliver");
    assert.equal(readFlow(null), "deliver");
    assert.equal(readFlow(undefined), "deliver");
    assert.equal(readFlow("service"), "service");
  });

  await t.test("4. TRACK 2: SaaS Plans and Purchases are strictly decoupled from Customer Orders", () => {
    const schemaPath = path.join(rootDir, "prisma/schema.prisma");
    assert.ok(fs.existsSync(schemaPath), "prisma/schema.prisma must exist");

    const schema = fs.readFileSync(schemaPath, "utf8");
    // Verify PlanPurchase does not relate to customer Order
    assert.match(schema, /model PlanPurchase \{/);
    assert.match(schema, /model RazorpayRecord \{/);
    assert.match(schema, /model Order \{/);

    // PlanPurchase has no orderId column linking to Customer Order
    const planPurchaseBlock = schema.split("model PlanPurchase {")[1]?.split("}")[0] || "";
    assert.ok(!planPurchaseBlock.includes("orderId"), "PlanPurchase must not reference Order table");
  });
});
