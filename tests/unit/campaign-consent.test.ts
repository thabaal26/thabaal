import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { validateCampaignPreflight } from "../../src/lib/campaign-preflight";
import { campaignAudienceWhere } from "../../src/lib/audiences";
import { processRun, startRun } from "../../src/lib/dispatcher";

describe("Campaign Customer Consent & Launch Safety Gate", () => {
  let clientAId: string;
  let clientBId: string;
  let marketingTemplateId: string;
  let utilityTemplateId: string;
  let senderNumberId: string;

  let customerValidConsentId: string;
  let customerMissingConsentId: string;
  let customerOptedOutId: string;
  let customerUnreachableId: string;
  let customerDuplicatePhoneId: string;
  let customerTenantBId: string;
  const realFetch = globalThis.fetch;

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      return new Response(JSON.stringify({ messages: [{ id: `wamid.consent_${Date.now()}` }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });

    // 1. Create Tenant A
    const clientA = await db.client.create({
      data: {
        name: `Consent_Test_TenantA_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        waToken: "EAAX_valid_token_tenant_a",
        waPhoneNumberId: "phone_id_tenant_a_123",
        waBusinessAccountId: "waba_id_tenant_a_123",
        quietFrom: null,
        quietTo: null,
        marketingGapHours: 0,
      },
    });
    clientAId = clientA.id;

    // 2. Create Tenant B (for cross-tenant checks)
    const clientB = await db.client.create({
      data: {
        name: `Consent_Test_TenantB_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        waToken: "EAAX_valid_token_tenant_b",
        waPhoneNumberId: "phone_id_tenant_b_456",
        waBusinessAccountId: "waba_id_tenant_b_456",
      },
    });
    clientBId = clientB.id;

    // 3. Sender for Tenant A
    const sender = await db.whatsAppNumber.create({
      data: {
        clientId: clientAId,
        label: "Tenant A Primary",
        phoneNumberId: "phone_id_tenant_a_123",
        businessAccountId: "waba_id_tenant_a_123",
        token: "qa-fake-token",
        isDefault: true,
        displayPhone: "+91 97777 66666",
        qualityRating: "GREEN",
        messagingTier: "TIER_2K",
      },
    });
    senderNumberId = sender.id;

    // 4. Marketing template
    const mkt = await db.template.create({
      data: {
        clientId: clientAId,
        businessAccountId: "waba_id_tenant_a_123",
        name: "consent_marketing_promo",
        category: "MARKETING",
        language: "en_US",
        status: "APPROVED",
        body: "Hello {{1}}, here is our festive offer!",
        variables: { "1": "name" },
      },
    });
    marketingTemplateId = mkt.id;

    // 5. Utility template
    const utl = await db.template.create({
      data: {
        clientId: clientAId,
        businessAccountId: "waba_id_tenant_a_123",
        name: "consent_utility_receipt",
        category: "UTILITY",
        language: "en_US",
        status: "APPROVED",
        body: "Hello {{1}}, your order payment has been confirmed.",
        variables: { "1": "name" },
      },
    });
    utilityTemplateId = utl.id;

    // 6. Customers for Tenant A
    // 6a. Valid positive marketing consent
    const c1 = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Customer Valid Consent",
        phone: "+919811111111",
        optedOut: false,
        unreachable: false,
        optInAt: new Date("2026-11-01T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
        tags: ["festive"],
      },
    });
    customerValidConsentId = c1.id;

    // 6b. Missing consent (optInAt is null, imported spreadsheet row without attributable opt-in)
    const c2 = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Customer Missing Consent",
        phone: "+919822222222",
        optedOut: false,
        unreachable: false,
        optInAt: null,
        optInSource: "Google Sheet 1: SheVest / Finforte (WhatsApp: Yes)",
        tags: ["festive"],
      },
    });
    customerMissingConsentId = c2.id;

    // 6c. Opted out
    const c3 = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Customer Opted Out",
        phone: "+919833333333",
        optedOut: true,
        unreachable: false,
        optInAt: new Date("2026-10-15T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
        tags: ["festive"],
      },
    });
    customerOptedOutId = c3.id;

    // 6d. Unreachable
    const c4 = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Customer Unreachable",
        phone: "+919844444444",
        optedOut: false,
        unreachable: true,
        optInAt: new Date("2026-10-15T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
        tags: ["festive"],
      },
    });
    customerUnreachableId = c4.id;

    // 6e. Duplicate phone number (sharing c1's phone under different name)
    const c5 = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Customer Duplicate Phone",
        phone: "919811111111", // same normalized digits as c1
        optedOut: false,
        unreachable: false,
        optInAt: new Date("2026-11-02T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
        tags: ["festive"],
      },
    });
    customerDuplicatePhoneId = c5.id;

    // 7. Customer for Tenant B (cross-tenant safety check)
    const cB = await db.customer.create({
      data: {
        clientId: clientBId,
        name: "Tenant B Customer",
        phone: "+919899999999",
        optedOut: false,
        unreachable: false,
        optInAt: new Date("2026-11-01T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
        tags: ["festive"],
      },
    });
    customerTenantBId = cB.id;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.message.deleteMany({ where: { customer: { clientId: { in: [clientAId, clientBId] } } } }).catch(() => {});
    await db.campaignRun.deleteMany({ where: { campaign: { clientId: { in: [clientAId, clientBId] } } } }).catch(() => {});
    await db.campaign.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } }).catch(() => {});
    await db.template.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } }).catch(() => {});
    await db.whatsAppNumber.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { in: [clientAId, clientBId] } } }).catch(() => {});
  });

  test("1. Marketing campaign strictly excludes contacts with missing optInAt as consent unverified", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "Consent Marketing Test",
        templateId: marketingTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        sendTime: "11:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: false,
      },
    });

    try {
      const result = await validateCampaignPreflight(campaign.id);
      assert.equal(result.ok, true);
      assert.equal(result.status, "CONDITIONAL_GO", "Must be CONDITIONAL_GO when unverified consent contacts exist");
      assert.equal(result.recipients.totalTenantCustomers, 5);
      assert.equal(result.recipients.excludedConsentUnverified, 1, "Must exclude customer with null optInAt");
      assert.equal(result.recipients.excludedOptOut, 1, "Must exclude opted-out customer");
      assert.equal(result.recipients.excludedUnreachable, 1, "Must exclude unreachable customer");
      assert.equal(result.recipients.excludedDuplicate, 1, "Must deduplicate duplicate phone number");
      assert.equal(result.recipients.eligibleCount, 1, "Only 1 customer has valid consent and unique phone");
      assert.equal(result.recipients.sampleEligible[0].id, customerValidConsentId);
    } finally {
      await db.campaign.deleteMany({ where: { id: campaign.id } }).catch(() => {});
    }
  });

  test("2. Utility campaign allows reachable contacts without requiring marketing optInAt timestamp", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "Consent Utility Test",
        templateId: utilityTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        sendTime: "11:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: false,
      },
    });

    try {
      const result = await validateCampaignPreflight(campaign.id);
      assert.equal(result.ok, true);
      assert.equal(result.template.category, "UTILITY");
      // Utility campaign does not exclude customerMissingConsentId
      assert.equal(result.recipients.excludedConsentUnverified, 0, "Utility template does not require marketing opt-in");
      assert.equal(result.recipients.excludedOptOut, 1, "Opted-out still excluded");
      assert.equal(result.recipients.excludedUnreachable, 1, "Unreachable still excluded");
      assert.equal(result.recipients.excludedDuplicate, 1, "Duplicate still excluded");
      // Both customerValidConsentId and customerMissingConsentId are eligible for utility receipt
      assert.equal(result.recipients.eligibleCount, 2);
    } finally {
      await db.campaign.deleteMany({ where: { id: campaign.id } }).catch(() => {});
    }
  });

  test("3. campaignAudienceWhere with requirePositiveConsent=true strictly enforces positive consent in DB query", async () => {
    const marketingWhere = await campaignAudienceWhere(clientAId, null, {}, { requirePositiveConsent: true });
    const marketingCustomers = await db.customer.findMany({ where: marketingWhere, select: { id: true } });
    const marketingIds = new Set(marketingCustomers.map((c) => c.id));

    assert.ok(marketingIds.has(customerValidConsentId), "Valid consent must be included");
    assert.ok(!marketingIds.has(customerMissingConsentId), "Missing optInAt must NOT be included in marketing query");
    assert.ok(!marketingIds.has(customerOptedOutId), "Opted out must NOT be included");
    assert.ok(!marketingIds.has(customerUnreachableId), "Unreachable must NOT be included");
    assert.ok(!marketingIds.has(customerTenantBId), "Cross-tenant customer must NOT be included");

    const utilityWhere = await campaignAudienceWhere(clientAId, null, {}, { requirePositiveConsent: false });
    const utilityCustomers = await db.customer.findMany({ where: utilityWhere, select: { id: true } });
    const utilityIds = new Set(utilityCustomers.map((c) => c.id));

    assert.ok(utilityIds.has(customerValidConsentId), "Valid consent included in utility");
    assert.ok(utilityIds.has(customerMissingConsentId), "Missing marketing consent STILL included in utility query");
    assert.ok(!utilityIds.has(customerOptedOutId), "Opted out excluded in utility");
    assert.ok(!utilityIds.has(customerUnreachableId), "Unreachable excluded in utility");
  });

  test("4. startRun deduplicates recipients sharing the same phone number", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "StartRun Deduplication Test",
        templateId: utilityTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        sendTime: "11:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: false,
      },
      include: {
        template: { select: { name: true, category: true } },
      },
    });

    try {
      const run = await startRun(campaign as any, new Date());
      // Total should be 2 because c3 is opted out, c4 is unreachable, and c5 is duplicate phone of c1!
      assert.equal(run.total, 2, "Run total must be exactly 2 unique phone recipients");

      const queuedMsgs = await db.message.findMany({ where: { runId: run.id } });
      assert.equal(queuedMsgs.length, 2);
      const queuedCustIds = queuedMsgs.map((m) => m.customerId);
      assert.ok(queuedCustIds.includes(customerValidConsentId));
      assert.ok(!queuedCustIds.includes(customerDuplicatePhoneId), "Duplicate phone must NOT be queued");
    } finally {
      await db.message.deleteMany({ where: { run: { campaignId: campaign.id } } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { campaignId: campaign.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: campaign.id } }).catch(() => {});
    }
  });

  test("5. Worker send boundary: queued contact whose optInAt becomes NULL is skipped", async () => {
    const cust = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Boundary Null OptInAt",
        phone: "+919711100001",
        optedOut: false,
        unreachable: false,
        optInAt: new Date("2026-11-01T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
      },
    });
    const camp = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "Boundary Test 5",
        templateId: marketingTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
      },
      include: { template: true },
    });
    const run = await db.campaignRun.create({
      data: {
        campaignId: camp.id,
        status: "RUNNING",
        scheduledFor: new Date(),
        nextBatchAt: new Date(Date.now() - 1000),
        total: 1,
      },
    });
    const msg = await db.message.create({
      data: {
        runId: run.id,
        customerId: cust.id,
        templateId: marketingTemplateId,
        templateName: camp.template.name,
        status: "QUEUED",
      },
    });

    try {
      // Simulate optInAt becoming null after queueing
      await db.customer.update({ where: { id: cust.id }, data: { optInAt: null } });

      const res = await processRun(run.id, new Date(), Date.now() + 5000);
      assert.equal(res.sent, 0, "No message should be sent");

      const updated = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
      assert.equal(updated.status, "SKIPPED");
      assert.match(updated.error || "", /Consent unverified.*optInAt/i);
    } finally {
      await db.message.deleteMany({ where: { id: msg.id } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { id: run.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: camp.id } }).catch(() => {});
      await db.customer.deleteMany({ where: { id: cust.id } }).catch(() => {});
    }
  });

  test("6. Worker send boundary: queued contact whose optInSource becomes NULL is skipped", async () => {
    const cust = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Boundary Null OptInSource",
        phone: "+919711100002",
        optedOut: false,
        unreachable: false,
        optInAt: new Date("2026-11-01T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
      },
    });
    const camp = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "Boundary Test 6",
        templateId: marketingTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
      },
      include: { template: true },
    });
    const run = await db.campaignRun.create({
      data: {
        campaignId: camp.id,
        status: "RUNNING",
        scheduledFor: new Date(),
        nextBatchAt: new Date(Date.now() - 1000),
        total: 1,
      },
    });
    const msg = await db.message.create({
      data: {
        runId: run.id,
        customerId: cust.id,
        templateId: marketingTemplateId,
        templateName: camp.template.name,
        status: "QUEUED",
      },
    });

    try {
      // Simulate optInSource becoming null after queueing
      await db.customer.update({ where: { id: cust.id }, data: { optInSource: null } });

      const res = await processRun(run.id, new Date(), Date.now() + 5000);
      assert.equal(res.sent, 0, "No message should be sent");

      const updated = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
      assert.equal(updated.status, "SKIPPED");
      assert.match(updated.error || "", /Consent unverified.*optInSource/i);
    } finally {
      await db.message.deleteMany({ where: { id: msg.id } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { id: run.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: camp.id } }).catch(() => {});
      await db.customer.deleteMany({ where: { id: cust.id } }).catch(() => {});
    }
  });

  test("7. Worker send boundary: queued contact who opts out after queueing is skipped", async () => {
    const cust = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Boundary Opted Out",
        phone: "+919711100003",
        optedOut: false,
        unreachable: false,
        optInAt: new Date("2026-11-01T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
      },
    });
    const camp = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "Boundary Test 7",
        templateId: marketingTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
      },
      include: { template: true },
    });
    const run = await db.campaignRun.create({
      data: {
        campaignId: camp.id,
        status: "RUNNING",
        scheduledFor: new Date(),
        nextBatchAt: new Date(Date.now() - 1000),
        total: 1,
      },
    });
    const msg = await db.message.create({
      data: {
        runId: run.id,
        customerId: cust.id,
        templateId: marketingTemplateId,
        templateName: camp.template.name,
        status: "QUEUED",
      },
    });

    try {
      // Simulate customer opting out after queueing
      await db.customer.update({ where: { id: cust.id }, data: { optedOut: true } });

      const res = await processRun(run.id, new Date(), Date.now() + 5000);
      assert.equal(res.sent, 0, "No message should be sent");

      const updated = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
      assert.equal(updated.status, "SKIPPED");
      assert.equal(updated.error, "Customer opted out");
    } finally {
      await db.message.deleteMany({ where: { id: msg.id } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { id: run.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: camp.id } }).catch(() => {});
      await db.customer.deleteMany({ where: { id: cust.id } }).catch(() => {});
    }
  });

  test("8. Worker send boundary: queued contact whose consent remains valid proceeds to delivery", async () => {
    const cust = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Boundary Valid Consent",
        phone: "+919711100004",
        optedOut: false,
        unreachable: false,
        optInAt: new Date("2026-11-01T10:00:00Z"),
        optInSource: "Inbound WhatsApp Chat",
      },
    });
    const camp = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "Boundary Test 8",
        templateId: marketingTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
      },
      include: { template: true },
    });
    const run = await db.campaignRun.create({
      data: {
        campaignId: camp.id,
        status: "RUNNING",
        scheduledFor: new Date(),
        nextBatchAt: new Date(Date.now() - 1000),
        total: 1,
      },
    });
    const msg = await db.message.create({
      data: {
        runId: run.id,
        customerId: cust.id,
        templateId: marketingTemplateId,
        templateName: camp.template.name,
        status: "QUEUED",
      },
    });

    try {
      const res = await processRun(run.id, new Date(), Date.now() + 5000);
      assert.equal(res.sent, 1, "Exactly 1 message should be delivered");

      const updated = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
      assert.equal(updated.status, "SENT");
      assert.ok(updated.waMessageId, "waMessageId must be set");
    } finally {
      await db.message.deleteMany({ where: { id: msg.id } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { id: run.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: camp.id } }).catch(() => {});
      await db.customer.deleteMany({ where: { id: cust.id } }).catch(() => {});
    }
  });

  test("9. Worker send boundary: utility messages retain transactional rules and proceed without marketing consent", async () => {
    const cust = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Boundary Utility Contact",
        phone: "+919711100005",
        optedOut: false,
        unreachable: false,
        optInAt: null, // No marketing optInAt timestamp
        optInSource: null, // No marketing optInSource
      },
    });
    const camp = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "Boundary Test 9 Utility",
        templateId: utilityTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
      },
      include: { template: true },
    });
    const run = await db.campaignRun.create({
      data: {
        campaignId: camp.id,
        status: "RUNNING",
        scheduledFor: new Date(),
        nextBatchAt: new Date(Date.now() - 1000),
        total: 1,
      },
    });
    const msg = await db.message.create({
      data: {
        runId: run.id,
        customerId: cust.id,
        templateId: utilityTemplateId,
        templateName: camp.template.name,
        status: "QUEUED",
      },
    });

    try {
      const res = await processRun(run.id, new Date(), Date.now() + 5000);
      assert.equal(res.sent, 1, "Utility message should proceed to delivery without marketing opt-in");

      const updated = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
      assert.equal(updated.status, "SENT");
      assert.ok(updated.waMessageId, "waMessageId must be set on sent utility message");
    } finally {
      await db.message.deleteMany({ where: { id: msg.id } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { id: run.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: camp.id } }).catch(() => {});
      await db.customer.deleteMany({ where: { id: cust.id } }).catch(() => {});
    }
  });

  test("10. Dry-run preflight produces 0 outbound messages and 0 live campaign runs", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId: clientAId,
        name: "Dry Run Zero Side-Effect Audit",
        templateId: marketingTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        sendTime: "11:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: false,
      },
    });

    try {
      const msgsBefore = await db.message.count({ where: { customer: { clientId: clientAId } } });
      const runsBefore = await db.campaignRun.count({ where: { campaignId: campaign.id } });

      const preflight = await validateCampaignPreflight(campaign.id);
      assert.ok(preflight);

      const msgsAfter = await db.message.count({ where: { customer: { clientId: clientAId } } });
      const runsAfter = await db.campaignRun.count({ where: { campaignId: campaign.id } });

      assert.equal(msgsAfter, msgsBefore, "Dry-run MUST create 0 Message records");
      assert.equal(runsAfter, runsBefore, "Dry-run MUST create 0 CampaignRun records");
    } finally {
      await db.campaign.deleteMany({ where: { id: campaign.id } }).catch(() => {});
    }
  });
});
