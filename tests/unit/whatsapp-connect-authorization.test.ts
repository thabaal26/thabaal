import { test } from "node:test";
import assert from "node:assert/strict";
import { queryWabaPhoneNumbers } from "../../src/lib/whatsapp-connection-validation";

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
});
