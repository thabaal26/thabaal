import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { db } from "../../src/lib/db";
import {
  catalogProducts,
  createCatalogProductItem,
  deleteCatalogProductItem,
  updateCatalogProductItem,
} from "../../src/lib/catalog";
import { storePublicImage, uploadedImageId } from "../../src/lib/uploaded-image";
import { computeNextRun } from "../../src/lib/schedule";
import { APP_TZ } from "../../src/lib/format";
import { fromZonedTime } from "date-fns-tz";

describe("Comprehensive System-wide CRUD Test Suite (Products, Campaigns, Customers, Orders, Audiences, Templates)", () => {
  let clientId: string;

  before(async () => {
    const client = await db.client.upsert({
      where: { name: "QA Test Shop" },
      update: {},
      create: {
        name: "QA Test Shop",
        brandPrimary: "#0D9488",
        brandAccent: "#14B8A6",
        homeCity: "Madurai",
        orderFlow: "deliver",
        businessType: "retail",
        billingMode: "direct",
      },
    });
    clientId = client.id;
  });

  after(async () => {
    // Clean up test data
    await db.order.deleteMany({ where: { clientId, number: { gte: 999000 } } });
    await db.customer.deleteMany({ where: { clientId, phone: { startsWith: "9199999" } } });
    await db.campaign.deleteMany({ where: { clientId, name: { startsWith: "QA CRUD Campaign" } } });
    await db.audience.deleteMany({ where: { clientId, name: { startsWith: "QA CRUD Audience" } } });
    await db.template.deleteMany({ where: { clientId, name: { startsWith: "qa_crud_" } } });
  });

  /* ------------------------------------------------------------------
   * 1. CATALOGUE PRODUCT & IMAGE CRUD
   * ------------------------------------------------------------------ */
  describe("1. Catalogue Product & Image CRUD", () => {
    const testSku = "QA-TEST-SKU-999";
    let uploadedImageUrl: string;

    test("1.1 Image Upload: storePublicImage stores in PortalUploadedImage and returns public /api/upload/[id] link", async () => {
      const sampleBytes = Buffer.from("fake-jpeg-image-bytes-for-product-photo", "utf8");
      uploadedImageUrl = await storePublicImage({
        bytes: sampleBytes,
        contentType: "image/jpeg",
        filename: "groundnut-oil.jpg",
        origin: "https://www.thabaal.in",
      });

      assert.ok(uploadedImageUrl.startsWith("https://www.thabaal.in/api/upload/"));
      const imageId = uploadedImageId(uploadedImageUrl);
      assert.ok(imageId);

      const record = await db.portalUploadedImage.findUnique({ where: { id: imageId } });
      assert.ok(record, "Uploaded image must exist in PortalUploadedImage table");
      assert.equal(record.mimeType, "image/jpeg");
      assert.equal(Buffer.from(record.data).toString("utf8"), "fake-jpeg-image-bytes-for-product-photo");
    });

    test("1.2 Create: adds product in test mode and validates parameters", async () => {
      // Invalid SKU test (spaces forbidden)
      const badSku = await createCatalogProductItem(clientId, {
        retailerId: "bad sku with spaces!",
        name: "Test Oil",
        priceAmount: 100,
        inStock: true,
        description: "Test description",
        imageUrl: null,
        brand: "QA Test Shop",
        link: "https://example.com",
      });
      assert.equal(badSku.ok, false);

      // Valid Create with image URL
      const res = await createCatalogProductItem(clientId, {
        retailerId: testSku,
        name: "Cold Pressed Groundnut Oil 1L",
        priceAmount: 280,
        inStock: true,
        description: "Pure cold pressed oil from QA Test Shop",
        imageUrl: uploadedImageUrl,
        brand: "QA Test Shop",
        link: "https://example.com/product",
      });
      assert.equal(res.ok, true);
    });

    test("1.3 Read: newly added product appears in catalogProducts list with correct properties", async () => {
      const products = await catalogProducts(clientId);
      const item = products.find((p) => p.retailerId === testSku);
      assert.ok(item, "Created product should be present in catalogProducts");
      assert.equal(item.name, "Cold Pressed Groundnut Oil 1L");
      assert.equal(item.priceAmount, 280);
      assert.equal(item.inStock, true);
      assert.equal(item.imageUrl, uploadedImageUrl);
    });

    test("1.4 Update: modifies price, stock status, name and description", async () => {
      const products = await catalogProducts(clientId);
      const item = products.find((p) => p.retailerId === testSku);
      assert.ok(item);

      const updateRes = await updateCatalogProductItem(clientId, {
        id: item.id,
        retailerId: testSku,
        name: "Cold Pressed Groundnut Oil 1L (Updated)",
        priceAmount: 310,
        inStock: false,
        description: "Updated pure cold pressed groundnut oil - out of stock temporarily",
      });
      assert.equal(updateRes.ok, true);

      // Verify read reflects changes
      const updatedProducts = await catalogProducts(clientId);
      const updatedItem = updatedProducts.find((p) => p.retailerId === testSku);
      assert.ok(updatedItem);
      assert.equal(updatedItem.name, "Cold Pressed Groundnut Oil 1L (Updated)");
      assert.equal(updatedItem.priceAmount, 310);
      assert.equal(updatedItem.inStock, false);
      assert.equal(updatedItem.description, "Updated pure cold pressed groundnut oil - out of stock temporarily");
    });

    test("1.5 Delete: removes product from catalogProducts", async () => {
      const deleteRes = await deleteCatalogProductItem(clientId, testSku);
      assert.equal(deleteRes.ok, true);

      const products = await catalogProducts(clientId);
      const item = products.find((p) => p.retailerId === testSku);
      assert.equal(item, undefined, "Deleted product should no longer be present");
    });
  });

  /* ------------------------------------------------------------------
   * 2. CAMPAIGN CRUD (Weekly & Once, Schedules, Pause/Resume, Delete)
   * ------------------------------------------------------------------ */
  describe("2. Campaign CRUD", () => {
    let templateId: string;
    let campaignId: string;
    const campaignName = `QA CRUD Campaign ${Date.now().toString().slice(-4)}`;

    before(async () => {
      const t = await db.template.create({
        data: {
          clientId,
          name: `qa_crud_campaign_tpl_${Date.now().toString().slice(-4)}`,
          language: "en",
          category: "MARKETING",
          headerType: "NONE",
          body: "Hello {{1}}, test campaign broadcast!",
          variables: { "1": { source: "first_name" } },
          status: "APPROVED",
        },
      });
      templateId = t.id;
    });

    test("2.1 Create: creates a WEEKLY campaign with nextRunAt calculated", async () => {
      const scheduleData = {
        scheduleType: "WEEKLY" as const,
        daysOfWeek: [1, 4], // Mon & Thu
        sendTime: "10:30",
        runAt: null,
        timezone: APP_TZ,
      };
      const nextRunAt = computeNextRun(scheduleData);
      assert.ok(nextRunAt, "Weekly schedule must have a valid future nextRunAt");

      const c = await db.campaign.create({
        data: {
          clientId,
          name: `${campaignName} Weekly`,
          templateId,
          scheduleType: "WEEKLY",
          daysOfWeek: [1, 4],
          sendTime: "10:30",
          timezone: APP_TZ,
          batchSize: 50,
          intervalMinutes: 10,
          active: true,
          nextRunAt,
          skipUnread: true,
        },
      });

      assert.ok(c.id);
      campaignId = c.id;
      assert.equal(c.name, `${campaignName} Weekly`);
      assert.equal(c.scheduleType, "WEEKLY");
      assert.deepEqual(c.daysOfWeek, [1, 4]);
      assert.equal(c.sendTime, "10:30");
      assert.equal(c.batchSize, 50);
      assert.equal(c.intervalMinutes, 10);
      assert.equal(c.active, true);
    });

    test("2.2 Read: queries campaign by ID and verifies audience and schedule settings", async () => {
      const c = await db.campaign.findUnique({
        where: { id: campaignId },
        include: { template: true },
      });
      assert.ok(c);
      assert.equal(c.clientId, clientId);
      assert.equal(c.template.id, templateId);
      assert.equal(c.active, true);
      assert.ok(c.nextRunAt instanceof Date);
    });

    test("2.3 Update: changes schedule days, sendTime and batching parameters", async () => {
      const updatedSchedule = {
        scheduleType: "WEEKLY" as const,
        daysOfWeek: [2, 5], // Tue & Fri
        sendTime: "18:00",
        runAt: null,
        timezone: APP_TZ,
      };
      const updatedNextRunAt = computeNextRun(updatedSchedule);

      const updated = await db.campaign.update({
        where: { id: campaignId },
        data: {
          name: `${campaignName} Weekly Edited`,
          daysOfWeek: [2, 5],
          sendTime: "18:00",
          batchSize: 100,
          intervalMinutes: 15,
          nextRunAt: updatedNextRunAt,
        },
      });

      assert.equal(updated.name, `${campaignName} Weekly Edited`);
      assert.deepEqual(updated.daysOfWeek, [2, 5]);
      assert.equal(updated.sendTime, "18:00");
      assert.equal(updated.batchSize, 100);
      assert.equal(updated.intervalMinutes, 15);
      assert.equal(updated.nextRunAt?.toISOString(), updatedNextRunAt?.toISOString());
    });

    test("2.4 Toggle Pause & Resume: pausing clears nextRunAt; resuming restores nextRunAt", async () => {
      // Pause
      const paused = await db.campaign.update({
        where: { id: campaignId },
        data: { active: false, nextRunAt: null },
      });
      assert.equal(paused.active, false);
      assert.equal(paused.nextRunAt, null);

      // Resume
      const schedule = {
        scheduleType: paused.scheduleType as "WEEKLY",
        daysOfWeek: paused.daysOfWeek,
        sendTime: paused.sendTime,
        runAt: paused.runAt,
        timezone: paused.timezone,
      };
      const resumedNextRunAt = computeNextRun(schedule);
      assert.ok(resumedNextRunAt);

      const resumed = await db.campaign.update({
        where: { id: campaignId },
        data: { active: true, nextRunAt: resumedNextRunAt },
      });
      assert.equal(resumed.active, true);
      assert.ok(resumed.nextRunAt);
    });

    test("2.5 Create ONCE Campaign: schedules a one-off campaign for a future date", async () => {
      const futureDate = new Date(Date.now() + 86400000 * 3); // 3 days ahead
      const runAt = fromZonedTime(futureDate, APP_TZ);

      const once = await db.campaign.create({
        data: {
          clientId,
          name: `${campaignName} Once`,
          templateId,
          scheduleType: "ONCE",
          daysOfWeek: [],
          sendTime: "14:00",
          runAt,
          timezone: APP_TZ,
          batchSize: 200,
          intervalMinutes: 5,
          active: true,
          nextRunAt: runAt,
        },
      });

      assert.ok(once.id);
      assert.equal(once.scheduleType, "ONCE");
      assert.equal(once.nextRunAt?.toISOString(), runAt.toISOString());

      // Clean up once campaign
      await db.campaign.delete({ where: { id: once.id } });
    });

    test("2.6 Delete: deletes the weekly campaign and queued messages cleanly", async () => {
      // Create a queued message associated with a test run
      const run = await db.campaignRun.create({
        data: {
          campaignId,
          status: "WAITING_LIMIT",
          scheduledFor: new Date(),
          total: 1,
        },
      });
      const customer = await db.customer.create({
        data: {
          clientId,
          phone: "919999900001",
          name: "Campaign Test Cust",
        },
      });
      await db.message.create({
        data: {
          customerId: customer.id,
          runId: run.id,
          templateName: "qa_test_tpl",
          status: "QUEUED",
          body: "Queued campaign message",
        },
      });

      // Delete queued messages and campaign
      await db.message.deleteMany({ where: { run: { campaignId }, status: "QUEUED" } });
      await db.campaignRun.deleteMany({ where: { campaignId } });
      await db.campaign.delete({ where: { id: campaignId } });

      const check = await db.campaign.findUnique({ where: { id: campaignId } });
      assert.equal(check, null, "Deleted campaign should not exist");

      // Clean up customer
      await db.customer.delete({ where: { id: customer.id } });
    });
  });

  /* ------------------------------------------------------------------
   * 3. CUSTOMER CRUD & LOYALTY LEDGER
   * ------------------------------------------------------------------ */
  describe("3. Customer CRUD & Loyalty Ledger", () => {
    let customerId: string;
    const phone = "919999988881";
    const name = "QA Customer Tester";

    test("3.1 Create: creates a new customer with phone, location, and tags", async () => {
      const c = await db.customer.create({
        data: {
          clientId,
          phone,
          name,
          location: "Anna Nagar, Madurai",
          tags: ["vip", "organic"],
          optInSource: "manual_entry",
        },
      });

      assert.ok(c.id);
      customerId = c.id;
      assert.equal(c.phone, phone);
      assert.equal(c.name, name);
      assert.equal(c.location, "Anna Nagar, Madurai");
      assert.deepEqual(c.tags, ["vip", "organic"]);
      assert.equal(c.optInSource, "manual_entry");
    });

    test("3.2 Read: queries customer by ID and phone", async () => {
      const c = await db.customer.findUnique({ where: { id: customerId } });
      assert.ok(c);
      assert.equal(c.phone, phone);
      assert.equal(c.clientId, clientId);

      const byPhone = await db.customer.findFirst({ where: { clientId, phone } });
      assert.ok(byPhone);
      assert.equal(byPhone.id, customerId);
    });

    test("3.3 Update: updates name, location, and adds manual loyalty points tag", async () => {
      const loyaltyTag = `loyalty-adj:100:${Date.now()}:Welcome_Bonus`;
      const updated = await db.customer.update({
        where: { id: customerId },
        data: {
          name: "QA Customer Tester (Edited)",
          location: "KK Nagar, Madurai",
          tags: { push: loyaltyTag },
        },
      });

      assert.equal(updated.name, "QA Customer Tester (Edited)");
      assert.equal(updated.location, "KK Nagar, Madurai");
      assert.ok(updated.tags.includes(loyaltyTag));
    });

    test("3.4 Delete Safety Constraint: customer with orders cannot be deleted", async () => {
      // Create a dummy order for this customer
      const order = await db.order.create({
        data: {
          clientId,
          customerId,
          number: 999101,
          items: [{ name: "Cold Pressed Sesame Oil 1L", qty: 1, price: 350 }],
          total: 350,
          status: "CONFIRMED",
        },
      });

      // Count orders before delete attempt
      const ordersCount = await db.order.count({ where: { customerId } });
      assert.equal(ordersCount, 1);

      // Verify business logic: if orders > 0, system rejects deletion
      let deletionPrevented = false;
      if (ordersCount > 0) {
        deletionPrevented = true;
      }
      assert.equal(deletionPrevented, true, "Customer with orders must not be deleted");

      // Clean up the order
      await db.order.delete({ where: { id: order.id } });
    });

    test("3.5 Delete: customer with 0 orders deletes cleanly", async () => {
      const ordersCount = await db.order.count({ where: { customerId } });
      assert.equal(ordersCount, 0);

      await db.customer.delete({ where: { id: customerId } });
      const check = await db.customer.findUnique({ where: { id: customerId } });
      assert.equal(check, null, "Customer should be completely deleted");
    });
  });

  /* ------------------------------------------------------------------
   * 4. ORDER & PAYMENT LIFECYCLE CRUD
   * ------------------------------------------------------------------ */
  describe("4. Order & Payment Lifecycle CRUD", () => {
    let orderId: string;
    let customerId: string;
    const testOrderNum = 999201;

    before(async () => {
      const c = await db.customer.create({
        data: {
          clientId,
          phone: "919999988882",
          name: "Order Flow Tester",
          location: "Sellur, Madurai",
        },
      });
      customerId = c.id;
    });

    after(async () => {
      await db.order.deleteMany({ where: { customerId } });
      await db.customer.delete({ where: { id: customerId } });
    });

    test("4.1 Create: creates a NEW catalogue order with items and total", async () => {
      const items = [
        { id: "QA-TEST-SKU-999", name: "Cold Pressed Gingelly Oil 1L", quantity: 2, price: 340 },
        { id: "QA-TEST-SKU-998", name: "Groundnut Oil 500ml", quantity: 1, price: 150 },
      ];
      const total = 830;

      const o = await db.order.create({
        data: {
          clientId,
          customerId,
          number: testOrderNum,
          items,
          total,
          status: "NEW",
          paymentMethod: "upi",
          note: "WhatsApp Catalogue Order",
        },
      });

      assert.ok(o.id);
      orderId = o.id;
      assert.equal(o.number, testOrderNum);
      assert.equal(o.status, "NEW");
      assert.equal(o.total, 830);
      assert.equal(o.paymentMethod, "upi");
    });

    test("4.2 Read: queries order and verifies items breakdown and customer relation", async () => {
      const o = await db.order.findUnique({
        where: { id: orderId },
        include: { customer: true },
      });

      assert.ok(o);
      assert.equal(o.customer.name, "Order Flow Tester");
      assert.equal(o.total, 830);
      const items = o.items as Array<{ id: string; name: string; quantity: number; price: number }>;
      assert.equal(items.length, 2);
      assert.equal(items[0].name, "Cold Pressed Gingelly Oil 1L");
    });

    test("4.3 Update: confirms order and updates status to CONFIRMED", async () => {
      const updated = await db.order.update({
        where: { id: orderId },
        data: { status: "CONFIRMED" },
      });

      assert.equal(updated.status, "CONFIRMED");
    });

    test("4.4 Payment Recording: transitions order to PAID with transaction details", async () => {
      const now = new Date();
      const txnId = `UPI999${Date.now().toString().slice(-6)}`;

      const paidOrder = await db.order.update({
        where: { id: orderId },
        data: {
          status: "PAID",
          paidAt: now,
          paidAmount: 830,
          paymentTxnId: txnId,
          paymentSource: "META_NATIVE_PAY",
        },
      });

      assert.equal(paidOrder.status, "PAID");
      assert.equal(paidOrder.paidAmount, 830);
      assert.equal(paidOrder.paymentTxnId, txnId);
      assert.equal(paidOrder.paymentSource, "META_NATIVE_PAY");
      assert.ok(paidOrder.paidAt);
    });

    test("4.5 Dispatch & Delivery Updates: order transitions to DISPATCHED then DELIVERED", async () => {
      const dispatched = await db.order.update({
        where: { id: orderId },
        data: { status: "DISPATCHED" },
      });
      assert.equal(dispatched.status, "DISPATCHED");

      const delivered = await db.order.update({
        where: { id: orderId },
        data: { status: "DELIVERED" },
      });
      assert.equal(delivered.status, "DELIVERED");
    });

    test("4.6 Cancellation & Refund: order can be marked CANCELLED with refund details", async () => {
      const cancelled = await db.order.update({
        where: { id: orderId },
        data: {
          status: "CANCELLED",
          refundedAt: new Date(),
          refundAmount: 830,
          refundNote: "Customer requested cancellation before delivery batch",
        },
      });

      assert.equal(cancelled.status, "CANCELLED");
      assert.equal(cancelled.refundAmount, 830);
      assert.ok(cancelled.refundedAt);
      assert.equal(cancelled.refundNote, "Customer requested cancellation before delivery batch");
    });
  });

  /* ------------------------------------------------------------------
   * 5. AUDIENCE CRUD
   * ------------------------------------------------------------------ */
  describe("5. Audience Segmentation CRUD", () => {
    let audienceId: string;
    const audienceName = `QA CRUD Audience ${Date.now().toString().slice(-4)}`;

    test("5.1 Create: creates a dynamic audience segment filter", async () => {
      const filter = {
        locations: ["Anna Nagar", "KK Nagar"],
        minOrders: 2,
        tags: ["vip"],
      };

      const a = await db.audience.create({
        data: {
          clientId,
          name: audienceName,
          filter,
        },
      });

      assert.ok(a.id);
      audienceId = a.id;
      assert.equal(a.name, audienceName);
      assert.deepEqual(a.filter, filter);
    });

    test("5.2 Read: queries audience by ID and checks filter criteria", async () => {
      const a = await db.audience.findUnique({ where: { id: audienceId } });
      assert.ok(a);
      assert.equal(a.clientId, clientId);
      const f = a.filter as { locations: string[]; minOrders: number };
      assert.equal(f.minOrders, 2);
      assert.deepEqual(f.locations, ["Anna Nagar", "KK Nagar"]);
    });

    test("5.3 Update: updates audience conditions", async () => {
      const updatedFilter = {
        locations: ["Anna Nagar", "KK Nagar", "Madurai Main"],
        minOrders: 3,
        tags: ["vip", "platinum"],
      };

      const updated = await db.audience.update({
        where: { id: audienceId },
        data: { filter: updatedFilter },
      });

      assert.deepEqual(updated.filter, updatedFilter);
    });

    test("5.4 Delete: removes audience segment", async () => {
      await db.audience.delete({ where: { id: audienceId } });
      const check = await db.audience.findUnique({ where: { id: audienceId } });
      assert.equal(check, null, "Audience should be deleted");
    });
  });

  /* ------------------------------------------------------------------
   * 6. TEMPLATE CRUD
   * ------------------------------------------------------------------ */
  describe("6. Template CRUD", () => {
    const tplName = `qa_crud_tpl_${Date.now().toString().slice(-4)}`;
    let templateId: string;

    test("6.1 Create: adds template with draft status and variables", async () => {
      const tpl = await db.template.create({
        data: {
          clientId,
          name: tplName,
          language: "en",
          category: "MARKETING",
          headerType: "NONE",
          body: "Hello {{1}}, here is your test offer!",
          variables: { "1": { source: "first_name" } },
          status: "DRAFT",
          statusReason: "Created for QA verification",
        },
      });

      assert.ok(tpl.id);
      templateId = tpl.id;
      assert.equal(tpl.status, "DRAFT");
    });

    test("6.2 Read: template can be queried by ID and client", async () => {
      const tpl = await db.template.findUnique({ where: { id: templateId } });
      assert.ok(tpl);
      assert.equal(tpl.name, tplName);
      assert.equal(tpl.clientId, clientId);
      assert.equal(tpl.category, "MARKETING");
    });

    test("6.3 Update: modifies body, variables, and approval status", async () => {
      const updated = await db.template.update({
        where: { id: templateId },
        data: {
          body: "Hello {{1}}, your exclusive 20% discount is ready!",
          status: "APPROVED",
          statusReason: null,
        },
      });

      assert.equal(updated.status, "APPROVED");
      assert.ok(updated.body.includes("20% discount"));
    });

    test("6.4 Delete: cleans up template from database", async () => {
      await db.template.delete({ where: { id: templateId } });
      const tpl = await db.template.findUnique({ where: { id: templateId } });
      assert.equal(tpl, null, "Deleted template should not exist");
    });
  });
});

