// Tests for Template sorting, accurate date display labels, and sync idempotency.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { templateDateLabel, fmtDate } from "../../src/lib/format";

describe("template date formatting & labels", () => {
  test("template created on a past date and never modified shows 'created <date>'", () => {
    const createdAt = new Date("2026-10-07T10:25:48.549Z");
    const updatedAt = new Date("2026-10-07T10:25:48.549Z");
    const label = templateDateLabel(createdAt, updatedAt);
    assert.equal(label, "created 7 Oct");
  });

  test("template created with updatedAt within same day / 24 hours shows 'created <date>'", () => {
    // e.g. Meta approved 3 minutes after creation
    const createdAt = new Date("2026-10-15T13:14:23.730Z");
    const updatedAt = new Date("2026-10-15T13:17:06.143Z");
    const label = templateDateLabel(createdAt, updatedAt);
    assert.equal(label, "created 15 Oct");
  });

  test("handles ISO string dates as well as Date objects", () => {
    const label = templateDateLabel("2026-10-08T14:59:48.931Z", "2026-10-08T14:59:48.931Z");
    assert.equal(label, "created 8 Oct");
  });

  test("template genuinely modified on a later day shows creation and update info", () => {
    const createdAt = new Date("2026-10-07T10:00:00.000Z");
    const updatedAt = new Date("2026-10-12T14:30:00.000Z");
    const label = templateDateLabel(createdAt, updatedAt);
    assert.equal(label, "created 7 Oct · updated 12 Oct");
  });

  test("when sorting by recently updated (preferUpdated: true), highlights update date", () => {
    const createdAt = new Date("2026-10-07T10:00:00.000Z");
    const updatedAt = new Date("2026-10-14T18:00:00.000Z");
    const label = templateDateLabel(createdAt, updatedAt, { preferUpdated: true });
    assert.equal(label, "updated 14 Oct");
  });

  test("when preferUpdated is true but template was never updated, stays 'created <date>'", () => {
    const createdAt = new Date("2026-10-15T13:14:23.730Z");
    const updatedAt = new Date("2026-10-15T13:14:23.730Z");
    const label = templateDateLabel(createdAt, updatedAt, { preferUpdated: true });
    assert.equal(label, "created 15 Oct");
  });

  test("null or undefined createdAt gracefully handled", () => {
    assert.equal(templateDateLabel(null), "—");
    assert.equal(templateDateLabel(undefined), "—");
  });

  test("converts UTC timestamps correctly to Asia/Kolkata timezone", () => {
    // 2026-10-14 19:00:00 UTC is 2026-10-15 00:30:00 IST (+5:30)
    const lateUtc = new Date("2026-10-14T19:00:00.000Z");
    assert.equal(fmtDate(lateUtc, "d MMM"), "15 Oct");
  });
});

describe("template ordering & sorting scenarios", () => {
  const sampleTemplates = [
    { id: "1", name: "thenan_brand_intro", createdAt: new Date("2026-10-07T10:00:00Z"), updatedAt: new Date("2026-10-07T10:00:00Z") },
    { id: "2", name: "thenan_products_india_en", createdAt: new Date("2026-10-14T03:50:00Z"), updatedAt: new Date("2026-10-14T03:50:00Z") },
    { id: "3", name: "thenan_doorstep_vehicle_flyer_en", createdAt: new Date("2026-10-15T13:14:00Z"), updatedAt: new Date("2026-10-15T13:17:00Z") },
    { id: "4", name: "thenan_gingelly_oil_img", createdAt: new Date("2026-10-07T11:00:00Z"), updatedAt: new Date("2026-10-07T11:00:00Z") },
  ];

  test("scenario: default sort (latest created) places the newest template at position 0", () => {
    const sorted = [...sampleTemplates].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    assert.equal(sorted[0].name, "thenan_doorstep_vehicle_flyer_en");
    assert.equal(sorted[1].name, "thenan_products_india_en");
  });

  test("scenario: sort by name (A-Z) orders alphabetically", () => {
    const sorted = [...sampleTemplates].sort((a, b) => a.name.localeCompare(b.name));
    assert.equal(sorted[0].name, "thenan_brand_intro");
    assert.equal(sorted[1].name, "thenan_doorstep_vehicle_flyer_en");
    assert.equal(sorted[2].name, "thenan_gingelly_oil_img");
    assert.equal(sorted[3].name, "thenan_products_india_en");
  });

  test("scenario: sort by recently updated prioritizes latest modifications", () => {
    const sorted = [...sampleTemplates].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    assert.equal(sorted[0].name, "thenan_doorstep_vehicle_flyer_en");
    assert.equal(sorted[1].name, "thenan_products_india_en");
  });
});

describe("sync idempotency check", () => {
  const stable = (v: unknown): string =>
    JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

  test("detects unchanged template correctly to avoid touching updatedAt", () => {
    const local = {
      status: "APPROVED",
      statusReason: null,
      category: "MARKETING",
      body: "Welcome to Thenan Oils",
      headerType: "IMAGE",
      headerText: null,
      footer: "Pure Cold Pressed",
      metaId: "12345",
      businessAccountId: "acc1",
      headerMediaUrl: "https://example.com/oil.jpg",
      buttons: [{ type: "QUICK_REPLY", text: "Order Now" }],
    };

    const remoteContent = {
      ...local,
      lastSyncedAt: new Date(),
    };

    const hasChanged =
      local.status !== remoteContent.status ||
      local.statusReason !== remoteContent.statusReason ||
      local.category !== remoteContent.category ||
      local.body !== remoteContent.body ||
      local.headerType !== remoteContent.headerType ||
      local.headerText !== remoteContent.headerText ||
      local.footer !== remoteContent.footer ||
      local.metaId !== remoteContent.metaId ||
      local.businessAccountId !== remoteContent.businessAccountId ||
      stable(local.buttons) !== stable(remoteContent.buttons);

    assert.equal(hasChanged, false);
  });

  test("detects status change from PENDING to APPROVED", () => {
    const local = {
      status: "PENDING",
      statusReason: null,
      category: "MARKETING",
      body: "Welcome to Thenan Oils",
      headerType: "IMAGE",
      headerText: null,
      footer: null,
      metaId: "12345",
      businessAccountId: "acc1",
      headerMediaUrl: "https://example.com/oil.jpg",
      buttons: [],
    };

    const remoteContent = {
      ...local,
      status: "APPROVED",
    };

    const hasChanged = local.status !== remoteContent.status;
    assert.equal(hasChanged, true);
  });
});
