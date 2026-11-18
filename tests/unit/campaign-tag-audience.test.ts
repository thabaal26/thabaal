import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { audienceTagCustomerIds, campaignAudienceWhere } from "../../src/lib/audiences";
import { segmentSummary } from "../../src/lib/engagement-segments";
import { encodeTags, TAGS_PREFIX } from "../../src/lib/audience-tags";

describe("Campaign Tag Audience Scoping & Engagement Refinement", () => {
  let clientAId: string;
  let clientBId: string;
  let audienceId: string;
  const customersA: Record<string, string> = {};
  const customersB: Record<string, string> = {};
  const PHONE_PREFIX_A = `9191${String(Date.now()).slice(-6)}`;
  const PHONE_PREFIX_B = `9192${String(Date.now()).slice(-6)}`;

  before(async () => {
    // 1. Create two test clients to verify tenant isolation
    const clientA = await db.client.create({
      data: {
        name: `QA Tag Audience Client A ${Date.now()}`,
        orderPrefix: "TA",
        quietFrom: null,
        quietTo: null,
        marketingGapHours: 0,
      },
    });
    clientAId = clientA.id;

    const clientB = await db.client.create({
      data: {
        name: `QA Tag Audience Client B ${Date.now()}`,
        orderPrefix: "TB",
        quietFrom: null,
        quietTo: null,
        marketingGapHours: 0,
      },
    });
    clientBId = clientB.id;

    // 2. In Client A, create customers simulating the Batch 2 scenario:
    // - 5 customers in batch2:
    //   * c1: eligible (opted in, reachable)
    //   * c2: eligible (opted in, reachable)
    //   * c3: unreachable (Meta 131026)
    //   * c4: opted out (optedOut: true)
    //   * c5: deleted (soft deleted)
    // - 3 customers in batch1 (different tag):
    //   * c6, c7, c8
    // - 2 customers with no tags:
    //   * c9, c10
    customersA.c1 = (await db.customer.create({
      data: { clientId: clientAId, name: "A1_Eligible", phone: `${PHONE_PREFIX_A}01`, tags: ["batch2"], optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c2 = (await db.customer.create({
      data: { clientId: clientAId, name: "A2_Eligible", phone: `${PHONE_PREFIX_A}02`, tags: ["batch2", "vip"], optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c3 = (await db.customer.create({
      data: { clientId: clientAId, name: "A3_Unreachable", phone: `${PHONE_PREFIX_A}03`, tags: ["batch2"], unreachable: true, optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c4 = (await db.customer.create({
      data: { clientId: clientAId, name: "A4_OptedOut", phone: `${PHONE_PREFIX_A}04`, tags: ["batch2"], optedOut: true, optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c5 = (await db.customer.create({
      data: { clientId: clientAId, name: "A5_Deleted", phone: `${PHONE_PREFIX_A}05`, tags: ["batch2"], deletedAt: new Date(), optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c6 = (await db.customer.create({
      data: { clientId: clientAId, name: "A6_Batch1", phone: `${PHONE_PREFIX_A}06`, tags: ["batch1"], optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c7 = (await db.customer.create({
      data: { clientId: clientAId, name: "A7_Batch1", phone: `${PHONE_PREFIX_A}07`, tags: ["batch1", "vip"], optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c8 = (await db.customer.create({
      data: { clientId: clientAId, name: "A8_Batch1", phone: `${PHONE_PREFIX_A}08`, tags: ["batch1"], optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c9 = (await db.customer.create({
      data: { clientId: clientAId, name: "A9_NoTags", phone: `${PHONE_PREFIX_A}09`, tags: [], optInAt: new Date(), optInSource: "Import" },
    })).id;

    customersA.c10 = (await db.customer.create({
      data: { clientId: clientAId, name: "A10_NoTags", phone: `${PHONE_PREFIX_A}10`, tags: [], optInAt: new Date(), optInSource: "Import" },
    })).id;

    // 3. In Client B, create a customer with tag "batch2" to verify tenant isolation
    customersB.c1 = (await db.customer.create({
      data: { clientId: clientBId, name: "B1_Batch2", phone: `${PHONE_PREFIX_B}01`, tags: ["batch2"], optInAt: new Date(), optInSource: "Import" },
    })).id;

    // 4. Create a saved audience in Client A
    const savedAud = await db.audience.create({
      data: {
        clientId: clientAId,
        name: "VIP Tagged",
        filter: { tags: ["vip"] },
      },
    });
    audienceId = savedAud.id;
  });

  after(async () => {
    await db.audience.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } });
    await db.customer.deleteMany({ where: { clientId: { in: [clientAId, clientBId] } } });
    await db.client.deleteMany({ where: { id: { in: [clientAId, clientBId] } } });
  });

  test("1. Everyone mode (null/empty tag) returns null customerIds for tenant-wide scoping", async () => {
    const idsNull = await audienceTagCustomerIds(clientAId, null);
    assert.equal(idsNull, null, "null tag returns null (indicating full tenant scoping)");

    const idsEmpty = await audienceTagCustomerIds(clientAId, "");
    assert.equal(idsEmpty, null, "empty string returns null (indicating full tenant scoping)");

    const idsWhitespace = await audienceTagCustomerIds(clientAId, "   ");
    assert.equal(idsWhitespace, null, "whitespace returns null");

    // Full tenant summary covers all customers in Client A (10 customers created)
    const summary = await segmentSummary(clientAId);
    assert.equal(summary.totals.customers, 10, "full tenant summary has 10 customers");
  });

  test("2. Legacy single tag (e.g. 'batch2') returns all active customers with that tag", async () => {
    const ids = await audienceTagCustomerIds(clientAId, "batch2");
    assert.ok(Array.isArray(ids));
    // Should include c1, c2, c3, c4 (4 active customers). c5 is soft-deleted so excluded.
    assert.equal(ids.length, 4);
    assert.ok(ids.includes(customersA.c1));
    assert.ok(ids.includes(customersA.c2));
    assert.ok(ids.includes(customersA.c3));
    assert.ok(ids.includes(customersA.c4));
    assert.ok(!ids.includes(customersA.c5), "soft deleted customer excluded");
    assert.ok(!ids.includes(customersB.c1), "tenant isolation: Client B customer never included");

    // Scoped segmentSummary calculates exact numbers for batch2
    const summary = await segmentSummary(clientAId, { customerIds: ids });
    assert.equal(summary.totals.customers, 4);
    assert.equal(summary.totals.eligible, 2, "c1 and c2 are eligible");
    assert.equal(summary.totals.unreachable, 1, "c3 is unreachable");
    assert.equal(summary.totals.optedOut, 1, "c4 is opted out");
    assert.equal(summary.totals.eligible + summary.totals.unreachable + summary.totals.optedOut + summary.totals.paused, summary.totals.customers);
  });

  test("3. Modern JSON tag picker (TAGS_PREFIX) scopes accurately", async () => {
    // Single tag via modern format
    const tagJson = encodeTags({ match: "any", tags: ["batch2"] });
    const ids = await audienceTagCustomerIds(clientAId, tagJson);
    assert.ok(Array.isArray(ids));
    assert.equal(ids.length, 4);

    // Multi-tag match 'any' (batch2 OR batch1) -> 4 from batch2 + 3 from batch1 = 7
    const anyTagJson = `${TAGS_PREFIX}${JSON.stringify({ match: "any", tags: ["batch2", "batch1"] })}`;
    const idsAny = await audienceTagCustomerIds(clientAId, anyTagJson);
    assert.ok(Array.isArray(idsAny));
    assert.equal(idsAny.length, 7);

    // Multi-tag match 'all' (batch2 AND vip) -> c2 only
    const allTagJson = `${TAGS_PREFIX}${JSON.stringify({ match: "all", tags: ["batch2", "vip"] })}`;
    const idsAll = await audienceTagCustomerIds(clientAId, allTagJson);
    assert.ok(Array.isArray(idsAll));
    assert.equal(idsAll.length, 1);
    assert.equal(idsAll[0], customersA.c2);
  });

  test("4. Empty tag selection returns [] and gives 0 for all segment counts", async () => {
    const emptyJson = `${TAGS_PREFIX}${JSON.stringify({ match: "any", tags: [] })}`;
    const ids = await audienceTagCustomerIds(clientAId, emptyJson);
    assert.ok(Array.isArray(ids));
    assert.equal(ids.length, 0, "empty tags returns empty array []");

    const summary = await segmentSummary(clientAId, { customerIds: ids });
    assert.equal(summary.totals.customers, 0);
    assert.equal(summary.totals.eligible, 0);
    assert.equal(summary.totals.unreachable, 0);
    assert.equal(summary.totals.paused, 0);
    assert.equal(summary.totals.optedOut, 0);
  });

  test("5. Saved audience scoping (aud:<id>) resolves correctly", async () => {
    const ids = await audienceTagCustomerIds(clientAId, `aud:${audienceId}`);
    assert.ok(Array.isArray(ids));
    // VIP tagged and eligible (optedOut: false, unreachable: false) -> c2 (batch2+vip) and c7 (batch1+vip)
    assert.equal(ids.length, 2);
    assert.ok(ids.includes(customersA.c2));
    assert.ok(ids.includes(customersA.c7));

    // Non-existent audience ID returns empty array []
    const idsFake = await audienceTagCustomerIds(clientAId, "aud:fake-non-existent-id");
    assert.ok(Array.isArray(idsFake));
    assert.equal(idsFake.length, 0);
  });

  test("6. Dispatcher safety: campaignAudienceWhere with empty tags never falls back to everyone", async () => {
    const emptyJson = `${TAGS_PREFIX}${JSON.stringify({ match: "any", tags: [] })}`;
    const where = await campaignAudienceWhere(clientAId, emptyJson);
    const count = await db.customer.count({ where });
    assert.equal(count, 0, "empty tag selection must NEVER match any customers or fall back to everyone");
  });

  test("7. Tenant isolation: cross-tenant tag queries never leak customer records", async () => {
    const idsA = await audienceTagCustomerIds(clientAId, "batch2");
    const idsB = await audienceTagCustomerIds(clientBId, "batch2");

    assert.equal(idsA?.length, 4);
    assert.equal(idsB?.length, 1);
    assert.equal(idsB?.[0], customersB.c1);

    // No ID overlap between tenants
    const overlap = idsA?.filter((id) => idsB?.includes(id)) ?? [];
    assert.equal(overlap.length, 0, "strictly 0 cross-tenant customer ID overlap");
  });
});
