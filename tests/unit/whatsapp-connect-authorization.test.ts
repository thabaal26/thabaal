import { test } from "node:test";
import assert from "node:assert/strict";
import { queryWabaPhoneNumbers, verifyTenantWabaOnboarding, atomicReserveWabaDraft } from "../../src/lib/whatsapp-connection-validation";
import { db } from "../../src/lib/db";

test("SEC-01: WhatsApp Connect Authorization, Validation & Redaction Test Suite", async (t) => {
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test("1. Rejects invalid WABA ID format (contains letters)", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: [] }));
    };

    const result = await queryWabaPhoneNumbers("1234abc567", "valid_token");

    assert.equal(result.ok, false);
    assert.match(result.message ?? "", /Invalid WABA ID format/);
    assert.equal(fetchCalled, false, "External fetch must NOT be invoked when validation fails");
  });

  await t.test("2. Rejects invalid WABA ID format (too short, < 5 digits)", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: [] }));
    };

    const result = await queryWabaPhoneNumbers("123", "valid_token");

    assert.equal(result.ok, false);
    assert.match(result.message ?? "", /Invalid WABA ID format/);
    assert.equal(fetchCalled, false);
  });

  await t.test("3. Rejects invalid WABA ID format (too long, > 25 digits)", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: [] }));
    };

    const result = await queryWabaPhoneNumbers("1".repeat(26), "valid_token");

    assert.equal(result.ok, false);
    assert.match(result.message ?? "", /Invalid WABA ID format/);
    assert.equal(fetchCalled, false);
  });

  await t.test("4. Rejects invalid token (empty string)", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: [] }));
    };

    const result = await queryWabaPhoneNumbers("1234567890", "   ");

    assert.equal(result.ok, false);
    assert.match(result.message ?? "", /Invalid access token/);
    assert.equal(fetchCalled, false);
  });

  await t.test("5. Rejects invalid token (oversized > 4096 characters)", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: [] }));
    };

    const oversized = "A".repeat(4097);
    const result = await queryWabaPhoneNumbers("1234567890", oversized);

    assert.equal(result.ok, false);
    assert.match(result.message ?? "", /Invalid access token/);
    assert.equal(fetchCalled, false);
  });

  await t.test("6. Redacts Bearer tokens from Meta error responses", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: { message: "Invalid OAuth access token: Bearer EAAB12345secretTokenXYZ" },
        }),
        { status: 401 }
      );

    const result = await queryWabaPhoneNumbers("1234567890", "EAAB12345secretTokenXYZ");

    assert.equal(result.ok, false);
    assert.equal((result.message ?? "").includes("EAAB12345secretTokenXYZ"), false);
    assert.match(result.message ?? "", /Bearer \[REDACTED\]/);
  });

  await t.test("7. Redacts Bearer tokens even on thrown network exceptions", async () => {
    globalThis.fetch = async () => {
      throw new Error("Connection failed with Bearer EAAB12345secretTokenXYZ");
    };

    const result = await queryWabaPhoneNumbers("1234567890", "EAAB12345secretTokenXYZ");

    assert.equal(result.ok, false);
    assert.equal((result.message ?? "").includes("EAAB12345secretTokenXYZ"), false);
    assert.match(result.message ?? "", /Bearer \[REDACTED\]/);
  });

  await t.test("8. Successfully queries and maps phone numbers when valid", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "1541572859038055",
              display_phone_number: "+91 89251 91399",
              verified_name: "Finforte",
              quality_rating: "GREEN",
            },
          ],
        }),
        { status: 200 }
      );

    const result = await queryWabaPhoneNumbers("1465822505685652", "valid_meta_token", undefined, {
      lookupExisting: async () => [{ phoneNumberId: "1541572859038055", clientName: "Finforte" }],
    });

    assert.equal(result.ok, true);
    assert.equal(result.data?.length, 1);
    assert.equal(result.data![0].id, "1541572859038055");
    assert.equal(result.data![0].displayPhoneNumber, "+91 89251 91399");
    assert.equal(result.data![0].verifiedName, "Finforte");
    assert.equal(result.data![0].qualityRating, "GREEN");
    assert.equal(result.data![0].alreadyAssignedTo, "Finforte");
  });

  await t.test("9. Normalizes Graph version to default v23.0 when omitted", async () => {
    let capturedUrl = "";
    globalThis.fetch = async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ data: [{ id: "123", display_phone_number: "+123", verified_name: "Test" }] }));
    };

    const result = await queryWabaPhoneNumbers("1465822505685652", "valid_meta_token");
    assert.equal(result.ok, true);
    assert.match(capturedUrl, /^https:\/\/graph\.facebook\.com\/v23\.0\//);
  });

  await t.test("10. Returns helpful error when WABA has 0 registered numbers", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });

    const result = await queryWabaPhoneNumbers("1465822505685652", "valid_meta_token");
    assert.equal(result.ok, false);
    assert.match(result.message ?? "", /no registered phone numbers/);
  });

  await t.test("11. rejects a WABA belonging to another tenant", async () => {
    const res = await verifyTenantWabaOnboarding(
      { clientId: "client_thenan_001", wabaId: "1465822505685652", token: "valid_token" },
      {
        findActiveForeignConnection: async (waba, client) => true, // Already active under another tenant
        findTenantConnection: async () => null,
      }
    );

    assert.equal(res.ok, false);
    assert.match(res.message ?? "", /already registered or reserved by another tenant/);
  });

  await t.test("12. rejects a token without authorization for the requested WABA and prevents /phone_numbers listing", async () => {
    let authVerificationCalled = false;
    let phoneNumberListingCalled = false;

    // Distinguish initial Meta authorization verification from subsequent phone-number listing:
    const mockValidateWabaMetaAccess = async (wabaId: string, token: string) => {
      authVerificationCalled = true;
      // Meta Graph API /v23.0/<wabaId> authorization verification rejects unauthorized token
      return { ok: false, message: "OAuthException: (#10) Application does not have permission for WABA" };
    };

    const res = await verifyTenantWabaOnboarding(
      { clientId: "client_thenan_001", wabaId: "1465822505685652", token: "invalid_unauthorized_token" },
      {
        findActiveForeignConnection: async () => false,
        findTenantConnection: async () => null,
        validateWabaMetaAccess: mockValidateWabaMetaAccess,
        upsertDraftConnection: async () => {
          // If upsert was called, listing would proceed
          phoneNumberListingCalled = true;
        },
      }
    );

    assert.equal(authVerificationCalled, true, "Meta credential verification must be invoked");
    assert.equal(res.ok, false);
    assert.match(res.message ?? "", /does not have permission/);
    assert.equal(
      phoneNumberListingCalled,
      false,
      "Unauthorized tokens must NEVER reach the phone-number listing operation"
    );
  });

  await t.test("13. rejects an expired onboarding attempt", async () => {
    const pastTime = new Date(Date.now() - 45 * 60 * 1000); // 45 minutes ago (TTL is 30 mins)
    const res = await verifyTenantWabaOnboarding(
      { clientId: "client_thenan_001", wabaId: "1465822505685652", token: "valid_token" },
      {
        findActiveForeignConnection: async () => false,
        findTenantConnection: async () => ({
          id: "conn_draft_123",
          clientId: "client_thenan_001",
          wabaId: "1465822505685652",
          token: "valid_token",
          status: "DRAFT",
          lastValidatedAt: pastTime,
        }),
      }
    );

    assert.equal(res.ok, false);
    assert.match(res.message ?? "", /onboarding attempt has expired/);
  });

  await t.test("14. rejects an onboarding attempt belonging to another client", async () => {
    const res = await verifyTenantWabaOnboarding(
      { clientId: "client_thenan_001", wabaId: "1465822505685652", token: "valid_token", attemptId: "foreign_attempt_999" },
      {
        findActiveForeignConnection: async () => false,
        findTenantConnection: async () => ({
          id: "real_attempt_111",
          clientId: "client_thenan_001",
          wabaId: "1465822505685652",
          token: "valid_token",
          status: "DRAFT",
          lastValidatedAt: new Date(),
        }),
      }
    );

    assert.equal(res.ok, false);
    assert.match(res.message ?? "", /does not match/);
  });

  await t.test("15. allows a valid first-time tenant onboarding attempt without existing sender record", async () => {
    let upsertCalled = false;
    const res = await verifyTenantWabaOnboarding(
      { clientId: "client_shevest_001", wabaId: "1465822505685652", token: "valid_meta_token" },
      {
        findActiveForeignConnection: async () => false,
        findTenantConnection: async () => null, // No existing connection or sender record
        validateWabaMetaAccess: async () => ({ ok: true, data: { wabaId: "1465822505685652", name: "SheVest WABA" } }),
        upsertDraftConnection: async () => {
          upsertCalled = true;
        },
      }
    );

    assert.equal(res.ok, true);
    assert.equal(res.data?.isFirstTime, true);
    assert.equal(upsertCalled, true);
  });

  await t.test("16. rejects an onboarding attempt when another tenant has an active pending DRAFT reservation", async () => {
    const res = await verifyTenantWabaOnboarding(
      { clientId: "client_finforte_001", wabaId: "1465822505685652", token: "valid_meta_token" },
      {
        findForeignReservation: async (waba, client) => {
          // Another client (e.g. client_thenan_001) holds a pending DRAFT within TTL
          return true;
        },
        findTenantConnection: async () => null,
      }
    );

    assert.equal(res.ok, false);
    assert.match(res.message ?? "", /already registered or reserved by another tenant/);
  });

  await t.test("17. handles concurrent first-time onboarding attempts by atomically rejecting competing reservation", async () => {
    // Simulating atomic transaction rejection when another tenant won the race to reserve the WABA
    const res = await verifyTenantWabaOnboarding(
      { clientId: "client_finforte_002", wabaId: "1465822505685652", token: "valid_meta_token" },
      {
        findForeignReservation: async () => false, // Initial check passed
        findTenantConnection: async () => null,
        validateWabaMetaAccess: async () => ({ ok: true, data: { wabaId: "1465822505685652", name: "WABA" } }),
        upsertDraftConnection: async () => {
          // Transaction throws because concurrent competitor committed a reservation first
          throw new Error("WhatsApp Business Account 1465822505685652 is already registered or reserved by another tenant.");
        },
      }
    );

    assert.equal(res.ok, false);
    assert.match(res.message ?? "", /already registered or reserved by another tenant/);
  });

  await t.test("18. allows onboarding once a previous competing tenant's DRAFT attempt has expired past TTL", async () => {
    let upsertCalled = false;
    const res = await verifyTenantWabaOnboarding(
      { clientId: "client_finforte_001", wabaId: "1465822505685652", token: "valid_meta_token" },
      {
        findForeignReservation: async (waba, client) => {
          // Foreign reservation check verified that the other client's draft was older than 30 mins -> returns false
          return false;
        },
        findTenantConnection: async () => null,
        validateWabaMetaAccess: async () => ({ ok: true, data: { wabaId: "1465822505685652", name: "WABA" } }),
        upsertDraftConnection: async () => {
          upsertCalled = true;
        },
      }
    );

    assert.equal(res.ok, true);
    assert.equal(res.data?.isFirstTime, true);
    assert.equal(upsertCalled, true);
  });

  await t.test("19. real PostgreSQL concurrency: overlapping transactions for identical WABA atomically serialize via pg_advisory_xact_lock and reject competitor", async () => {
    // Only execute if real database connection is available (tests/run.mjs environment)
    if (!process.env.DATABASE_URL) return;

    const testWaba = `999${Date.now().toString().slice(-10)}`;
    const clientA = await db.client.create({ data: { name: `TenantA_${Date.now()}` } });
    const clientB = await db.client.create({ data: { name: `TenantB_${Date.now()}` } });

    try {
      // Fire two concurrent overlapping reservation attempts for the exact same WABA ID:
      const [resA, resB] = await Promise.allSettled([
        atomicReserveWabaDraft(db, clientA.id, testWaba, "token_tenant_a", "v23.0"),
        atomicReserveWabaDraft(db, clientB.id, testWaba, "token_tenant_b", "v23.0"),
      ]);

      const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
      const rejected = [resA, resB].filter((r) => r.status === "rejected");

      assert.equal(fulfilled.length, 1, "Exactly one concurrent reservation transaction must succeed");
      assert.equal(rejected.length, 1, "Competing concurrent reservation transaction must be rejected");

      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      assert.match(
        rejectedError.message,
        /already registered or reserved by another tenant/,
        "Rejected transaction must fail with foreign reservation error"
      );

      // Verify PostgreSQL database state: exactly 1 DRAFT record saved
      const saved = await db.whatsAppConnection.findMany({ where: { wabaId: testWaba } });
      assert.equal(saved.length, 1, "Database must contain exactly 1 connection record for the WABA");
      assert.equal(saved[0].status, "DRAFT");
      assert.ok(saved[0].clientId === clientA.id || saved[0].clientId === clientB.id);
    } finally {
      await db.whatsAppConnection.deleteMany({ where: { wabaId: testWaba } }).catch(() => {});
      await db.client.deleteMany({ where: { id: { in: [clientA.id, clientB.id] } } }).catch(() => {});
    }
  });
});
