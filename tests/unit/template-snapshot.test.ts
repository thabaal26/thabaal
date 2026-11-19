import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  sha256Json,
  isTemplateRenderSnapshotV1,
  resolveHistoricalTemplate,
  type TemplateRenderSnapshotV1,
  type JsonValue,
} from "../../src/lib/whatsapp/template-snapshot";

test("WhatsApp Template Snapshot & Historical Integrity Suite", async (t) => {
  await t.test("1. canonicalJson sorts keys recursively while preserving array order", () => {
    const objA = { z: 1, a: { y: "hello", b: true }, list: [3, 2, 1] };
    const objB = { a: { b: true, y: "hello" }, z: 1, list: [3, 2, 1] };

    const jsonA = canonicalJson(objA as JsonValue);
    const jsonB = canonicalJson(objB as JsonValue);

    assert.equal(jsonA, jsonB);
    assert.equal(jsonA, '{"a":{"b":true,"y":"hello"},"list":[3,2,1],"z":1}');
  });

  await t.test("2. sha256Json produces identical cryptographic hash regardless of key insertion order", () => {
    const payload1 = { to: "+919876543210", template: { name: "festive_offer", language: { code: "en" } } };
    const payload2 = { template: { language: { code: "en" }, name: "festive_offer" }, to: "+919876543210" };

    const hash1 = sha256Json(payload1 as JsonValue);
    const hash2 = sha256Json(payload2 as JsonValue);

    assert.equal(hash1, hash2);
    assert.equal(typeof hash1, "string");
    assert.equal(hash1.length, 64);
  });

  await t.test("3. isTemplateRenderSnapshotV1 validates structural contracts", () => {
    const valid: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "oil_order", language: "ta", category: "MARKETING" },
      body: {
        text: "வணக்கம் Priya, உங்கள் ஆயில் தயார்.",
        parameters: [{ index: 0, type: "text", resolvedValue: "Priya" }],
      },
      buttons: [
        { index: 0, type: "QUICK_REPLY", label: "இப்போதே ஆர்டர் செய்" },
      ],
    };

    assert.equal(isTemplateRenderSnapshotV1(valid), true);

    // Corrupted snapshots
    assert.equal(isTemplateRenderSnapshotV1(null), false);
    assert.equal(isTemplateRenderSnapshotV1({ ...valid, schemaVersion: 2 }), false);
    assert.equal(isTemplateRenderSnapshotV1({ ...valid, body: null }), false);
    assert.equal(isTemplateRenderSnapshotV1({ ...valid, buttons: "invalid" }), false);
  });

  await t.test("4. resolveHistoricalTemplate returns SNAPSHOT with exact content when integrity hash matches", () => {
    const snapshot: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "welcome_pack", language: "en", category: "UTILITY" },
      header: { kind: "IMAGE", media: { filename: "welcome.jpg", providerMediaId: "media_123" } },
      body: { text: "Welcome to Thenan Oils!", parameters: [] },
      footer: { text: "Madurai cold-pressed" },
      buttons: [{ index: 0, type: "URL", label: "Visit Shop", resolvedUrl: "https://thenan.in" }],
    };

    const hash = sha256Json(snapshot as unknown as JsonValue);
    const stored = {
      schemaVersion: 1,
      renderSnapshot: snapshot as unknown as JsonValue,
      renderSha256: hash,
    };

    const res = resolveHistoricalTemplate(stored, null);
    assert.equal(res.source, "SNAPSHOT");
    if (res.source === "SNAPSHOT") {
      assert.deepEqual(res.snapshot, snapshot);
    }
  });

  await t.test("5. resolveHistoricalTemplate returns INTEGRITY_ERROR if hash tampering or mismatch detected", () => {
    const snapshot: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "tampered_tmpl", language: "en", category: null },
      body: { text: "Legitimate text", parameters: [] },
      buttons: [],
    };

    const stored = {
      schemaVersion: 1,
      renderSnapshot: snapshot as unknown as JsonValue,
      renderSha256: "0000000000000000000000000000000000000000000000000000000000000000", // Tampered hash
    };

    const res = resolveHistoricalTemplate(stored, null);
    assert.equal(res.source, "INTEGRITY_ERROR");
  });

  await t.test("6. resolveHistoricalTemplate falls back to LEGACY_CAPTURE when snapshot is absent", () => {
    const legacy: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "legacy_message", language: "en", category: null },
      body: { text: "Historical pre-snapshot text message", parameters: [] },
      buttons: [],
    };

    const res = resolveHistoricalTemplate(null, legacy);
    assert.equal(res.source, "LEGACY_CAPTURE");
    if (res.source === "LEGACY_CAPTURE") {
      assert.equal(res.snapshot.body.text, "Historical pre-snapshot text message");
    }
  });

  await t.test("7. resolveHistoricalTemplate returns UNAVAILABLE when neither snapshot nor legacy capture exists", () => {
    const res = resolveHistoricalTemplate(null, null);
    assert.equal(res.source, "UNAVAILABLE");
  });

  await t.test("8. GOLD-STANDARD ACCEPTANCE TEST: Current template modification does NOT alter historical render", () => {
    // Phase 1: Original message sent under v1 template definition
    const originalTemplateDefinition = {
      name: "order_confirmation",
      language: "en",
      body: "Hello {{1}}, your order #{{2}} is received. Total: ₹{{3}}",
      buttons: [{ type: "URL", text: "Track Order", url: "https://thabaal.in/track/{{2}}" }],
    };

    const resolvedHistoricalSnapshot: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "order_confirmation", language: "en", category: "UTILITY" },
      body: {
        text: "Hello Stephan, your order #RG-1001 is received. Total: ₹550",
        parameters: [
          { index: 1, type: "text", resolvedValue: "Stephan" },
          { index: 2, type: "text", resolvedValue: "RG-1001" },
          { index: 3, type: "text", resolvedValue: "550" },
        ],
      },
      buttons: [
        { index: 0, type: "URL", label: "Track Order", resolvedUrl: "https://thabaal.in/track/RG-1001" },
      ],
    };

    const hash = sha256Json(resolvedHistoricalSnapshot as unknown as JsonValue);
    const persistedSnapshot = {
      schemaVersion: 1,
      renderSnapshot: resolvedHistoricalSnapshot as unknown as JsonValue,
      renderSha256: hash,
    };

    // Phase 2: Administrator or Meta synchronizes a modified template definition (v2)
    // Buttons removed, body wording completely changed, language changed
    const mutatedCurrentTemplateDefinition = {
      name: "order_confirmation",
      language: "en",
      body: "We have cancelled and restructured our orders format completely.",
      buttons: [], // All buttons deleted in current template
    };

    // Sanity check: Current definition is visibly different from original
    assert.notEqual(mutatedCurrentTemplateDefinition.body, originalTemplateDefinition.body);
    assert.equal(mutatedCurrentTemplateDefinition.buttons.length, 0);

    // Phase 3: Conversation view re-opens historical conversation
    // It must resolve from the persisted snapshot and IGNORE the mutated current definition
    const historicalResult = resolveHistoricalTemplate(persistedSnapshot, null);
    assert.equal(historicalResult.source, "SNAPSHOT");

    if (historicalResult.source === "SNAPSHOT") {
      // Historical message retains the exact body and button from send time!
      assert.equal(
        historicalResult.snapshot.body.text,
        "Hello Stephan, your order #RG-1001 is received. Total: ₹550"
      );
      assert.equal(historicalResult.snapshot.buttons.length, 1);
      assert.equal(historicalResult.snapshot.buttons[0].label, "Track Order");
      assert.equal(
        historicalResult.snapshot.buttons[0].resolvedUrl,
        "https://thabaal.in/track/RG-1001"
      );
    }
  });
});
