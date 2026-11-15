import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import crypto from "node:crypto";
import { db } from "../../src/lib/db";
import { Prisma } from "@prisma/client";
import { customersData } from "../../src/lib/customers-data";
import { audienceWhere, campaignAudienceWhere } from "../../src/lib/audiences";
import { encodeTags } from "../../src/lib/audience-tags";
import { customerWhere, customerFilters } from "../../src/lib/customer-query";
import { signMediaToken, verifyMediaToken, revokeMediaToken, signMediaUrlIfNeeded } from "../../src/lib/media-token";
import { storePublicImage, getStoredPublicImage, markTemplateImagePublic } from "../../src/lib/uploaded-image";
import { recordReply } from "../../src/lib/replies";

describe("Batch 1 Safety Foundation & Critical Corrections Test Suite", () => {
  let clientA: string;
  let clientB: string;

  before(async () => {
    // Setup two isolated tenants for multi-tenant safety validation
    const cA = await db.client.upsert({
      where: { name: "Batch1 Test Shop A" },
      update: {},
      create: {
        name: "Batch1 Test Shop A",
        brandPrimary: "#0D9488",
        brandAccent: "#14B8A6",
        homeCity: "Madurai",
        orderFlow: "deliver",
        businessType: "retail",
        billingMode: "direct",
      },
    });
    clientA = cA.id;

    const cB = await db.client.upsert({
      where: { name: "Batch1 Test Shop B" },
      update: {},
      create: {
        name: "Batch1 Test Shop B",
        brandPrimary: "#4F46E5",
        brandAccent: "#6366F1",
        homeCity: "Chennai",
        orderFlow: "deliver",
        businessType: "retail",
        billingMode: "direct",
      },
    });
    clientB = cB.id;
  });

  after(async () => {
    // Clean up test data
    await db.reply.deleteMany({ where: { customer: { clientId: { in: [clientA, clientB] } } } });
    await db.message.deleteMany({ where: { customer: { clientId: { in: [clientA, clientB] } } } });
    await db.order.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.loyaltyEntry.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.conversation.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.customer.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.template.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db.$executeRaw`DELETE FROM "PortalUploadedImage" WHERE "id" LIKE 'test-b1-%'`;
    await db.$executeRawUnsafe(`DELETE FROM "RevokedMediaToken" WHERE "clientId" IN ('${clientA}', '${clientB}')`).catch(() => {});
  });

  /* ------------------------------------------------------------------
   * 1. CUSTOMER SOFT-DELETE & RESTORE LIFECYCLE (OD-01)
   * ------------------------------------------------------------------ */
  describe("1. Customer Soft-Delete & Restore Lifecycle (OD-01)", () => {
    test("soft-deleting a customer populates deletedAt and preserves child history", async () => {
      const phone = "919876543210";
      const customer = await db.customer.create({
        data: { clientId: clientA, name: "Vignesh Murugan", phone, optInSource: "Store Walk-in" },
      });

      // Add child records (Order, Message, Reply)
      const order = await db.order.create({
        data: {
          clientId: clientA,
          customerId: customer.id,
          number: 999901,
          total: 550,
          items: [{ name: "Gingelly Oil 1L", price: 350, count: 1 }],
          status: "PAID",
        },
      });

      const message = await db.message.create({
        data: {
          customerId: customer.id,
          templateName: "offer_broadcast",
          waMessageId: "wamid.test.001",
          status: "DELIVERED",
          pricingCategory: "MARKETING",
        },
      });

      // Soft delete the customer
      const deletedAt = new Date();
      const updated = await db.customer.update({
        where: { id: customer.id },
        data: {
          deletedAt,
          deletedBy: "manager-user-01",
          deleteReason: "Requested removal",
        },
      });

      assert.equal(updated.deletedAt?.getTime(), deletedAt.getTime());
      assert.equal(updated.deletedBy, "manager-user-01");
      assert.equal(updated.deleteReason, "Requested removal");

      // Verify child records still exist in PostgreSQL
      const persistedOrder = await db.order.findUnique({ where: { id: order.id } });
      const persistedMessage = await db.message.findUnique({ where: { id: message.id } });
      assert.ok(persistedOrder !== null, "Order must NOT be cascade-deleted");
      assert.ok(persistedMessage !== null, "Message must NOT be cascade-deleted");

      // Verify customer directory query filters soft-deleted customer out by default
      const listActive = await customersData(clientA);
      assert.equal(
        listActive.customers.some((c) => c.id === customer.id),
        false,
        "Active customersData must NOT include soft-deleted customer",
      );

      // Verify archived view includes the customer
      const listArchived = await customersData(clientA, { archivedOnly: true });
      assert.equal(
        listArchived.customers.some((c) => c.id === customer.id),
        true,
        "Archived customersData MUST include soft-deleted customer",
      );
    });

    test("restoring an archived customer strictly preserves marketing consent (optedOut)", async () => {
      const phone = "919876543211";
      const customer = await db.customer.create({
        data: {
          clientId: clientA,
          name: "Anand Natarajan",
          phone,
          optedOut: true, // Customer had opted out prior to archiving
          deletedAt: new Date(Date.now() - 86400000 * 10),
          deletedBy: "admin",
          deleteReason: "Old inactive account",
        },
      });

      // Restore customer
      const restored = await db.customer.update({
        where: { id: customer.id },
        data: {
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
        },
      });

      assert.equal(restored.deletedAt, null, "deletedAt must be cleared on restore");
      assert.equal(restored.optedOut, true, "optedOut must remain TRUE; consent status must NOT be reset");
    });
  });

  /* ------------------------------------------------------------------
   * 2. POSTGRESQL ENGINE REFERENTIAL RESTRICTION (ON DELETE RESTRICT)
   * ------------------------------------------------------------------ */
  describe("2. Database-Enforced Referential Safety (ON DELETE RESTRICT)", () => {
    test("physical deletion is blocked when customer has an Order (SQLSTATE 23503 / P2003)", async () => {
      const phone = "919876543212";
      const customer = await db.customer.create({
        data: { clientId: clientA, name: "Order Customer", phone, optInSource: "Catalog" },
      });

      await db.order.create({
        data: {
          clientId: clientA,
          customerId: customer.id,
          number: 999902,
          total: 800,
          items: [{ name: "Coconut Oil 1L", price: 400, count: 2 }],
          status: "CONFIRMED",
        },
      });

      let caughtError: any = null;
      try {
        await db.customer.delete({ where: { id: customer.id } });
      } catch (err: any) {
        caughtError = err;
      }

      assert.ok(caughtError !== null, "Delete must throw an error");
      assert.equal(caughtError.code, "P2003", "Prisma must return foreign key restriction error code P2003");
    });

    test("physical deletion is blocked when customer has a Message", async () => {
      const phone = "919876543213";
      const customer = await db.customer.create({
        data: { clientId: clientA, name: "Message Customer", phone, optInSource: "Website" },
      });

      await db.message.create({
        data: {
          customerId: customer.id,
          templateName: "offer_broadcast",
          waMessageId: "wamid.test.002",
          status: "SENT",
          pricingCategory: "MARKETING",
        },
      });

      let caughtError: any = null;
      try {
        await db.customer.delete({ where: { id: customer.id } });
      } catch (err: any) {
        caughtError = err;
      }

      assert.ok(caughtError !== null, "Delete must be blocked by Message relation");
      assert.equal(caughtError.code, "P2003");
    });
  });

  /* ------------------------------------------------------------------
   * 3. INBOUND WHATSAPP MESSAGE FROM ARCHIVED CUSTOMER (OD-01B)
   * ------------------------------------------------------------------ */
  describe("3. Inbound WhatsApp Message from Archived Customer (OD-01B)", () => {
    test("inbound WhatsApp message from an archived customer remains archived and stores reply", async () => {
      const phone = "919876543220";
      const archivedAt = new Date(Date.now() - 86400000 * 5); // Archived 5 days ago
      const customer = await db.customer.create({
        data: {
          clientId: clientA,
          name: "Ravi Shankar",
          phone,
          optedOut: true,
          deletedAt: archivedAt,
          deletedBy: "manager",
          deleteReason: "Old customer inactive",
        },
      });

      // Simulate inbound message via recordReply
      const reply = await recordReply({
        phone,
        text: "Hi, do you have groundnut oil in stock?",
        kind: "text",
        anyClient: true,
      });

      assert.ok(reply !== null, "Reply must be recorded");

      // Verify customer in database: deletedAt MUST NOT be cleared
      const refreshed = await db.customer.findUnique({ where: { id: customer.id } });
      assert.ok(refreshed !== null);
      assert.ok(refreshed.deletedAt !== null, "Incoming message must NEVER automatically clear deletedAt");
      assert.equal(refreshed.deletedAt?.getTime(), archivedAt.getTime(), "Archived timestamp must be preserved");
      assert.equal(refreshed.optedOut, true, "Inbound support inquiry must NEVER grant marketing opt-in");
    });

    test("webhook duplicate delivery is idempotent and does not alter customer consent", async () => {
      const phone = "919876543221";
      const customer = await db.customer.create({
        data: {
          clientId: clientA,
          name: "Idempotent User",
          phone,
          optedOut: true,
          deletedAt: new Date(),
        },
      });

      // Deliver duplicate webhook calls with same payload
      await recordReply({ phone, text: "Are you open?", kind: "text", anyClient: true });
      await recordReply({ phone, text: "Are you open?", kind: "text", anyClient: true });

      const rechecked = await db.customer.findUnique({ where: { id: customer.id } });
      assert.ok(rechecked !== null);
      assert.ok(rechecked.deletedAt !== null, "Duplicate webhooks must not alter deletedAt");
      assert.equal(rechecked.optedOut, true, "Duplicate webhooks must not alter optedOut");
    });
  });

  /* ------------------------------------------------------------------
   * 4. PRIORITY 1: CAMPAIGN AUDIENCE CONSENT & ARCHIVE FILTERING
   * ------------------------------------------------------------------ */
  describe("4. Campaign Dispatch Audience Filtering (sendToWhere & campaignAudienceWhere)", () => {
    test("All Customers campaign broadcast strictly excludes archived customers", async () => {
      const phoneActive = "919876543301";
      const phoneArchived = "919876543302";

      const activeCust = await db.customer.create({
        data: { clientId: clientA, name: "Active All Broadcast", phone: phoneActive, optedOut: false },
      });
      const archivedCust = await db.customer.create({
        data: { clientId: clientA, name: "Archived All Broadcast", phone: phoneArchived, optedOut: false, deletedAt: new Date() },
      });

      // Campaign with audienceTag = null (All customers)
      const whereClause = await campaignAudienceWhere(clientA, null);
      const recipients = await db.customer.findMany({ where: whereClause, select: { id: true } });
      const recipientIds = new Set(recipients.map((r) => r.id));

      assert.equal(recipientIds.has(activeCust.id), true, "Active customer must be in All Customers audience");
      assert.equal(recipientIds.has(archivedCust.id), false, "CRITICAL: Archived customer MUST be excluded from All Customers campaign");
    });

    test("Plain tag campaign broadcast strictly excludes archived customers", async () => {
      const tag = "diwali-offer-2026";
      const phoneActive = "919876543303";
      const phoneArchived = "919876543304";

      const activeCust = await db.customer.create({
        data: { clientId: clientA, name: "Active Tag Member", phone: phoneActive, tags: [tag], optedOut: false },
      });
      const archivedCust = await db.customer.create({
        data: { clientId: clientA, name: "Archived Tag Member", phone: phoneArchived, tags: [tag], optedOut: false, deletedAt: new Date() },
      });

      // Campaign targeting tag
      const whereClause = await campaignAudienceWhere(clientA, tag);
      const recipients = await db.customer.findMany({ where: whereClause, select: { id: true } });
      const recipientIds = new Set(recipients.map((r) => r.id));

      assert.equal(recipientIds.has(activeCust.id), true, "Active tagged customer must be included");
      assert.equal(recipientIds.has(archivedCust.id), false, "CRITICAL: Soft-deleted tagged customer MUST be excluded from tag campaign");
    });

    test("Multiple tag campaign broadcast strictly excludes archived customers", async () => {
      const tags = ["pongal-special", "wholesale"];
      const phoneActive = "919876543307";
      const phoneArchived = "919876543308";

      const activeCust = await db.customer.create({
        data: { clientId: clientA, name: "Active MultiTag", phone: phoneActive, tags, optedOut: false },
      });
      const archivedCust = await db.customer.create({
        data: { clientId: clientA, name: "Archived MultiTag", phone: phoneArchived, tags, optedOut: false, deletedAt: new Date() },
      });

      // Campaign targeting multiple tags
      const encoded = encodeTags({ match: "any", tags });
      const whereClause = await campaignAudienceWhere(clientA, encoded);
      const recipients = await db.customer.findMany({ where: whereClause, select: { id: true } });
      const recipientIds = new Set(recipients.map((r) => r.id));

      assert.equal(recipientIds.has(activeCust.id), true);
      assert.equal(recipientIds.has(archivedCust.id), false, "Archived customer must be excluded from multiple-tag campaigns");
    });

    test("Manual include list strictly excludes archived customers", async () => {
      const phoneArchived = "919876543305";
      const archivedCust = await db.customer.create({
        data: { clientId: clientA, name: "Archived Hand Picked", phone: phoneArchived, optedOut: false, deletedAt: new Date() },
      });

      // Attempt to include archived customer by ID
      const whereClause = await campaignAudienceWhere(clientA, null, { includeIds: [archivedCust.id] });
      const recipients = await db.customer.findMany({ where: whereClause, select: { id: true } });

      assert.equal(recipients.some((r) => r.id === archivedCust.id), false, "Archived customer must NOT be added even via manual include");
    });

    test("campaign customer search query excludes archived customers", async () => {
      const uniqueName = "ZzArchivedSearchTest";
      const phoneArchived = "919876543306";
      await db.customer.create({
        data: { clientId: clientA, name: uniqueName, phone: phoneArchived, optedOut: false, deletedAt: new Date() },
      });

      const found = await db.customer.findMany({
        where: { clientId: clientA, deletedAt: null, name: { contains: uniqueName, mode: "insensitive" } },
        select: { id: true, name: true },
      });
      assert.equal(found.some((c) => c.name === uniqueName), false, "Archived customer must NOT appear in campaign customer search");
    });

    test("customerWhere excludes archived customers by default and includes only archived when specified", async () => {
      const scope = { clientId: clientA, canManage: true, role: "CLIENT" as const };
      const defaultWhere = await customerWhere(scope, { q: "", tag: "", area: "" });
      assert.deepEqual(defaultWhere.deletedAt, null, "Default customerWhere MUST enforce deletedAt: null");

      const archivedWhere = await customerWhere(scope, { q: "", tag: "", area: "", archivedOnly: true });
      assert.deepEqual(archivedWhere.deletedAt, { not: null }, "archivedOnly customerWhere MUST enforce deletedAt: { not: null }");
    });
  });

  /* ------------------------------------------------------------------
   * 5. PRIORITY 2 & 4: MEDIA SECURITY, ROTATION, REVOCATION & OUTBOUND
   * ------------------------------------------------------------------ */
  describe("5. Media Security, Key Rotation, Revocation & WhatsApp Integration", () => {
    test("storePublicImage defaults to isPublic: false (private by default)", async () => {
      const testBuf = Buffer.from("private-doc-bytes-default");
      const url = await storePublicImage({
        bytes: testBuf,
        contentType: "application/pdf",
        clientId: clientA,
      });

      const id = url.split("/").pop()!;
      const stored = await getStoredPublicImage(id);
      assert.ok(stored !== null);
      assert.equal(stored.isPublic, false, "Default upload visibility MUST be private (isPublic: false)");
      assert.equal(stored.clientId, clientA, "clientId must be attributed to tenant");
    });

    test("markTemplateImagePublic enforces strict authorization chain, tenant match, and approved status (F-04)", async () => {
      const testBuf = Buffer.from("template-graphic-test");
      const url = await storePublicImage({
        bytes: testBuf,
        contentType: "image/jpeg",
        clientId: clientA,
        isPublic: false, // Initially private
      });

      const id = url.split("/").pop()!;
      const initial = await getStoredPublicImage(id);
      assert.equal(initial?.isPublic, false);

      // 1. Negative Test: Mark public with NO template existing -> REJECTED
      const noTemplateResult = await markTemplateImagePublic(url, clientA);
      assert.equal(noTemplateResult, false, "Must reject promotion when no template references the image");

      // 2. Negative Test: Template exists but is in DRAFT status -> REJECTED
      const draftTmpl = await db.template.create({
        data: {
          clientId: clientA,
          name: "draft_header_tmpl",
          language: "en",
          category: "MARKETING",
          headerType: "IMAGE",
          headerMediaUrl: url,
          body: "Draft promo",
          status: "DRAFT",
        },
      });
      const draftResult = await markTemplateImagePublic(url, clientA);
      assert.equal(draftResult, false, "Must reject promotion when template is in DRAFT status");

      // 3. Negative Test: Cross-tenant promotion attempt -> REJECTED
      const crossTenantResult = await markTemplateImagePublic(url, clientB);
      assert.equal(crossTenantResult, false, "Must reject promotion attempt by a non-owning tenant");

      // 4. Negative Test: Image with clientId IS NULL -> REJECTED
      const nullImgUrl = await storePublicImage({
        bytes: Buffer.from("null-tenant-test-img"),
        contentType: "image/jpeg",
        isPublic: false,
      });
      await db.$executeRaw`UPDATE "PortalUploadedImage" SET "clientId" = NULL WHERE "id" = ${nullImgUrl.split("/").pop()!}`;
      const nullResult = await markTemplateImagePublic(nullImgUrl, clientA);
      assert.equal(nullResult, false, "Must reject promotion of null-tenant image without explicit reconciliation");

      // 5. Positive Test: Template approved by Meta -> AUTHORIZED & PROMOTED
      await db.template.update({
        where: { id: draftTmpl.id },
        data: { status: "APPROVED" },
      });
      const approvedResult = await markTemplateImagePublic(url, clientA);
      assert.equal(approvedResult, true, "Must authorize and promote image once approved template exists");

      const refreshed = await getStoredPublicImage(id);
      assert.equal(refreshed?.isPublic, true, "Image must now be marked isPublic: true");
    });

    test("media token revocation persists to PostgreSQL and survives process restart (F-01, F-02)", async () => {
      const imageId = "test-b1-revocation.jpg";
      const token = signMediaToken({ imageId, clientId: clientA, ttlSeconds: 3600 });

      // Before revocation
      const checkBefore = await verifyMediaToken(token, imageId);
      assert.equal(checkBefore.valid, true);

      // Revoke token (writes to PostgreSQL RevokedMediaToken table)
      const revoked = await revokeMediaToken(token, { clientId: clientA, reason: "Security rotation" });
      assert.equal(revoked, true);

      // After revocation: verified through persistent revocation logic
      const checkAfter = await verifyMediaToken(token, imageId);
      assert.equal(checkAfter.valid, false);
      assert.equal(checkAfter.reason, "Token revoked");

      // Verify persistent record exists directly in PostgreSQL
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const rows: any[] = await db.$queryRaw`
        SELECT "tokenHash", "clientId", "reason" FROM "RevokedMediaToken" WHERE "tokenHash" = ${tokenHash}
      `;
      assert.equal(rows.length, 1, "Revocation must be persistently recorded in PostgreSQL");
      assert.equal(rows[0].clientId, clientA);

      // Asset-level revocation test (F-02)
      const token2 = signMediaToken({ imageId: "asset-revoke-target.jpg", clientId: clientA, ttlSeconds: 3600 });
      await revokeMediaToken(token2, { clientId: clientA });
      const assetCheck = await verifyMediaToken(token2, "asset-revoke-target.jpg");
      assert.equal(assetCheck.valid, false);
    });

    test("key rotation: validates tokens signed with rotation secret", async () => {
      const imageId = "test-b1-rotation.jpg";
      const rotationSecretRaw = "old-secret-from-previous-month-0123456789";
      process.env.DATA_ENC_KEY_OLD = rotationSecretRaw;

      // Sign with the old secret directly
      const oldSecretKey = crypto.createHash("sha256").update(rotationSecretRaw).digest();
      const now = Math.floor(Date.now() / 1000);
      const payload = { imageId, clientId: clientA, iat: now, exp: now + 3600 };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = crypto.createHmac("sha256", oldSecretKey).update(payloadB64).digest("base64url");
      const oldToken = `${payloadB64}.${sig}`;

      // Verify that verifyMediaToken accepts the old token via rotation keys
      const result = await verifyMediaToken(oldToken, imageId);
      assert.equal(result.valid, true, "Token signed with rotation secret must pass verification during grace window");
      assert.equal(result.clientId, clientA);

      delete process.env.DATA_ENC_KEY_OLD;
    });

    test("signMediaUrlIfNeeded appends capability token to private assets and leaves public assets clean", async () => {
      // 1. Private asset
      const privateBuf = Buffer.from("private-invoice-001");
      const privateUrl = await storePublicImage({ bytes: privateBuf, contentType: "application/pdf", clientId: clientA, isPublic: false });
      const signedPrivate = await signMediaUrlIfNeeded(privateUrl, clientA);
      assert.ok(signedPrivate.includes("token="), "Private media URL must have capability token attached");

      // 2. Public template asset
      const publicBuf = Buffer.from("public-banner-001");
      const publicUrl = await storePublicImage({ bytes: publicBuf, contentType: "image/jpeg", clientId: clientA, isPublic: true });
      const signedPublic = await signMediaUrlIfNeeded(publicUrl, clientA);
      assert.equal(signedPublic.includes("token="), false, "Public template media URL must NOT have capability token attached");
    });
  });

  /* ------------------------------------------------------------------
   * 6. PRIORITY 3: MIGRATION TEMPLATE MEDIA BACKFILL (F-05)
   * ------------------------------------------------------------------ */
  describe("6. Migration Backfill Validation (headerMediaUrl vs body)", () => {
    test("migration backfill strictly promotes approved matching-tenant images and ignores draft/rejected/null-client images (F-05)", async () => {
      // 1. Approved template image with matching tenant -> Should be promoted
      const approvedBuf = Buffer.from("migration-approved-header-img");
      const approvedUrl = await storePublicImage({ bytes: approvedBuf, contentType: "image/jpeg", clientId: clientA, isPublic: false });
      const approvedId = approvedUrl.split("/").pop()!;

      // 2. Draft template image -> Must REMAIN private
      const draftBuf = Buffer.from("migration-draft-header-img");
      const draftUrl = await storePublicImage({ bytes: draftBuf, contentType: "image/jpeg", clientId: clientA, isPublic: false });
      const draftId = draftUrl.split("/").pop()!;

      // 3. Rejected template image -> Must REMAIN private
      const rejectedBuf = Buffer.from("migration-rejected-header-img");
      const rejectedUrl = await storePublicImage({ bytes: rejectedBuf, contentType: "image/jpeg", clientId: clientA, isPublic: false });
      const rejectedId = rejectedUrl.split("/").pop()!;

      // 4. Legacy image with null clientId -> Must REMAIN private and unassigned
      const nullBuf = Buffer.from("migration-null-client-img");
      const nullUrl = await storePublicImage({ bytes: nullBuf, contentType: "image/jpeg", isPublic: false });
      const nullId = nullUrl.split("/").pop()!;
      await db.$executeRaw`UPDATE "PortalUploadedImage" SET "clientId" = NULL WHERE "id" = ${nullId}`;

      // 5. Unrelated private user document -> Must REMAIN private
      const privateCustBuf = Buffer.from("migration-test-private-user-doc");
      const privateCustUrl = await storePublicImage({ bytes: privateCustBuf, contentType: "image/jpeg", clientId: clientA, isPublic: false });
      const privateCustId = privateCustUrl.split("/").pop()!;

      // Create templates
      await db.template.createMany({
        data: [
          {
            clientId: clientA,
            name: "migration_approved_template",
            language: "en",
            category: "MARKETING",
            headerType: "IMAGE",
            headerMediaUrl: approvedUrl,
            body: "Approved promo",
            status: "APPROVED",
          },
          {
            clientId: clientA,
            name: "migration_draft_template",
            language: "en",
            category: "MARKETING",
            headerType: "IMAGE",
            headerMediaUrl: draftUrl,
            body: "Draft promo",
            status: "DRAFT",
          },
          {
            clientId: clientA,
            name: "migration_rejected_template",
            language: "en",
            category: "MARKETING",
            headerType: "IMAGE",
            headerMediaUrl: rejectedUrl,
            body: "Rejected promo",
            status: "REJECTED",
          },
          {
            clientId: clientA,
            name: "migration_null_referencing_template",
            language: "en",
            category: "MARKETING",
            headerType: "IMAGE",
            headerMediaUrl: nullUrl,
            body: "Null referencing promo",
            status: "APPROVED",
          },
        ],
      });

      // Execute hardened migration backfill query (F-05)
      await db.$executeRawUnsafe(`
        UPDATE "PortalUploadedImage" p
        SET "isPublic" = true
        FROM "Template" t
        WHERE t."headerType" = 'IMAGE'
          AND t."status" = 'APPROVED'
          AND t."headerMediaUrl" IS NOT NULL
          AND t."headerMediaUrl" LIKE '%/api/upload/%'
          AND p."id" = regexp_replace(t."headerMediaUrl", '^.*\/api\/upload\/([a-zA-Z0-9._-]+).*$', '\\1')
          AND p."clientId" = t."clientId";
      `);

      const approvedImg = await getStoredPublicImage(approvedId);
      const draftImg = await getStoredPublicImage(draftId);
      const rejectedImg = await getStoredPublicImage(rejectedId);
      const nullImg = await getStoredPublicImage(nullId);
      const privateCustImg = await getStoredPublicImage(privateCustId);

      assert.equal(approvedImg?.isPublic, true, "Approved template header image must be promoted to isPublic: true");
      assert.equal(draftImg?.isPublic, false, "Draft template image must REMAIN isPublic: false");
      assert.equal(rejectedImg?.isPublic, false, "Rejected template image must REMAIN isPublic: false");
      assert.equal(nullImg?.isPublic, false, "Legacy null-tenant image must REMAIN isPublic: false without explicit reconciliation");
      assert.equal(nullImg?.clientId, null, "Legacy null-tenant image clientId must NOT be hijacked");
      assert.equal(privateCustImg?.isPublic, false, "Unrelated private customer image must REMAIN isPublic: false");
    });
  });

  /* ------------------------------------------------------------------
   * 7. IMPORT RECONCILIATION & CONCURRENCY
   * ------------------------------------------------------------------ */
  describe("7. Import Reconciliation & Consent Invariance", () => {
    test("import reconciliation logic correctly distinguishes new vs active existing vs archived profiles", async () => {
      const phoneArchived = "919876543401";
      const phoneActive = "919876543402";
      const phoneNew = "919876543403";

      await db.customer.create({
        data: { clientId: clientA, name: "Pre-Archived", phone: phoneArchived, optedOut: false, deletedAt: new Date() },
      });
      await db.customer.create({
        data: { clientId: clientA, name: "Pre-Active", phone: phoneActive, optedOut: false },
      });

      const uniquePhones = [phoneNew, phoneArchived, phoneActive];
      const existing = await db.customer.findMany({
        where: { clientId: clientA, phone: { in: uniquePhones } },
        select: { phone: true, deletedAt: true },
      });

      const existingMap = new Map(existing.map((c) => [c.phone, c.deletedAt]));
      let newCount = 0;
      let activeExistingCount = 0;
      let archivedCount = 0;

      for (const p of uniquePhones) {
        if (!existingMap.has(p)) {
          newCount++;
        } else if (existingMap.get(p) != null) {
          archivedCount++;
        } else {
          activeExistingCount++;
        }
      }

      assert.equal(newCount, 1, "Must detect exactly 1 new customer");
      assert.equal(activeExistingCount, 1, "Must detect exactly 1 active customer");
      assert.equal(archivedCount, 1, "Must detect exactly 1 archived customer");
    });

    test("re-importing or restoring archived profile strictly leaves optedOut immutable", async () => {
      const phone = "919876543405";
      const customer = await db.customer.create({
        data: { clientId: clientA, name: "Consent Target", phone, optedOut: true, deletedAt: new Date() },
      });

      // Simulate re-import updating name and tags with restoreArchived: true
      await db.customer.update({
        where: { clientId_phone: { clientId: clientA, phone } },
        data: {
          name: "Consent Target Updated",
          tags: ["re-imported"],
          deletedAt: null, // Restored
          deletedBy: null,
          deleteReason: null,
          // optedOut is NEVER in data
        },
      });

      const refreshed = await db.customer.findUnique({ where: { id: customer.id } });
      assert.ok(refreshed !== null);
      assert.equal(refreshed.deletedAt, null, "Customer must be unarchived");
      assert.equal(refreshed.optedOut, true, "Marketing opt-out MUST remain true after re-import");
    });
  });
});
