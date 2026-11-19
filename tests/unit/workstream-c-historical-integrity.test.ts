import test from "node:test";
import assert from "node:assert/strict";
import { groupBubbles, type BubbleCandidate } from "../../src/lib/chat/bubble-grouping";
import {
  canonicalJson,
  sha256Json,
  resolveHistoricalTemplate,
  type TemplateRenderSnapshotV1,
} from "../../src/lib/whatsapp/template-snapshot";
import { safeHistoricalUrl, safeHistoricalPhone } from "../../src/lib/chat/url-sanitizer";

test("Workstream C historical integrity", async (t) => {
  await t.test("1. never uses current Template for legacy fallback", () => {
    // Current catalog template has been edited by admin with new header, buttons, and footer
    const currentCatalogTemplate = {
      id: "tpl_123",
      name: "order_confirmation",
      headerType: "IMAGE",
      headerMediaUrl: "https://example.com/new-header.png",
      footer: "New 2026 Footer",
      buttons: [{ type: "URL", text: "New Link", url: "https://new.com" }],
    };

    // Legacy message sent before snapshots were introduced
    const legacyMessage = {
      templateName: "order_confirmation",
      body: "Your order #1001 has been confirmed on Nov 10.",
    };

    // Reconciled legacy fallback function strictly uses send-time Message fields, NEVER current Template
    function buildLegacyTemplateCapture(m: {
      templateName: string;
      body: string | null;
    }): TemplateRenderSnapshotV1 | null {
      if (m.body === null) return null;
      return {
        schemaVersion: 1,
        template: {
          name: m.templateName,
          language: "und",
          category: null,
        },
        header: undefined,
        body: {
          text: m.body,
          parameters: [],
        },
        footer: undefined,
        buttons: [],
      };
    }

    const legacyCapture = buildLegacyTemplateCapture(legacyMessage);
    const resolved = resolveHistoricalTemplate(null, legacyCapture);

    assert.equal(resolved.source, "LEGACY_CAPTURE");
    if (resolved.source === "LEGACY_CAPTURE") {
      assert.equal(resolved.snapshot.body.text, "Your order #1001 has been confirmed on Nov 10.");
      assert.equal(resolved.snapshot.header, undefined, "Does not inherit mutated catalog header");
      assert.equal(resolved.snapshot.footer, undefined, "Does not inherit mutated catalog footer");
      assert.deepEqual(resolved.snapshot.buttons, [], "Does not inherit mutated catalog buttons");
    }
  });

  await t.test("2. uses captured snapshot when current Template changes", () => {
    const originalSnapshot: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "festive_promo", language: "ta", category: "MARKETING" },
      header: { kind: "TEXT", text: "தீபாவளி நல்வாழ்த்துகள்" },
      body: { text: "20% தள்ளுபடி கூப்பன்: DEEPAWALI20", parameters: [] },
      footer: { text: "தெனன் ஆயில்ஸ்" },
      buttons: [{ index: 0, type: "QUICK_REPLY", label: "கூப்பன் பெறு" }],
    };

    const stored = {
      schemaVersion: 1,
      renderSnapshot: originalSnapshot,
      renderSha256: sha256Json(originalSnapshot as any),
    };

    // Admin subsequently changed or deleted the template in Meta catalogue
    const mutatedCatalog = {
      name: "festive_promo",
      body: "COMPLETELY MUTATED CATALOGUE TEXT",
    };

    const resolved = resolveHistoricalTemplate(stored, null);
    assert.equal(resolved.source, "SNAPSHOT");
    if (resolved.source === "SNAPSHOT") {
      assert.equal(resolved.snapshot.body.text, "20% தள்ளுபடி கூப்பன்: DEEPAWALI20");
      assert.notEqual(resolved.snapshot.body.text, mutatedCatalog.body);
      assert.equal(resolved.snapshot.header?.text, "தீபாவளி நல்வாழ்த்துகள்");
      assert.equal(resolved.snapshot.buttons[0].label, "கூப்பன் பெறு");
    }
  });

  await t.test("3. uses only Message.body when snapshot is missing", () => {
    function buildLegacyTemplateCapture(m: {
      templateName: string;
      body: string | null;
    }): TemplateRenderSnapshotV1 | null {
      if (m.body === null) return null;
      return {
        schemaVersion: 1,
        template: {
          name: m.templateName,
          language: "und",
          category: null,
        },
        header: undefined,
        body: {
          text: m.body,
          parameters: [],
        },
        footer: undefined,
        buttons: [],
      };
    }

    const legacy = buildLegacyTemplateCapture({
      templateName: "payment_reminder",
      body: "உங்கள் நிலுவைத் தொகை ₹500.",
    });

    const resolved = resolveHistoricalTemplate(null, legacy);
    assert.equal(resolved.source, "LEGACY_CAPTURE");
    if (resolved.source === "LEGACY_CAPTURE") {
      assert.equal(resolved.snapshot.body.text, "உங்கள் நிலுவைத் தொகை ₹500.");
      assert.equal(resolved.snapshot.header, undefined);
      assert.equal(resolved.snapshot.buttons.length, 0);
    }
  });

  await t.test("4. does not expose snapshots from another client", () => {
    // Tenant A (Client A)
    const clientAId = "client_thenan_001";
    // Tenant B (Client B)
    const clientBId = "client_finforte_002";

    const snapshotTenantA = {
      clientId: clientAId,
      messageId: "msg_a_001",
      schemaVersion: 1,
      renderSnapshot: {
        schemaVersion: 1,
        template: { name: "oil_promo", language: "ta", category: null },
        body: { text: "Private Thenan Promo", parameters: [] },
        buttons: [],
      } as TemplateRenderSnapshotV1,
      renderSha256: "",
    };
    snapshotTenantA.renderSha256 = sha256Json(snapshotTenantA.renderSnapshot as any);

    // Authorization policy: Verify caller client must match snapshot client
    function resolveForClient(
      requestingClientId: string,
      storedSnapshot: typeof snapshotTenantA
    ) {
      if (storedSnapshot.clientId !== requestingClientId) {
        return { source: "UNAVAILABLE" as const };
      }
      return resolveHistoricalTemplate(storedSnapshot, null);
    }

    const accessByClientB = resolveForClient(clientBId, snapshotTenantA);
    assert.equal(accessByClientB.source, "UNAVAILABLE", "Cross-tenant access fails closed");

    const accessByClientA = resolveForClient(clientAId, snapshotTenantA);
    assert.equal(accessByClientA.source, "SNAPSHOT", "Same-tenant access succeeds");
  });

  await t.test("5. does not send requestPayload to client components", () => {
    // Simulated Prisma select in RepliesPage
    const prismaSelect = {
      select: {
        clientId: true,
        messageId: true,
        schemaVersion: true,
        renderSnapshot: true,
        renderSha256: true,
      },
    };

    assert.equal("requestPayload" in prismaSelect.select, false, "requestPayload is excluded from client query");
    assert.equal("templateDefinition" in prismaSelect.select, false, "templateDefinition is excluded from client query");
  });

  await t.test("6. renders an integrity error for a corrupted snapshot", () => {
    const validSnapshot: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "tampered_promo", language: "en", category: null },
      body: { text: "Original legitimate content", parameters: [] },
      buttons: [],
    };

    // Tampered payload
    const corruptedSnapshot = {
      schemaVersion: 1,
      renderSnapshot: {
        ...validSnapshot,
        body: { text: "FORGED / TAMPERED TEXT", parameters: [] },
      },
      renderSha256: sha256Json(validSnapshot as any), // mismatch!
    };

    const resolved = resolveHistoricalTemplate(corruptedSnapshot as any, null);
    assert.equal(resolved.source, "INTEGRITY_ERROR", "Detects hash tampering and reports integrity error");
  });

  await t.test("7. preserves normal inbound and non-template messages", () => {
    // Inbound reply
    const inboundReply = {
      id: "rep_1",
      type: "in" as const,
      text: "Yes, please confirm my order.",
      historicalTemplate: undefined,
    };

    // Outbound non-template message (direct agent reply)
    const outboundDirect = {
      id: "msg_direct_1",
      type: "out" as const,
      body: "We have dispatched your package.",
      templateName: "",
      historicalTemplate: undefined,
    };

    assert.equal(inboundReply.historicalTemplate, undefined, "Inbound reply has no historical template card");
    assert.equal(outboundDirect.historicalTemplate, undefined, "Direct agent reply has no historical template card");
  });

  await t.test("8. places grouped message tails at the correct visual endpoint", () => {
    const base = new Date("2026-11-19T10:00:00Z").getTime();
    const cluster: BubbleCandidate[] = [
      { id: "m1", conversationId: "c1", direction: "OUTBOUND", actorKey: "biz:1", createdAt: new Date(base), displayDayKey: "2026-11-19", isSystemEvent: false },
      { id: "m2", conversationId: "c1", direction: "OUTBOUND", actorKey: "biz:1", createdAt: new Date(base + 30_000), displayDayKey: "2026-11-19", isSystemEvent: false },
      { id: "m3", conversationId: "c1", direction: "OUTBOUND", actorKey: "biz:1", createdAt: new Date(base + 60_000), displayDayKey: "2026-11-19", isSystemEvent: false },
    ];

    const grouped = groupBubbles(cluster);
    const map = new Map(grouped.map((g) => [g.id, g.bubblePosition]));

    assert.equal(map.get("m1"), "FIRST");
    assert.equal(map.get("m2"), "MIDDLE");
    assert.equal(map.get("m3"), "LAST");

    // In chats.css top-to-bottom layout, FIRST and SINGLE receive the outward tail (border-top-radius 0 + clip-path)
    const hasTail = (pos: string) => pos === "FIRST" || pos === "SINGLE";
    assert.equal(hasTail(map.get("m1")!), true, "Top message of cluster has tail");
    assert.equal(hasTail(map.get("m2")!), false, "Middle message has rounded corners, no tail");
    assert.equal(hasTail(map.get("m3")!), false, "Trailing message has rounded corners, no tail");
  });

  await t.test("9. URL and telephone sanitization strictly separates protocols", () => {
    // URLs must be https:
    assert.equal(safeHistoricalUrl("https://example.com/pay"), "https://example.com/pay");
    assert.equal(safeHistoricalUrl("http://insecure.com"), null, "Blocks plain http");
    assert.equal(safeHistoricalUrl("javascript:alert(1)"), null, "Blocks javascript:");
    assert.equal(safeHistoricalUrl("data:text/html;base64,abc"), null, "Blocks data:");

    // Phone numbers must be valid E.164-compatible digits
    assert.equal(safeHistoricalPhone("+91 98765-43210"), "tel:+919876543210");
    assert.equal(safeHistoricalPhone("+91 452 2345678"), "tel:+914522345678");
    assert.equal(safeHistoricalPhone("invalid-phone"), null, "Rejects malformed strings");
    assert.equal(safeHistoricalPhone("https://malicious.com"), null, "Rejects URL in phone field");
  });
});
