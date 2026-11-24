import test from "node:test";
import assert from "node:assert/strict";
import {
  submitWhatsAppEvent,
  getOrCreateWabaDataset,
  queueConversionOutbox,
  dispatchOutboxEntry,
} from "@/lib/meta-conversions";
import { db } from "@/lib/db";

test("Meta Conversions API & CTWA Outbox Architecture (Turn 74)", async (t) => {
  const testClientId = `test_client_capi_${Date.now()}`;
  const testWabaId = "1465822505685652";
  const testDatasetId = "dataset_9988776655";
  const testCtwaClid = "CTWA_CLID_AUTHENTIC_TEST_123456";

  // Clean up any prior test artifacts
  await db.metaConversionOutbox.deleteMany({
    where: { clientId: testClientId },
  });

  await t.test("1. submitWhatsAppEvent validates required fields strictly", async () => {
    // Missing datasetId
    await assert.rejects(
      submitWhatsAppEvent(
        {
          datasetId: "",
          wabaId: testWabaId,
          ctwaClid: testCtwaClid,
          eventName: "Purchase",
          eventTime: new Date(),
        },
        "EAABtesttoken"
      ),
      /Missing dataset ID/
    );

    // Missing WABA ID
    await assert.rejects(
      submitWhatsAppEvent(
        {
          datasetId: testDatasetId,
          wabaId: "",
          ctwaClid: testCtwaClid,
          eventName: "Purchase",
          eventTime: new Date(),
        },
        "EAABtesttoken"
      ),
      /Missing dataset ID/
    );

    // Missing access token
    await assert.rejects(
      submitWhatsAppEvent(
        {
          datasetId: testDatasetId,
          wabaId: testWabaId,
          ctwaClid: testCtwaClid,
          eventName: "Purchase",
          eventTime: new Date(),
        },
        ""
      ),
      /Missing Meta access token/
    );

    // Invalid currency
    await assert.rejects(
      submitWhatsAppEvent(
        {
          datasetId: testDatasetId,
          wabaId: testWabaId,
          ctwaClid: testCtwaClid,
          eventName: "Purchase",
          eventTime: new Date(),
          currency: "inr", // must be uppercase ISO
          value: 100,
        },
        "EAABtesttoken"
      ),
      /Invalid ISO currency code/
    );

    // Negative value
    await assert.rejects(
      submitWhatsAppEvent(
        {
          datasetId: testDatasetId,
          wabaId: testWabaId,
          ctwaClid: testCtwaClid,
          eventName: "Purchase",
          eventTime: new Date(),
          currency: "INR",
          value: -50,
        },
        "EAABtesttoken"
      ),
      /Invalid conversion amount/
    );
  });

  await t.test("2. queueConversionOutbox creates unique outbox entry and prevents duplicate queueing", async () => {
    const orderId = `ord_test_${Date.now()}`;

    // First queue
    const entry1 = await queueConversionOutbox({
      clientId: testClientId,
      wabaId: testWabaId,
      datasetId: testDatasetId,
      orderId,
      eventName: "Purchase",
      eventTime: new Date(),
      currency: "INR",
      value: 499.0,
    });

    assert.ok(entry1);
    assert.equal(entry1.clientId, testClientId);
    assert.equal(entry1.orderId, orderId);
    assert.equal(entry1.eventName, "Purchase");
    assert.equal(entry1.status, "PENDING");
    assert.equal(Number(entry1.value), 499.0);

    // Second queue attempt (identical orderId and eventName) -> Idempotency check
    const entry2 = await queueConversionOutbox({
      clientId: testClientId,
      wabaId: testWabaId,
      datasetId: testDatasetId,
      orderId,
      eventName: "Purchase",
      eventTime: new Date(),
      currency: "INR",
      value: 499.0,
    });

    assert.ok(entry2);
    assert.equal(entry2.id, entry1.id, "Duplicate webhook MUST return identical outbox row without re-inserting");

    // Total rows in database for this client and order must be exactly 1
    const count = await db.metaConversionOutbox.count({
      where: { clientId: testClientId, orderId },
    });
    assert.equal(count, 1, "Exactly one outbox record must exist for (clientId, orderId, eventName)");
  });

  await t.test("3. Token and PII redaction: error messages never leak access tokens", async () => {
    const leakedToken = "EAAB1234567890abcdefghijklmnopqrstuvwxyz";
    try {
      await getOrCreateWabaDataset("invalid_waba_non_digit", leakedToken);
      assert.fail("Should have thrown error");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      assert.ok(!msg.includes(leakedToken), "Access token must not appear in thrown error");
    }
  });

  await t.test("4. Outbox state transitions & missing attribution fail-safe", async () => {
    const orderId = `ord_no_clid_${Date.now()}`;

    const entry = await queueConversionOutbox({
      clientId: testClientId,
      wabaId: testWabaId,
      datasetId: testDatasetId,
      orderId,
      eventName: "Purchase",
      eventTime: new Date(),
      currency: "INR",
      value: 1200.0,
    });

    assert.ok(entry);

    // Attempt dispatch with missing CTWA clid
    const res = await dispatchOutboxEntry(entry.id, "EAABmocktoken");
    assert.equal(res.ok, false);
    assert.equal(res.reason, "Missing CTWA click identifier.");

    // Status in database should transition to PERMANENT_FAILURE without crashing
    const updated = await db.metaConversionOutbox.findUnique({
      where: { id: entry.id },
    });
    assert.ok(updated);
    assert.equal(updated.status, "PERMANENT_FAILURE");
    assert.ok(updated.lastError?.includes("Missing CTWA click identifier"));
  });

  // Clean up
  await db.metaConversionOutbox.deleteMany({
    where: { clientId: testClientId },
  });
});
