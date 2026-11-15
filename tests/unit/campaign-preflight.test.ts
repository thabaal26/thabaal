import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { validateCampaignPreflight } from "../../src/lib/campaign-preflight";

describe("Campaign Preflight & Dry-Run Safety Audit", () => {
  let clientId: string;
  let approvedTemplateId: string;
  let draftTemplateId: string;
  let senderNumberId: string;
  let customerOptedInId: string;
  let customerOptedOutId: string;
  let customerUnreachableId: string;

  before(async () => {
    // 1. Create a test tenant
    const client = await db.client.create({
      data: {
        name: `Campaign_Preflight_Client_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        waToken: "EAAX_test_valid_token_for_preflight",
        waPhoneNumberId: "test_phone_id_12345",
        waBusinessAccountId: "test_waba_id_12345",
        quietFrom: "21:00",
        quietTo: "09:00",
        marketingGapHours: 72,
      },
    });
    clientId = client.id;

    // 2. Create sender number
    const sender = await db.whatsAppNumber.create({
      data: {
        clientId,
        label: "Primary Support Number",
        phoneNumberId: "test_phone_id_12345",
        businessAccountId: "test_waba_id_12345",
        displayPhone: "+91 98888 77777",
        qualityRating: "GREEN",
        messagingTier: "TIER_2K",
      },
    });
    senderNumberId = sender.id;

    // 3. Create approved template
    const appTemplate = await db.template.create({
      data: {
        clientId,
        businessAccountId: "test_waba_id_12345",
        name: "preflight_promo_approved",
        category: "MARKETING",
        language: "en_US",
        status: "APPROVED",
        body: "Hello {{1}}, welcome to our exclusive Diwali sale!",
        variables: { "1": "name" },
      },
    });
    approvedTemplateId = appTemplate.id;

    // 4. Create draft/unapproved template
    const drfTemplate = await db.template.create({
      data: {
        clientId,
        businessAccountId: "test_waba_id_12345",
        name: "preflight_promo_draft",
        category: "MARKETING",
        language: "en_US",
        status: "DRAFT",
        body: "Draft unapproved message",
      },
    });
    draftTemplateId = drfTemplate.id;

    // 5. Create test customers: 1 opted-in, 1 opted-out, 1 unreachable, 1 consent-unverified
    const c1 = await db.customer.create({
      data: {
        clientId,
        name: "Opted In Customer",
        phone: "+919876543211",
        optedOut: false,
        unreachable: false,
        optInAt: new Date(),
        optInSource: "Inbound WhatsApp Chat",
        tags: ["vip"],
      },
    });
    customerOptedInId = c1.id;

    const c2 = await db.customer.create({
      data: {
        clientId,
        name: "Opted Out Customer",
        phone: "+919876543212",
        optedOut: true,
        unreachable: false,
        optInAt: new Date(),
        optInSource: "Website Form",
        tags: ["vip"],
      },
    });
    customerOptedOutId = c2.id;

    const c3 = await db.customer.create({
      data: {
        clientId,
        name: "Unreachable Customer",
        phone: "+919876543213",
        optedOut: false,
        unreachable: true,
        optInAt: new Date(),
        optInSource: "Inbound WhatsApp Chat",
        tags: ["vip"],
      },
    });
    customerUnreachableId = c3.id;

    await db.customer.create({
      data: {
        clientId,
        name: "Consent Unverified Customer",
        phone: "+919876543214",
        optedOut: false,
        unreachable: false,
        optInAt: null,
        optInSource: "Imported Sheet",
        tags: ["vip"],
      },
    });
  });

  after(async () => {
    await db.message.deleteMany({ where: { customer: { clientId } } }).catch(() => {});
    await db.campaignRun.deleteMany({ where: { campaign: { clientId } } }).catch(() => {});
    await db.campaign.deleteMany({ where: { clientId } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId } }).catch(() => {});
    await db.template.deleteMany({ where: { clientId } }).catch(() => {});
    await db.whatsAppNumber.deleteMany({ where: { clientId } }).catch(() => {});
    await db.client.deleteMany({ where: { id: clientId } }).catch(() => {});
  });

  test("1. Preflight rejects unapproved template with NO_GO and explicit blocking issue", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Draft Campaign Test",
        templateId: draftTemplateId,
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
      assert.equal(result.ok, false);
      assert.equal(result.status, "NO_GO");
      assert.ok(result.blockingIssues.some((issue) => /not approved by Meta/i.test(issue)));
      assert.equal(result.template.isApproved, false);
    } finally {
      await db.campaign.deleteMany({ where: { id: campaign.id } }).catch(() => {});
    }
  });

  test("2. Preflight strictly excludes opted-out, unreachable, and unverified-consent contacts", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Approved Campaign Preflight",
        templateId: approvedTemplateId,
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
      assert.equal(result.status, "CONDITIONAL_GO");
      assert.equal(result.template.isApproved, true);
      assert.equal(result.recipients.totalTenantCustomers, 4);
      assert.equal(result.recipients.excludedOptOut, 1, "Must detect exactly 1 opted-out contact");
      assert.equal(result.recipients.excludedUnreachable, 1, "Must detect exactly 1 unreachable contact");
      assert.equal(result.recipients.excludedConsentUnverified, 1, "Must detect exactly 1 unverified-consent contact");
      assert.equal(result.recipients.eligibleCount, 1, "Must resolve exactly 1 eligible recipient");
      assert.equal(result.recipients.sampleEligible[0].name, "Opted In Customer");
    } finally {
      await db.campaign.deleteMany({ where: { id: campaign.id } }).catch(() => {});
    }
  });

  test("3. Preflight produces zero outbound messages and zero database mutations", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Dry Run Zero Mutation Test",
        templateId: approvedTemplateId,
        senderId: senderNumberId,
        scheduleType: "ONCE",
        sendTime: "11:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: false,
      },
    });

    try {
      const msgsBefore = await db.message.count({ where: { customer: { clientId } } });
      const runsBefore = await db.campaignRun.count({ where: { campaignId: campaign.id } });

      await validateCampaignPreflight(campaign.id);

      const msgsAfter = await db.message.count({ where: { customer: { clientId } } });
      const runsAfter = await db.campaignRun.count({ where: { campaignId: campaign.id } });

      assert.equal(msgsAfter, msgsBefore, "Preflight MUST NOT create or send any Message records");
      assert.equal(runsAfter, runsBefore, "Preflight MUST NOT create any CampaignRun records");
    } finally {
      await db.campaign.deleteMany({ where: { id: campaign.id } }).catch(() => {});
    }
  });
});
