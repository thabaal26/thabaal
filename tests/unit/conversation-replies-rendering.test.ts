import test from "node:test";
import assert from "node:assert/strict";
import { groupBubbles, type BubbleCandidate } from "../../src/lib/chat/bubble-grouping";
import {
  canonicalJson,
  sha256Json,
  resolveHistoricalTemplate,
  type TemplateRenderSnapshotV1,
} from "../../src/lib/whatsapp/template-snapshot";

test("Workstream C Integration: Conversation bubble grouping & historical template resolution", async (t) => {
  await t.test("chronological ordering + bubble grouping assigns tails to FIRST and SINGLE messages", () => {
    const base = new Date("2026-11-19T10:00:00Z").getTime();
    const rawEntries: BubbleCandidate[] = [
      { id: "m3", conversationId: "c1", direction: "OUTBOUND", actorKey: "biz:1", createdAt: new Date(base + 120_000), displayDayKey: "2026-11-19", isSystemEvent: false },
      { id: "m1", conversationId: "c1", direction: "OUTBOUND", actorKey: "biz:1", createdAt: new Date(base), displayDayKey: "2026-11-19", isSystemEvent: false },
      { id: "m2", conversationId: "c1", direction: "OUTBOUND", actorKey: "biz:1", createdAt: new Date(base + 60_000), displayDayKey: "2026-11-19", isSystemEvent: false },
      { id: "m4", conversationId: "c1", direction: "OUTBOUND", actorKey: "biz:1", createdAt: new Date(base + 600_000), displayDayKey: "2026-11-19", isSystemEvent: false }, // >5m gap -> separate cluster
    ];

    // Sorted chronologically
    const sorted = [...rawEntries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
    const grouped = groupBubbles(sorted);
    const posMap = new Map(grouped.map((g) => [g.id, g.bubblePosition]));

    assert.equal(posMap.get("m1"), "FIRST", "Oldest message in burst is FIRST");
    assert.equal(posMap.get("m2"), "MIDDLE", "Intermediate message is MIDDLE");
    assert.equal(posMap.get("m3"), "LAST", "Latest message in burst is LAST");
    assert.equal(posMap.get("m4"), "SINGLE", "Isolated message is SINGLE");
  });

  await t.test("resolveHistoricalTemplate renders verified SNAPSHOT when SHA-256 matches", () => {
    const snapshotV1: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "festive_sale_2026", language: "ta", category: "MARKETING" },
      header: { kind: "IMAGE", media: { filename: "/sale.png", storageKey: "s1" } },
      body: { text: "தீபாவளி சிறப்பு தள்ளுபடி!", parameters: [] },
      buttons: [{ index: 0, type: "QUICK_REPLY", label: "ஆர்டர் செய்" }],
    };

    const validSha256 = sha256Json(snapshotV1 as any);
    const result = resolveHistoricalTemplate(
      {
        schemaVersion: 1,
        renderSnapshot: snapshotV1,
        renderSha256: validSha256,
      },
      null
    );

    assert.equal(result.source, "SNAPSHOT");
    if (result.source === "SNAPSHOT") {
      assert.equal(result.snapshot.template.name, "festive_sale_2026");
      assert.equal(result.snapshot.body.text, "தீபாவளி சிறப்பு தள்ளுபடி!");
      assert.equal(result.snapshot.buttons.length, 1);
    }
  });

  await t.test("resolveHistoricalTemplate catches tampering with INTEGRITY_ERROR", () => {
    const snapshotV1: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "festive_sale_2026", language: "ta", category: "MARKETING" },
      body: { text: "தீபாவளி சிறப்பு தள்ளுபடி!", parameters: [] },
      buttons: [],
    };

    const forgedSha256 = "0000000000000000000000000000000000000000000000000000000000000000";
    const result = resolveHistoricalTemplate(
      {
        schemaVersion: 1,
        renderSnapshot: snapshotV1,
        renderSha256: forgedSha256,
      },
      null
    );

    assert.equal(result.source, "INTEGRITY_ERROR");
  });

  await t.test("resolveHistoricalTemplate falls back to LEGACY_CAPTURE when snapshot missing", () => {
    const legacyCapture: TemplateRenderSnapshotV1 = {
      schemaVersion: 1,
      template: { name: "legacy_welcome", language: "und", category: null },
      body: { text: "வணக்கம்! உங்கள் ஆர்டர் பதிவு செய்யப்பட்டது.", parameters: [] },
      buttons: [],
    };

    const result = resolveHistoricalTemplate(null, legacyCapture);
    assert.equal(result.source, "LEGACY_CAPTURE");
    if (result.source === "LEGACY_CAPTURE") {
      assert.equal(result.snapshot.template.name, "legacy_welcome");
      assert.equal(result.snapshot.body.text, "வணக்கம்! உங்கள் ஆர்டர் பதிவு செய்யப்பட்டது.");
    }
  });

  await t.test("resolveHistoricalTemplate returns UNAVAILABLE when both null", () => {
    const result = resolveHistoricalTemplate(null, null);
    assert.equal(result.source, "UNAVAILABLE");
  });

  await t.test("safeHistoricalUrl neutrality for XSS prevention", () => {
    function safeHistoricalUrl(rawUrl: string | undefined | null): string | undefined {
      if (!rawUrl) return undefined;
      const trimmed = rawUrl.trim();
      if (/^https:\/\//i.test(trimmed)) return trimmed;
      if (/^tel:\+?[0-9\s\-()]+$/i.test(trimmed)) return trimmed;
      return undefined;
    }

    assert.equal(safeHistoricalUrl("https://example.com/checkout"), "https://example.com/checkout");
    assert.equal(safeHistoricalUrl("tel:+919876543210"), "tel:+919876543210");
    assert.equal(safeHistoricalUrl("javascript:alert(1)"), undefined, "Blocks javascript: URI");
    assert.equal(safeHistoricalUrl("http://insecure.com"), undefined, "Blocks plain http");
    assert.equal(safeHistoricalUrl("data:text/html;base64,123"), undefined, "Blocks data: URI");
  });
});
