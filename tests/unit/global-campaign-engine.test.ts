import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { startRun } from "../../src/lib/dispatcher";
import { audienceTagCustomerIds, campaignAudienceWhere } from "../../src/lib/audiences";
import { encodeTags, TAGS_PREFIX } from "../../src/lib/audience-tags";
import { getAudienceClassificationSummary, CLASSIFICATION_DEFINITIONS } from "../../src/lib/campaign-classification";
import { getMetaErrorClassification, META_ERROR_CATALOG, metaError, explainError } from "../../src/lib/meta-errors";

describe("Global Multi-Tenant Campaign Engine Acceptance Suite", () => {
  let tenant1Id: string;
  let tenant2Id: string;
  let marketingTpl1: string;
  let utilityTpl1: string;
  let marketingTpl2: string;
  let sender1: string;
  let sender2: string;

  let cust1_valid: string;
  let cust1_noconsent: string;
  let cust1_optout: string;
  let cust1_unreachable: string;
  let cust1_tagA: string;
  let cust1_tagB: string;
  let cust1_bothTags: string;

  let cust2_sameTagA: string;
  let cust2_samePhone: string;

  before(async () => {
    // 1. Create Tenant 1 & Tenant 2
    const t1 = await db.client.create({
      data: {
        name: `Global_Test_T1_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        marketingGapHours: 0,
      },
    });
    tenant1Id = t1.id;

    const t2 = await db.client.create({
      data: {
        name: `Global_Test_T2_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        marketingGapHours: 0,
      },
    });
    tenant2Id = t2.id;

    // Senders
    const s1 = await db.whatsAppNumber.create({
      data: {
        clientId: tenant1Id,
        label: "T1 Primary",
        phoneNumberId: "phone_t1_123",
        businessAccountId: "waba_t1_123",
        displayPhone: "+91 91111 22222",
      },
    });
    sender1 = s1.id;

    const s2 = await db.whatsAppNumber.create({
      data: {
        clientId: tenant2Id,
        label: "T2 Primary",
        phoneNumberId: "phone_t2_456",
        businessAccountId: "waba_t2_456",
        displayPhone: "+91 93333 44444",
      },
    });
    sender2 = s2.id;

    // Templates
    const mt1 = await db.template.create({
      data: {
        clientId: tenant1Id,
        name: "t1_marketing",
        category: "MARKETING",
        status: "APPROVED",
        body: "T1 Marketing {{1}}",
      },
    });
    marketingTpl1 = mt1.id;

    const ut1 = await db.template.create({
      data: {
        clientId: tenant1Id,
        name: "t1_utility",
        category: "UTILITY",
        status: "APPROVED",
        body: "T1 Utility {{1}}",
      },
    });
    utilityTpl1 = ut1.id;

    const mt2 = await db.template.create({
      data: {
        clientId: tenant2Id,
        name: "t2_marketing",
        category: "MARKETING",
        status: "APPROVED",
        body: "T2 Marketing {{1}}",
      },
    });
    marketingTpl2 = mt2.id;

    // Tenant 1 Customers
    const c1_v = await db.customer.create({
      data: {
        clientId: tenant1Id,
        name: "T1 Valid Customer",
        phone: "+919100000001",
        optedOut: false,
        unreachable: false,
        optInAt: new Date("2026-11-01T10:00:00Z"),
        optInSource: "Store POS",
        tags: ["vip"],
      },
    });
    cust1_valid = c1_v.id;

    const c1_nc = await db.customer.create({
      data: {
        clientId: tenant1Id,
        name: "T1 No Consent",
        phone: "+919100000002",
        optedOut: false,
        unreachable: false,
        optInAt: null,
        optInSource: "Import",
        tags: ["lead"],
      },
    });
    cust1_noconsent = c1_nc.id;

    const c1_oo = await db.customer.create({
      data: {
        clientId: tenant1Id,
        name: "T1 Opted Out",
        phone: "+919100000003",
        optedOut: true,
        unreachable: false,
        optInAt: new Date("2026-10-01T10:00:00Z"),
        optInSource: "Store POS",
        tags: ["vip"],
      },
    });
    cust1_optout = c1_oo.id;

    const c1_un = await db.customer.create({
      data: {
        clientId: tenant1Id,
        name: "T1 Unreachable",
        phone: "+919100000004",
        optedOut: false,
        unreachable: true,
        optInAt: new Date("2026-10-01T10:00:00Z"),
        optInSource: "Store POS",
        tags: ["lead"],
      },
    });
    cust1_unreachable = c1_un.id;

    const c1_ta = await db.customer.create({
      data: {
        clientId: tenant1Id,
        name: "T1 TagA Only",
        phone: "+919100000005",
        optedOut: false,
        unreachable: false,
        optInAt: new Date(),
        optInSource: "Web",
        tags: ["batch2"],
      },
    });
    cust1_tagA = c1_ta.id;

    const c1_tb = await db.customer.create({
      data: {
        clientId: tenant1Id,
        name: "T1 TagB Only",
        phone: "+919100000006",
        optedOut: false,
        unreachable: false,
        optInAt: new Date(),
        optInSource: "Web",
        tags: ["retail"],
      },
    });
    cust1_tagB = c1_tb.id;

    const c1_ab = await db.customer.create({
      data: {
        clientId: tenant1Id,
        name: "T1 Both Tags",
        phone: "+919100000007",
        optedOut: false,
        unreachable: false,
        optInAt: new Date(),
        optInSource: "Web",
        tags: ["batch2", "retail"],
      },
    });
    cust1_bothTags = c1_ab.id;

    // Tenant 2 Customers with identical tag name and identical phone to test strict isolation
    const c2_tag = await db.customer.create({
      data: {
        clientId: tenant2Id,
        name: "T2 Customer With Same Tag Name",
        phone: "+919200000001",
        optedOut: false,
        unreachable: false,
        optInAt: new Date(),
        optInSource: "Web",
        tags: ["batch2"], // Same tag name as Tenant 1
      },
    });
    cust2_sameTagA = c2_tag.id;

    const c2_phone = await db.customer.create({
      data: {
        clientId: tenant2Id,
        name: "T2 Customer With Same Phone",
        phone: "+919100000001", // Same phone as cust1_valid in Tenant 1
        optedOut: false,
        unreachable: false,
        optInAt: new Date(),
        optInSource: "Web",
        tags: ["vip"],
      },
    });
    cust2_samePhone = c2_phone.id;
  });

  after(async () => {
    const clients = [tenant1Id, tenant2Id];
    await db.message.deleteMany({ where: { customer: { clientId: { in: clients } } } }).catch(() => {});
    await db.campaignRun.deleteMany({ where: { campaign: { clientId: { in: clients } } } }).catch(() => {});
    await db.campaign.deleteMany({ where: { clientId: { in: clients } } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId: { in: clients } } }).catch(() => {});
    await db.template.deleteMany({ where: { clientId: { in: clients } } }).catch(() => {});
    await db.whatsAppNumber.deleteMany({ where: { clientId: { in: clients } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { in: clients } } }).catch(() => {});
  });

  // ==========================================
  // SECTION A: EVERYONE TESTS
  // ==========================================
  describe("Section A: Everyone Audience Mode", () => {
    test("A1. Base population includes all active tenant customers without cross-tenant leakage", async () => {
      const everyoneWhere = await campaignAudienceWhere(tenant1Id, null);
      const rows = await db.customer.findMany({ where: everyoneWhere, select: { id: true, clientId: true } });
      const ids = new Set(rows.map((r) => r.id));

      assert.ok(ids.has(cust1_valid));
      assert.ok(ids.has(cust1_noconsent));
      assert.ok(!ids.has(cust1_optout), "Opted out must be excluded");
      assert.ok(!ids.has(cust1_unreachable), "Unreachable must be excluded");
      assert.ok(!ids.has(cust2_sameTagA), "Tenant 2 customer must never leak into Tenant 1");
      assert.ok(!ids.has(cust2_samePhone), "Tenant 2 customer with same phone must never leak");
      for (const r of rows) {
        assert.equal(r.clientId, tenant1Id, "Every record must belong strictly to Tenant 1");
      }
    });

    test("A2. First Time – Never Sent customers can be Eligible Now simultaneously", async () => {
      const summary = await getAudienceClassificationSummary(tenant1Id, { audienceTag: null });
      assert.ok(summary.historyCounts.FIRST_TIME_NEVER_SENT > 0);
      assert.ok(summary.eligibleNow > 0);
    });
  });

  // ==========================================
  // SECTION B: TAGS TESTS (Single, OR, AND, Empty)
  // ==========================================
  describe("Section B: Tag Audience Mode & Logic", () => {
    test("B1. Single tag returns only its customers", async () => {
      const tagTagA = encodeTags({ match: "any", tags: ["batch2"] });
      const ids = await audienceTagCustomerIds(tenant1Id, tagTagA);
      assert.ok(ids !== null);
      assert.ok(ids.includes(cust1_tagA));
      assert.ok(ids.includes(cust1_bothTags));
      assert.ok(!ids.includes(cust1_tagB), "Tag B only must not be in Tag A");
      assert.ok(!ids.includes(cust2_sameTagA), "Tenant 2 with same tag name must never leak");
    });

    test("B2. Multiple tags OR (ANY) returns the union", async () => {
      const tagOr = encodeTags({ match: "any", tags: ["batch2", "retail"] });
      const ids = await audienceTagCustomerIds(tenant1Id, tagOr);
      assert.ok(ids !== null);
      assert.ok(ids.includes(cust1_tagA));
      assert.ok(ids.includes(cust1_tagB));
      assert.ok(ids.includes(cust1_bothTags));
      // Deduplication: cust1_bothTags has both tags but must only appear once in customer IDs
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, "Customer belonging to multiple tags must appear exactly once");
    });

    test("B3. Multiple tags AND (ALL) returns the intersection", async () => {
      const tagAnd = encodeTags({ match: "all", tags: ["batch2", "retail"] });
      const ids = await audienceTagCustomerIds(tenant1Id, tagAnd);
      assert.ok(ids !== null);
      assert.ok(ids.includes(cust1_bothTags), "Must contain customer with both tags");
      assert.ok(!ids.includes(cust1_tagA), "Must NOT contain customer with Tag A only");
      assert.ok(!ids.includes(cust1_tagB), "Must NOT contain customer with Tag B only");
    });

    test("B4. Empty tag selection returns 0 recipients and never silently falls back to Everyone", async () => {
      const emptyTag = `${TAGS_PREFIX}${JSON.stringify({ match: "any", tags: [] })}`;
      const ids = await audienceTagCustomerIds(tenant1Id, emptyTag);
      assert.deepEqual(ids, [], "Empty tag must return empty array, never null (which is Everyone)");

      const summary = await getAudienceClassificationSummary(tenant1Id, { audienceTag: emptyTag });
      assert.equal(summary.selectedAudience, 0, "Selected audience must be 0 for empty tags");
      assert.equal(summary.finalDispatchable, 0);
    });
  });

  // ==========================================
  // SECTION C: CLASSIFICATION DIMENSIONS
  // ==========================================
  describe("Section C: Multi-Dimensional Classification Engine", () => {
    test("C1. History, eligibility, engagement, and lifecycle are independent dimensions", () => {
      const historyKeys = Object.keys(CLASSIFICATION_DEFINITIONS).filter((k) => CLASSIFICATION_DEFINITIONS[k].dimension === "history");
      const eligibilityKeys = Object.keys(CLASSIFICATION_DEFINITIONS).filter((k) => CLASSIFICATION_DEFINITIONS[k].dimension === "eligibility");
      const engagementKeys = Object.keys(CLASSIFICATION_DEFINITIONS).filter((k) => CLASSIFICATION_DEFINITIONS[k].dimension === "engagement");
      const lifecycleKeys = Object.keys(CLASSIFICATION_DEFINITIONS).filter((k) => CLASSIFICATION_DEFINITIONS[k].dimension === "lifecycle");

      assert.ok(historyKeys.length >= 10);
      assert.ok(eligibilityKeys.length >= 10);
      assert.ok(engagementKeys.length >= 5);
      assert.ok(lifecycleKeys.length >= 5);

      // Verify Read is not automatically Engaged
      assert.notEqual(CLASSIFICATION_DEFINITIONS.READ.dimension, CLASSIFICATION_DEFINITIONS.ENGAGED.dimension);
      assert.equal(CLASSIFICATION_DEFINITIONS.READ.dimension, "history");
      assert.equal(CLASSIFICATION_DEFINITIONS.ENGAGED.dimension, "engagement");
    });
  });

  // ==========================================
  // SECTION D: CONSENT AND SEND ELIGIBILITY CONSISTENCY
  // ==========================================
  describe("Section D: Consent Parity between Preview and Dispatch", () => {
    test("D1. Marketing campaign strictly excludes missing optInAt; Utility allows it", async () => {
      const mktWhere = await campaignAudienceWhere(tenant1Id, null, {}, { requirePositiveConsent: true });
      const mktRows = await db.customer.findMany({ where: mktWhere, select: { id: true } });
      const mktIds = new Set(mktRows.map((r) => r.id));

      assert.ok(mktIds.has(cust1_valid), "Customer with optInAt is eligible for marketing");
      assert.ok(!mktIds.has(cust1_noconsent), "Customer without optInAt MUST be excluded from marketing");

      const utlWhere = await campaignAudienceWhere(tenant1Id, null, {}, { requirePositiveConsent: false });
      const utlRows = await db.customer.findMany({ where: utlWhere, select: { id: true } });
      const utlIds = new Set(utlRows.map((r) => r.id));

      assert.ok(utlIds.has(cust1_valid));
      assert.ok(utlIds.has(cust1_noconsent), "Customer without marketing optInAt is STILL eligible for utility");
    });

    test("D2. Opt-out is always excluded across both Marketing and Utility", async () => {
      const mktWhere = await campaignAudienceWhere(tenant1Id, null, {}, { requirePositiveConsent: true });
      const utlWhere = await campaignAudienceWhere(tenant1Id, null, {}, { requirePositiveConsent: false });

      const [mktRows, utlRows] = await Promise.all([
        db.customer.findMany({ where: mktWhere, select: { id: true } }),
        db.customer.findMany({ where: utlWhere, select: { id: true } }),
      ]);

      assert.ok(!mktRows.some((r) => r.id === cust1_optout));
      assert.ok(!utlRows.some((r) => r.id === cust1_optout));
    });
  });

  // ==========================================
  // SECTION E: META ERROR CLASSIFICATION ENGINE
  // ==========================================
  describe("Section E: Meta Cloud API Error Catalog", () => {
    test("E1. Key error codes mapped with correct scope and retry behavior", () => {
      // 131026: Unreachable
      const e131026 = getMetaErrorClassification(131026);
      assert.equal(e131026.category, "permanent");
      assert.equal(e131026.scope, "customer");
      assert.equal(e131026.retryAllowed, false);
      assert.equal(e131026.suppressRecipient, true);

      // 131049: Marketing frequency limit (held)
      const e131049 = getMetaErrorClassification(131049);
      assert.equal(e131049.category, "marketing");
      assert.equal(e131049.scope, "recipient-pair");
      assert.equal(e131049.retryAllowed, true);
      assert.equal(e131049.suppressRecipient, false);

      // 130472: Marketing experiment
      const e130472 = getMetaErrorClassification(130472);
      assert.equal(e130472.category, "marketing");
      assert.equal(e130472.retryAllowed, false);

      // 131050: Opt-out
      const e131050 = getMetaErrorClassification(131050);
      assert.equal(e131050.category, "opt-out");
      assert.equal(e131050.retryAllowed, false);
      assert.equal(e131050.suppressRecipient, true);

      // 130429 & 80007: Rate throttling
      const e130429 = getMetaErrorClassification(130429);
      assert.equal(e130429.category, "rate");
      assert.equal(e130429.scope, "sender");
      assert.equal(e130429.suppressRecipient, false);

      const e80007 = getMetaErrorClassification(80007);
      assert.equal(e80007.category, "rate");
      assert.equal(e80007.scope, "waba");
      assert.equal(e80007.suppressRecipient, false);

      // 190 & 200: System auth/permissions
      const e190 = getMetaErrorClassification(190);
      assert.equal(e190.requiresOperatorAction, true);

      const e200 = getMetaErrorClassification(200);
      assert.equal(e200.requiresOperatorAction, true);

      // Unknown code safety fallback
      const unknown = getMetaErrorClassification(9999999);
      assert.equal(unknown.retryAllowed, false, "Unknown error must never be retried automatically");
      assert.equal(unknown.requiresOperatorAction, true);
    });
  });

  // ==========================================
  // SECTION G: IDEMPOTENCY & RERUN DUPLICATE PROTECTION
  // ==========================================
  describe("Section G: Campaign Recipient Idempotency & Rerun Duplicate Protection", () => {
    test("G1. Rerunning a campaign does NOT re-enqueue already reached/queued customers by default", async () => {
      const camp = await db.campaign.create({
        data: {
          clientId: tenant1Id,
          name: "Idempotency Rerun Test",
          templateId: utilityTpl1,
          senderId: sender1,
          scheduleType: "ONCE",
          sendTime: "10:00",
          batchSize: 50,
          intervalMinutes: 15,
          active: false,
        },
        include: { template: { select: { name: true, category: true } } },
      });

      try {
        // Run 1: initial send
        const run1 = await startRun(camp as any, new Date());
        assert.ok(run1.total > 0, "Run 1 must queue recipients");

        const msgsRun1 = await db.message.findMany({ where: { runId: run1.id } });
        assert.equal(msgsRun1.length, run1.total);

        // Run 2: operator triggers a rerun of the same campaign without allowResend
        const run2 = await startRun(camp as any, new Date());
        assert.equal(run2.total, 0, "Run 2 must queue 0 recipients because all were queued in Run 1!");

        const msgsRun2 = await db.message.findMany({ where: { runId: run2.id } });
        assert.equal(msgsRun2.length, 0, "Run 2 must have 0 message records created");

        // Run 3: explicit operator resend with allowResend: true
        const run3 = await startRun(camp as any, new Date(), { allowResend: true });
        assert.equal(run3.total, run1.total, "Run 3 with allowResend=true must re-enqueue recipients");
      } finally {
        await db.message.deleteMany({ where: { run: { campaignId: camp.id } } }).catch(() => {});
        await db.campaignRun.deleteMany({ where: { campaignId: camp.id } }).catch(() => {});
        await db.campaign.deleteMany({ where: { id: camp.id } }).catch(() => {});
      }
    });
  });

  // ==========================================
  // SECTION H: MULTI-TENANT ISOLATION TESTS
  // ==========================================
  describe("Section H: Strict Cross-Tenant Boundaries", () => {
    test("H1. Tenants with identical tag name ('batch2') return 0 overlapping customer records", async () => {
      const tagTagA = encodeTags({ match: "any", tags: ["batch2"] });
      const t1Ids = await audienceTagCustomerIds(tenant1Id, tagTagA);
      const t2Ids = await audienceTagCustomerIds(tenant2Id, tagTagA);

      assert.ok(t1Ids && t1Ids.length > 0);
      assert.ok(t2Ids && t2Ids.length > 0);

      const intersection = t1Ids.filter((id) => t2Ids.includes(id));
      assert.equal(intersection.length, 0, "Zero customer ID overlap between Tenant 1 and Tenant 2");
    });

    test("H2. Classification summary does not leak counts across tenants", async () => {
      const s1 = await getAudienceClassificationSummary(tenant1Id, { audienceTag: null });
      const s2 = await getAudienceClassificationSummary(tenant2Id, { audienceTag: null });

      assert.notEqual(s1.totalAudience, s2.totalAudience);
      assert.equal(s2.totalAudience, 2, "Tenant 2 only has 2 customers");
    });
  });
});
