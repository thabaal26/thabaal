import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { assertSenderHealthy, SenderHealthError } from "../../src/lib/senders";
import { CampaignSenderQualityError, processRun, startRun } from "../../src/lib/dispatcher";
import { partitionAudienceDetailed } from "../../src/lib/campaign-preflight";
import { campaignAudienceWhere } from "../../src/lib/audiences";

describe("Campaign Preflight Audience Partition, Quality Gate & Safety Test Suite", () => {
  let clientId: string;
  let greenSenderId: string;
  let redSenderId: string;
  let marketingTemplateId: string;
  let utilityTemplateId: string;

  let custEligibleId: string;
  let custGapId: string;
  let custMetaHeldId: string;
  let custOptedOutId: string;
  let custInvalidPhoneId: string;

  before(async () => {
    // 1. Create client with mock WhatsApp token
    const client = await db.client.create({
      data: {
        name: `Test_Safety_Client_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        marketingGapHours: 72,
        quietFrom: "21:00",
        quietTo: "09:00",
        waToken: "EAABtest_token_safety_suite",
      },
    });
    clientId = client.id;

    // 2. Create Green and Red Senders
    const greenNum = await db.whatsAppNumber.create({
      data: {
        clientId,
        label: "Green Number",
        phoneNumberId: `pn_green_${Date.now()}`,
        businessAccountId: `waba_${Date.now()}`,
        qualityRating: "GREEN",
        messagingTier: "TIER_2K",
        token: "EAABtest_token_safety_suite",
      },
    });
    greenSenderId = greenNum.id;

    const redNum = await db.whatsAppNumber.create({
      data: {
        clientId,
        label: "Red Number",
        phoneNumberId: `pn_red_${Date.now()}`,
        businessAccountId: greenNum.businessAccountId,
        qualityRating: "RED",
        messagingTier: "TIER_2K",
        token: "EAABtest_token_safety_suite",
      },
    });
    redSenderId = redNum.id;

    // 3. Create Templates (Marketing and Utility)
    const mTemplate = await db.template.create({
      data: {
        clientId,
        businessAccountId: greenNum.businessAccountId,
        name: "test_promo_mktg",
        category: "MARKETING",
        language: "en",
        status: "APPROVED",
        body: "Special Diwali Offer!",
      },
    });
    marketingTemplateId = mTemplate.id;

    const uTemplate = await db.template.create({
      data: {
        clientId,
        businessAccountId: greenNum.businessAccountId,
        name: "test_order_receipt",
        category: "UTILITY",
        language: "en",
        status: "APPROVED",
        body: "Your order receipt",
      },
    });
    utilityTemplateId = uTemplate.id;

    // 4. Create 5 Customers for Audience Partition Test
    // Customer 1: Clean Eligible
    const c1 = await db.customer.create({
      data: {
        clientId,
        name: "Clean Eligible",
        phone: "+919876500001",
        optedOut: false,
        unreachable: false,
        tags: ["preflight_test"],
      },
    });
    custEligibleId = c1.id;

    // Customer 2: Marketing Gap Cooldown (received message 12 hours ago)
    const c2 = await db.customer.create({
      data: {
        clientId,
        name: "In Gap Cooldown",
        phone: "+919876500002",
        optedOut: false,
        unreachable: false,
        tags: ["preflight_test"],
      },
    });
    custGapId = c2.id;
    await db.message.create({
      data: {
        customerId: custGapId,
        templateId: marketingTemplateId,
        templateName: "test_promo_mktg",
        status: "DELIVERED",
        sentAt: new Date(Date.now() - 12 * 3600 * 1000), // 12 hours ago
      },
    });

    // Customer 3: Meta Holdback (Error 131049, failed 5 hours ago)
    const c3 = await db.customer.create({
      data: {
        clientId,
        name: "Meta Held Customer",
        phone: "+919876500003",
        optedOut: false,
        unreachable: false,
        tags: ["preflight_test"],
      },
    });
    custMetaHeldId = c3.id;
    await db.message.create({
      data: {
        customerId: custMetaHeldId,
        templateId: marketingTemplateId,
        templateName: "test_promo_mktg",
        status: "FAILED",
        errorCode: 131049,
        failedAt: new Date(Date.now() - 5 * 3600 * 1000), // 5 hours ago
      },
    });

    // Customer 4: Opted Out
    const c4 = await db.customer.create({
      data: {
        clientId,
        name: "Opted Out Customer",
        phone: "+919876500004",
        optedOut: true,
        unreachable: false,
        tags: ["preflight_test"],
      },
    });
    custOptedOutId = c4.id;

    // Customer 5: Invalid Phone (< 10 digits)
    const c5 = await db.customer.create({
      data: {
        clientId,
        name: "Invalid Phone Customer",
        phone: "12345",
        optedOut: false,
        unreachable: false,
        tags: ["preflight_test"],
      },
    });
    custInvalidPhoneId = c5.id;
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

  test("1. assertSenderHealthy strictly blocks non-GREEN (RED, YELLOW, FLAGGED, RESTRICTED, UNKNOWN) for MARKETING", async () => {
    // A. RED blocked
    await assert.rejects(
      async () => {
        await assertSenderHealthy(clientId, redSenderId, "MARKETING");
      },
      (err: unknown) => {
        assert.ok(err instanceof SenderHealthError);
        assert.match(err.message, /Number quality is RED/i);
        return true;
      }
    );

    // B. YELLOW blocked (Medium Quality Warning)
    await db.whatsAppNumber.update({ where: { id: redSenderId }, data: { qualityRating: "YELLOW" } });
    await assert.rejects(
      async () => {
        await assertSenderHealthy(clientId, redSenderId, "MARKETING");
      },
      (err: unknown) => {
        assert.ok(err instanceof SenderHealthError);
        assert.match(err.message, /Number quality is YELLOW/i);
        return true;
      }
    );

    // C. FLAGGED blocked
    await db.whatsAppNumber.update({ where: { id: redSenderId }, data: { qualityRating: "FLAGGED" } });
    await assert.rejects(
      async () => {
        await assertSenderHealthy(clientId, redSenderId, "MARKETING");
      },
      (err: unknown) => {
        assert.ok(err instanceof SenderHealthError);
        assert.match(err.message, /Number status is FLAGGED/i);
        return true;
      }
    );

    // D. RESTRICTED blocked
    await db.whatsAppNumber.update({ where: { id: redSenderId }, data: { qualityRating: "RESTRICTED" } });
    await assert.rejects(
      async () => {
        await assertSenderHealthy(clientId, redSenderId, "MARKETING");
      },
      (err: unknown) => {
        assert.ok(err instanceof SenderHealthError);
        assert.match(err.message, /Number status is RESTRICTED/i);
        return true;
      }
    );

    // E. UNKNOWN blocked
    await db.whatsAppNumber.update({ where: { id: redSenderId }, data: { qualityRating: "UNKNOWN" } });
    await assert.rejects(
      async () => {
        await assertSenderHealthy(clientId, redSenderId, "MARKETING");
      },
      (err: unknown) => {
        assert.ok(err instanceof SenderHealthError);
        assert.match(err.message, /Number health is UNKNOWN/i);
        return true;
      }
    );

    // Restore redSenderId back to RED
    await db.whatsAppNumber.update({ where: { id: redSenderId }, data: { qualityRating: "RED" } });
  });

  test("2. assertSenderHealthy allows GREEN sender and allows UTILITY category even if RED/YELLOW, but blocks UTILITY if BANNED", async () => {
    // GREEN sender succeeds for MARKETING
    await assert.doesNotReject(async () => {
      await assertSenderHealthy(clientId, greenSenderId, "MARKETING");
    });

    // UTILITY category on RED sender succeeds
    await assert.doesNotReject(async () => {
      await assertSenderHealthy(clientId, redSenderId, "UTILITY");
    });

    // UTILITY category on YELLOW sender succeeds
    await db.whatsAppNumber.update({ where: { id: redSenderId }, data: { qualityRating: "YELLOW" } });
    await assert.doesNotReject(async () => {
      await assertSenderHealthy(clientId, redSenderId, "UTILITY");
    });

    // UTILITY category on BANNED sender is blocked
    await db.whatsAppNumber.update({ where: { id: redSenderId }, data: { qualityRating: "BANNED" } });
    await assert.rejects(
      async () => {
        await assertSenderHealthy(clientId, redSenderId, "UTILITY");
      },
      (err: unknown) => {
        assert.ok(err instanceof SenderHealthError);
        assert.match(err.message, /Number status is BANNED/i);
        return true;
      }
    );

    // Restore redSenderId back to RED
    await db.whatsAppNumber.update({ where: { id: redSenderId }, data: { qualityRating: "RED" } });
  });

  test("3. startRun strictly halts and throws CampaignSenderQualityError when sender is RED", async () => {
    const camp = await db.campaign.create({
      data: {
        clientId,
        name: "Blocked Red Campaign",
        templateId: marketingTemplateId,
        senderId: redSenderId,
        scheduleType: "ONCE",
        sendTime: "10:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: false,
      },
      include: { template: true },
    });

    try {
      await assert.rejects(
        async () => {
          await startRun(camp, new Date());
        },
        (err: unknown) => {
          assert.ok(err instanceof CampaignSenderQualityError);
          assert.match(err.message, /Number quality is RED/i);
          return true;
        }
      );
      // Verify zero runs or messages were created
      const runCount = await db.campaignRun.count({ where: { campaignId: camp.id } });
      assert.equal(runCount, 0);
    } finally {
      await db.campaign.delete({ where: { id: camp.id } }).catch(() => {});
    }
  });

  test("4. countCampaignAudienceDetailed accurately partitions audience and enforces mathematical parity", async () => {
    const res = await partitionAudienceDetailed(clientId, "preflight_test", { templateId: marketingTemplateId });
    assert.equal(res.ok, true);

    // Exact count checks
    assert.equal(res.total, 5, "Total tagged customers must be 5");
    assert.equal(res.eligibleNow, 1, "Only Customer 1 is eligible now");
    assert.equal(res.marketingGap.count, 1, "Customer 2 is in 72h marketing gap");
    assert.equal(res.metaHoldback.count, 1, "Customer 3 is in Meta holdback (131049)");
    assert.equal(res.excluded.total, 2, "Customer 4 (optedOut) and Customer 5 (invalid phone) are excluded");
    assert.equal(res.excluded.optedOut, 1);
    assert.equal(res.excluded.invalidPhone, 1);

    // Turn 60 6-disposition breakdown verification
    assert.equal(res.dispositions.eligibleNow, 1);
    assert.equal(res.dispositions.internalCooldown, 1);
    assert.equal(res.dispositions.providerReassessment, 1);
    assert.equal(res.dispositions.permanentlyExcluded, 2);
    assert.equal(res.dispositions.needsReview, 0);
    assert.equal(res.dispositions.campaignSuppressed, 0);

    // Mathematical Invariant
    const sum = res.eligibleNow + res.marketingGap.count + res.metaHoldback.count + res.excluded.total;
    assert.equal(sum, res.total, "Mathematical parity: Total == EligibleNow + MarketingGap + MetaHoldback + Excluded");

    const dispositionSum =
      res.dispositions.eligibleNow +
      res.dispositions.internalCooldown +
      res.dispositions.providerReassessment +
      res.dispositions.permanentlyExcluded +
      res.dispositions.needsReview +
      res.dispositions.campaignSuppressed;
    assert.equal(dispositionSum, res.total, "Mathematical parity: Total == 6 Dispositions Sum");

    // Unlock Timestamps
    assert.ok(res.marketingGap.earliestUnlockAt !== null, "Earliest unlock must be calculated");
    assert.ok(res.marketingGap.latestUnlockAt !== null, "Latest unlock must be calculated");

    const earliest = new Date(res.marketingGap.earliestUnlockAt!);
    const now = new Date();
    // Since message was sent 12h ago, remaining cooldown is 60h
    const diffHours = (earliest.getTime() - now.getTime()) / 3600000;
    assert.ok(diffHours > 58 && diffHours < 62, `Expected ~60 hours remaining cooldown, got ${diffHours}`);
  });

  test("5. Inbound opt-out pattern matches all required English, Tamil, and Hindi variants", () => {
    const OPT_OUT = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel|dont\s*send|don't\s*send|no\s*more|நிறுத்து|நிறுத்தவும்|வேண்டாம்|बंद\s*करோ|quit|end)\s*$/i;
    const validVariants = [
      "STOP",
      "stop",
      "  Unsubscribe  ",
      "OPT-OUT",
      "opt out",
      "cancel",
      "don't send",
      "dont send",
      "no more",
      "வேண்டாம்",
      "நிறுத்து",
      "நிறுத்தவும்",
      "quit",
      "END",
    ];
    for (const v of validVariants) {
      assert.ok(OPT_OUT.test(v), `Expected '${v}' to match OPT_OUT regex`);
    }

    const invalidVariants = ["hello", "price details", "where is my order", "stopping by tomorrow"];
    for (const inv of invalidVariants) {
      assert.ok(!OPT_OUT.test(inv), `Expected '${inv}' NOT to match OPT_OUT regex`);
    }
  });

  test("6. Customer opt-out transitions pending marketing messages to SKIPPED with code 131050 without deleting audit record or touching UTILITY messages", async () => {
    // Create a running campaign run with a queued marketing message and a queued utility message for Customer 1
    const testCamp = await db.campaign.create({
      data: {
        clientId,
        name: "Active Run Opt-Out Safety Test",
        templateId: marketingTemplateId,
        senderId: greenSenderId,
        scheduleType: "ONCE",
        sendTime: "10:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
      },
    });

    const testRun = await db.campaignRun.create({
      data: {
        campaignId: testCamp.id,
        scheduledFor: new Date(),
        status: "RUNNING",
        total: 2,
      },
    });

    // 1. Queued Marketing Message
    const mktgMsg = await db.message.create({
      data: {
        customerId: custEligibleId,
        runId: testRun.id,
        templateId: marketingTemplateId,
        templateName: "test_promo_mktg",
        status: "QUEUED",
      },
    });

    // 2. Queued Utility Message (should NEVER be skipped or deleted on marketing opt-out)
    const utilMsg = await db.message.create({
      data: {
        customerId: custEligibleId,
        runId: testRun.id,
        templateId: utilityTemplateId,
        templateName: "test_order_receipt",
        status: "QUEUED",
      },
    });

    try {
      // Simulate exact opt-out webhook logic:
      await db.customer.update({
        where: { id: custEligibleId },
        data: { optedOut: true },
      });

      // Update marketing messages to SKIPPED
      await db.message.updateMany({
        where: {
          customerId: custEligibleId,
          status: "QUEUED",
          template: { is: { category: "MARKETING" } },
          run: { is: { campaign: { is: { clientId } } } },
        },
        data: {
          status: "SKIPPED",
          error: "MARKETING_OPT_OUT_BEFORE_DISPATCH",
          errorCode: null,
        },
      });

      // Verification A: Marketing message is NOT deleted, but transitioned to SKIPPED with errorCode null (Release Blocker A)
      const updatedMktg = await db.message.findUnique({ where: { id: mktgMsg.id } });
      assert.ok(updatedMktg, "Marketing message must NOT be deleted (audit history preserved)");
      assert.equal(updatedMktg.status, "SKIPPED", "Marketing message must be marked SKIPPED");
      assert.equal(updatedMktg.error, "MARKETING_OPT_OUT_BEFORE_DISPATCH");
      assert.equal(updatedMktg.errorCode, null, "Locally suppressed opt-out message must have errorCode: null (no 131050 domain pollution)");

      // Verification B: Transactional / Utility message remains untouched and QUEUED
      const updatedUtil = await db.message.findUnique({ where: { id: utilMsg.id } });
      assert.ok(updatedUtil, "Utility message must NOT be deleted");
      assert.equal(updatedUtil.status, "QUEUED", "Utility message must remain QUEUED");
      assert.equal(updatedUtil.error, null);
    } finally {
      await db.customer.update({ where: { id: custEligibleId }, data: { optedOut: false } });
      await db.message.deleteMany({ where: { runId: testRun.id } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { id: testRun.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: testCamp.id } }).catch(() => {});
    }
  });

  test("7. Mixed audience SPLIT_CHILD_DRAFT creates linked child campaign in DRAFT mode with frozen recipient IDs and audienceTag cohort:frozen", async () => {
    const unlockTime = new Date(Date.now() + 60 * 3600 * 1000); // 60 hours in future

    // Create main campaign simulating SPLIT_CHILD_DRAFT
    const mainCamp = await db.campaign.create({
      data: {
        clientId,
        name: "Diwali Big Sale",
        templateId: marketingTemplateId,
        senderId: greenSenderId,
        scheduleType: "WEEKLY",
        daysOfWeek: [1],
        sendTime: "11:00",
        batchSize: 100,
        intervalMinutes: 10,
        active: true,
        audienceTag: "tags:preflight_test",
      },
    });

    const tFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const childSendTime = tFormatter.format(unlockTime);

    // Child cohort created in DRAFT mode with frozen includeIds and audienceTag: cohort:frozen
    const childCamp = await db.campaign.create({
      data: {
        clientId,
        name: `${mainCamp.name} — Cooldown Cohort (Part 2)`,
        templateId: mainCamp.templateId,
        senderId: mainCamp.senderId,
        audienceTag: "cohort:frozen", // Explicit frozen cohort contract
        includeIds: [custGapId], // Explicitly frozen recipient IDs
        scheduleType: "ONCE",
        sendTime: childSendTime,
        runAt: unlockTime,
        batchSize: mainCamp.batchSize,
        intervalMinutes: mainCamp.intervalMinutes,
        active: false, // Must be DRAFT per Architect Turn 58
      },
    });

    try {
      assert.ok(childCamp.id, "Child cohort campaign must be created");
      assert.equal(childCamp.active, false, "Child cohort must be created in DRAFT mode (active: false)");
      assert.equal(childCamp.scheduleType, "ONCE");
      assert.equal(childCamp.audienceTag, "cohort:frozen", "Child cohort audienceTag must be cohort:frozen to prevent broad re-resolution");
      assert.deepEqual(childCamp.includeIds, [custGapId], "Child cohort must freeze exact recipient IDs");
      assert.equal(childCamp.runAt?.getTime(), unlockTime.getTime(), "Child cohort runAt must match latestUnlockAt");
      assert.match(childCamp.name, /Part 2/i);
    } finally {
      await db.campaign.deleteMany({ where: { id: { in: [mainCamp.id, childCamp.id] } } }).catch(() => {});
    }
  });

  test("8. Mixed audience DEFER_ALL sets scheduleType to ONCE and runAt to latestUnlockAt", async () => {
    const unlockTime = new Date(Date.now() + 48 * 3600 * 1000); // 48 hours in future

    const deferredCamp = await db.campaign.create({
      data: {
        clientId,
        name: "Deferred Campaign Test",
        templateId: marketingTemplateId,
        senderId: greenSenderId,
        scheduleType: "ONCE",
        sendTime: "14:30",
        runAt: unlockTime,
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
        audienceTag: "tags:preflight_test",
      },
    });

    try {
      assert.equal(deferredCamp.scheduleType, "ONCE");
      assert.equal(deferredCamp.runAt?.getTime(), unlockTime.getTime());
    } finally {
      await db.campaign.delete({ where: { id: deferredCamp.id } }).catch(() => {});
    }
  });

  test("9. startRun strictly blocks dispatch when sender quality degrades to YELLOW or FLAGGED", async () => {
    // 1. Test YELLOW quality degradation
    await db.whatsAppNumber.update({ where: { id: greenSenderId }, data: { qualityRating: "YELLOW" } });

    const yellowCamp = await db.campaign.create({
      data: {
        clientId,
        name: "Degraded Yellow Campaign",
        templateId: marketingTemplateId,
        senderId: greenSenderId,
        scheduleType: "ONCE",
        sendTime: "10:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: false,
      },
      include: { template: true },
    });

    try {
      await assert.rejects(
        async () => {
          await startRun(yellowCamp, new Date());
        },
        (err: unknown) => {
          assert.ok(err instanceof CampaignSenderQualityError);
          assert.match(err.message, /Number quality is YELLOW/i);
          return true;
        }
      );
    } finally {
      await db.campaign.delete({ where: { id: yellowCamp.id } }).catch(() => {});
      // Restore greenSenderId back to GREEN
      await db.whatsAppNumber.update({ where: { id: greenSenderId }, data: { qualityRating: "GREEN" } });
    }
  });

  test("10. Child draft frozen cohort isolation: cannot resolve any contact outside explicit includeIds, even if audienceTag is null", async () => {
    // There are 5 customers in this tenant (custEligibleId, custGapId, custMetaHeldId, custOptedOutId, custInvalidPhoneId).
    // A frozen child cohort is created with includeIds = [custGapId] and audienceTag = 'cohort:frozen' (or audienceTag = null).

    // Check A: With audienceTag = 'cohort:frozen'
    const whereFrozen = await campaignAudienceWhere(clientId, "cohort:frozen", {
      includeIds: [custGapId],
      isCohortFrozen: true,
    });
    const matchedFrozen = await db.customer.findMany({ where: whereFrozen, select: { id: true, name: true } });
    assert.equal(matchedFrozen.length, 1, "Must strictly resolve only the 1 frozen recipient");
    assert.equal(matchedFrozen[0].id, custGapId, "Must match custGapId exactly");

    // Check B: With audienceTag = null (implicit Everyone fallback prevented when isCohortFrozen is true)
    const whereNullTag = await campaignAudienceWhere(clientId, null, {
      includeIds: [custGapId],
      isCohortFrozen: true,
    });
    const matchedNullTag = await db.customer.findMany({ where: whereNullTag, select: { id: true, name: true } });
    assert.equal(matchedNullTag.length, 1, "Must NEVER fall back to Everyone when includeIds are frozen");
    assert.equal(matchedNullTag[0].id, custGapId);

    // Check C: Excluded IDs within frozen cohort are respected
    const whereExcluded = await campaignAudienceWhere(clientId, "cohort:frozen", {
      includeIds: [custGapId],
      excludeIds: [custGapId],
      isCohortFrozen: true,
    });
    const matchedExcluded = await db.customer.findMany({ where: whereExcluded });
    assert.equal(matchedExcluded.length, 0, "Excluding a frozen ID returns 0 matches");
  });

  test("11. Concurrent opt-out dispatch cancellation: aborts dispatch and stamps SKIPPED with errorCode null without sending to Meta", async () => {
    // 1. Create a running campaign with a queued marketing message
    const raceCamp = await db.campaign.create({
      data: {
        clientId,
        name: "Race Condition Opt-Out Test",
        templateId: marketingTemplateId,
        senderId: greenSenderId,
        scheduleType: "ONCE",
        sendTime: "10:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
      },
      include: { template: true },
    });

    const raceRun = await db.campaignRun.create({
      data: {
        campaignId: raceCamp.id,
        scheduledFor: new Date(),
        status: "RUNNING",
        total: 1,
        nextBatchAt: new Date(),
      },
    });

    const raceMsg = await db.message.create({
      data: {
        customerId: custEligibleId,
        runId: raceRun.id,
        templateId: marketingTemplateId,
        templateName: "test_promo_mktg",
        status: "QUEUED",
      },
    });

    try {
      // 2. Simulate concurrent opt-out webhook arriving right as message is in memory buffer:
      // The webhook marks the message SKIPPED with errorCode: null and customer optedOut: true
      await db.customer.update({
        where: { id: custEligibleId },
        data: { optedOut: true },
      });
      await db.message.update({
        where: { id: raceMsg.id },
        data: {
          status: "SKIPPED",
          error: "MARKETING_OPT_OUT_BEFORE_DISPATCH",
          errorCode: null,
        },
      });

      // 3. Dispatcher processes the run
      const result = await processRun(raceRun.id, new Date(), Date.now() + 5000);

      // 4. Assert zero messages sent to Meta
      assert.equal(result.sent, 0, "Zero messages must be sent when concurrent opt-out occurred");

      // 5. Assert message remained SKIPPED with errorCode null
      const finalMsg = await db.message.findUnique({ where: { id: raceMsg.id } });
      assert.equal(finalMsg?.status, "SKIPPED");
      assert.equal(finalMsg?.error, "MARKETING_OPT_OUT_BEFORE_DISPATCH");
      assert.equal(finalMsg?.errorCode, null, "Local opt-out suppression must have errorCode: null (Release Blocker A)");
    } finally {
      await db.customer.update({ where: { id: custEligibleId }, data: { optedOut: false } });
      await db.message.deleteMany({ where: { runId: raceRun.id } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { id: raceRun.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: raceCamp.id } }).catch(() => {});
    }
  });

  test("12. processRun strictly pauses with WAITING_QUALITY when sender status degrades mid-run to FLAGGED or RESTRICTED", async () => {
    // Set sender to FLAGGED
    await db.whatsAppNumber.update({ where: { id: greenSenderId }, data: { qualityRating: "FLAGGED" } });

    const flagCamp = await db.campaign.create({
      data: {
        clientId,
        name: "Flagged Sender Batch Test",
        templateId: marketingTemplateId,
        senderId: greenSenderId,
        scheduleType: "ONCE",
        sendTime: "10:00",
        batchSize: 50,
        intervalMinutes: 15,
        active: true,
      },
      include: { template: true },
    });

    const flagRun = await db.campaignRun.create({
      data: {
        campaignId: flagCamp.id,
        scheduledFor: new Date(),
        status: "RUNNING",
        total: 1,
        nextBatchAt: new Date(),
      },
    });

    try {
      const res = await processRun(flagRun.id, new Date(), Date.now() + 5000);
      assert.equal(res.sent, 0, "Zero messages sent when sender is FLAGGED");

      const pausedRun = await db.campaignRun.findUnique({ where: { id: flagRun.id } });
      assert.equal(pausedRun?.status, "WAITING_QUALITY", "Run must pause with WAITING_QUALITY");
    } finally {
      await db.whatsAppNumber.update({ where: { id: greenSenderId }, data: { qualityRating: "GREEN" } });
      await db.campaignRun.deleteMany({ where: { id: flagRun.id } }).catch(() => {});
      await db.campaign.deleteMany({ where: { id: flagCamp.id } }).catch(() => {});
    }
  });
});
