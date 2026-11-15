import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { authUrl, getPublicOrigin, readState, redirectUri, signState } from "../../src/lib/gsheet/google";
import { canUseGoogleSheets } from "../../src/lib/subscription";

describe("Google Sheets Entitlement and OAuth Architecture", () => {
  let businessClientId: string;
  let starterClientId: string;
  let growthClientId: string;
  let unmanagedClientId: string;

  before(async () => {
    // 1. Business Plan Client (Entitled)
    const biz = await db.client.create({
      data: {
        name: "QA Biz Plan Store",
        planRequired: true,
        planPurchases: {
          create: {
            plan: "business",
            cycle: "m",
            status: "VERIFIED",
            startsAt: new Date(Date.now() - 10000),
            endsAt: new Date(Date.now() + 30 * 86400000),
            amountPaise: 499900,
          },
        },
      },
    });
    businessClientId = biz.id;

    // 2. Starter Plan Client (Not Entitled)
    const starter = await db.client.create({
      data: {
        name: "QA Starter Plan Store",
        planRequired: true,
        planPurchases: {
          create: {
            plan: "starter",
            cycle: "m",
            status: "VERIFIED",
            startsAt: new Date(Date.now() - 10000),
            endsAt: new Date(Date.now() + 30 * 86400000),
            amountPaise: 119900,
          },
        },
      },
    });
    starterClientId = starter.id;

    // 3. Growth Plan Client (Not Entitled)
    const growth = await db.client.create({
      data: {
        name: "QA Growth Plan Store",
        planRequired: true,
        planPurchases: {
          create: {
            plan: "growth",
            cycle: "m",
            status: "VERIFIED",
            startsAt: new Date(Date.now() - 10000),
            endsAt: new Date(Date.now() + 30 * 86400000),
            amountPaise: 299900,
          },
        },
      },
    });
    growthClientId = growth.id;

    // 4. Unmanaged Client (Legacy / Pre-plan)
    const unmanaged = await db.client.create({
      data: {
        name: "QA Unmanaged Legacy Store",
        planRequired: false,
      },
    });
    unmanagedClientId = unmanaged.id;
  });

  after(async () => {
    await db.client.deleteMany({
      where: {
        id: { in: [businessClientId, starterClientId, growthClientId, unmanagedClientId] },
      },
    });
  });

  test("1. Business plan has entitlement to Google Sheets live sync", async () => {
    const ent = await canUseGoogleSheets(businessClientId);
    assert.equal(ent.allowed, true, "Business plan must be allowed to connect Google Sheets");
    assert.equal(ent.planKey, "business");
  });

  test("2. Starter plan is blocked from Google Sheets live sync", async () => {
    const ent = await canUseGoogleSheets(starterClientId);
    assert.equal(ent.allowed, false, "Starter plan must not be allowed to connect Google Sheets");
    assert.equal(ent.planKey, "starter");
    assert.match(ent.reason || "", /Business plan/i, "Reason must explain that Business plan is required");
  });

  test("3. Growth plan is blocked from Google Sheets live sync", async () => {
    const ent = await canUseGoogleSheets(growthClientId);
    assert.equal(ent.allowed, false, "Growth plan must not be allowed to connect Google Sheets");
    assert.equal(ent.planKey, "growth");
    assert.match(ent.reason || "", /Business plan/i, "Reason must explain that Business plan is required");
  });

  test("4. Unmanaged legacy client is allowed without plan restriction", async () => {
    const ent = await canUseGoogleSheets(unmanagedClientId);
    assert.equal(ent.allowed, true, "Unmanaged legacy client should be allowed");
    assert.equal(ent.planKey, null);
  });

  test("5. OAuth redirectUri resolves to console-registered /api/google/sheets/callback", () => {
    delete process.env.GOOGLE_SHEETS_REDIRECT_URI;
    const uri = redirectUri("https://www.thabaal.in");
    assert.equal(uri, "https://www.thabaal.in/api/google/sheets/callback");
  });

  test("6. GOOGLE_SHEETS_REDIRECT_URI environment variable takes absolute precedence", () => {
    process.env.GOOGLE_SHEETS_REDIRECT_URI = "https://www.thabaal.in/api/google/sheets/callback";
    const uri = redirectUri("http://localhost:3000");
    assert.equal(uri, "https://www.thabaal.in/api/google/sheets/callback", "Explicit env redirect URI must take precedence");
    delete process.env.GOOGLE_SHEETS_REDIRECT_URI;
  });

  test("7. getPublicOrigin extracts reverse-proxy headers without localhost leak in production", () => {
    delete process.env.PUBLIC_URL;
    delete process.env.GOOGLE_SHEETS_REDIRECT_URI;
    const oldEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    // Reverse proxy headers sent by Caddy
    const req = new Request("http://127.0.0.1:3000/api/google/sheets/connect", {
      headers: {
        host: "www.thabaal.in",
        "x-forwarded-host": "www.thabaal.in",
        "x-forwarded-proto": "https",
      },
    });

    const origin = getPublicOrigin(req);
    assert.equal(origin, "https://www.thabaal.in");
    assert.equal(redirectUri(req), "https://www.thabaal.in/api/google/sheets/callback");

    // Internal localhost request in production falls back to canonical domain, never leaking localhost
    const internalReq = new Request("http://127.0.0.1:3000/api/google/sheets/connect", {
      headers: {
        host: "localhost:3000",
      },
    });
    const fallbackOrigin = getPublicOrigin(internalReq);
    assert.equal(fallbackOrigin, "https://www.thabaal.in");

    (process.env as Record<string, string | undefined>).NODE_ENV = oldEnv;
  });

  test("8. OAuth authUrl requests least-privilege drive.file scope and includes registered redirect", () => {
    process.env.GOOGLE_CLIENT_ID = "1017152537553-qs5hthfd7666jirijurr0be83bqg3iik.apps.googleusercontent.com";
    const state = signState({ clientId: businessClientId, userId: "user-123" });
    const url = authUrl("https://www.thabaal.in", state);
    const u = new URL(url);

    assert.equal(u.searchParams.get("client_id"), "1017152537553-qs5hthfd7666jirijurr0be83bqg3iik.apps.googleusercontent.com");
    assert.equal(u.searchParams.get("redirect_uri"), "https://www.thabaal.in/api/google/sheets/callback");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("access_type"), "offline");
    assert.equal(u.searchParams.get("prompt"), "consent");
    assert.equal(u.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/drive.file");
  });

  test("9. State signing and tampering validation works", () => {
    const state = signState({ clientId: businessClientId, userId: "user-456" });
    const decoded = readState(state);
    assert.ok(decoded);
    assert.equal(decoded.clientId, businessClientId);
    assert.equal(decoded.userId, "user-456");

    // Tampered state
    const tampered = state.slice(0, -3) + "xyz";
    assert.equal(readState(tampered), null, "Tampered state must be rejected");

    // Expired state
    const expiredState = signState({ clientId: businessClientId, userId: "user-456" }, Date.now() - 20 * 60_000);
    assert.equal(readState(expiredState), null, "Expired state must be rejected");
  });

  test("10. Tenant isolation: each client has independent SheetLink and SheetLog records", async () => {
    // Connect sheet for Business Client
    await db.sheetLink.create({
      data: {
        clientId: businessClientId,
        googleEmail: "biz@example.com",
        spreadsheetId: "sheet-biz-123",
        status: "connected",
      },
    });

    await db.sheetLog.create({
      data: {
        clientId: businessClientId,
        event: "Google Sheet connected",
        details: "Google account biz@example.com",
      },
    });

    // Check that Starter Client has NO SheetLink and NO SheetLogs
    const starterLink = await db.sheetLink.findUnique({ where: { clientId: starterClientId } });
    const starterLogs = await db.sheetLog.findMany({ where: { clientId: starterClientId } });
    assert.equal(starterLink, null, "Starter client must have no SheetLink");
    assert.equal(starterLogs.length, 0, "Starter client must see 0 SheetLogs");

    // Business client has its own SheetLink and SheetLog
    const bizLink = await db.sheetLink.findUnique({ where: { clientId: businessClientId } });
    const bizLogs = await db.sheetLog.findMany({ where: { clientId: businessClientId } });
    assert.ok(bizLink);
    assert.equal(bizLink.spreadsheetId, "sheet-biz-123");
    assert.equal(bizLogs.length, 1);

    // Clean up
    await db.sheetLog.deleteMany({ where: { clientId: businessClientId } });
    await db.sheetLink.deleteMany({ where: { clientId: businessClientId } });
  });
});
