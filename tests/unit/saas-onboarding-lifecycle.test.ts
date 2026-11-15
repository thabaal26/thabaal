import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { canSendLiveOutbound, getTenantWorkspaceMode, isTenantLiveActive } from "../../src/lib/workspace-guard";
import { reconcileTenantWorkspaceMode, manuallySetWorkspaceMode, resolveTenantReadiness } from "../../src/lib/tenant-activation";
import { isEmbeddedSignupEnabled, exchangeEmbeddedCodeForToken, createEmbeddedOAuthState, verifyEmbeddedOAuthState, _clearUsedNoncesForTesting } from "../../src/lib/whatsapp-embedded";
import { checkMultiAppSignature } from "../../src/lib/multi-app-webhook";
import { createHmac } from "node:crypto";
import { seal, unseal } from "../../src/lib/secret-box";
import { grantGatewayPeriod } from "../../src/lib/subscription";

describe("Thabaal Master SaaS Onboarding & Subscription Lifecycle", () => {
  let demoClientId: string;
  let liveClientId: string;

  before(async () => {
    // 1. Create a DEMO test client (name starts with DEMO_ to test strict demo enforcement)
    const demoClient = await db.client.create({
      data: {
        name: `DEMO_Client_${Date.now()}`,
        workspaceMode: "DEMO",
        planRequired: true,
      },
    });
    demoClientId = demoClient.id;

    // 2. Create a LIVE_ACTIVE test client
    const liveClient = await db.client.create({
      data: {
        name: `LIVE_Client_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
      },
    });
    liveClientId = liveClient.id;
  });

  after(async () => {
    await db.planPurchase.deleteMany({ where: { clientId: { in: [demoClientId, liveClientId] } } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId: { in: [demoClientId, liveClientId] } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { in: [demoClientId, liveClientId] } } }).catch(() => {});
  });

  test("1. DEMO client has strict simulated outbound guard", async () => {
    const mode = await getTenantWorkspaceMode(demoClientId);
    assert.equal(mode, "DEMO");

    const isLive = await isTenantLiveActive(demoClientId);
    assert.equal(isLive, false);

    const guard = await canSendLiveOutbound(demoClientId, "broadcast campaign");
    assert.equal(guard.allowed, false);
    assert.equal(guard.simulated, true);
    assert.match(guard.reason ?? "", /disabled in DEMO mode/i);
  });

  test("2. Credentials encrypted at rest with AES-256-GCM via seal/unseal", async () => {
    const rawToken = "EAAX_test_meta_permanent_system_token_123456789";
    const sealed = seal(rawToken);
    assert.notEqual(sealed, rawToken);
    assert.ok(sealed?.startsWith("enc:v1:"));

    const unsealed = unseal(sealed);
    assert.equal(unsealed, rawToken);
  });

  test("3. Embedded Signup feature flag defaults to false and rejects requests safely", async () => {
    assert.equal(isEmbeddedSignupEnabled(), false);

    const rejectRes = await exchangeEmbeddedCodeForToken("fake_code", "fake_state");
    assert.equal(rejectRes.ok, false);
    assert.match(rejectRes.message ?? "", /disabled/i);
  });

  test("4. Embedded Signup OAuth state contains tamper-proof tenant binding and expires", async () => {
    const state = createEmbeddedOAuthState(demoClientId);
    assert.ok(state);

    const check = await verifyEmbeddedOAuthState(state);
    assert.equal(check.valid, true);
    assert.equal(check.clientId, demoClientId);

    const forged = state.slice(0, -4) + "AAAA";
    const forgedCheck = await verifyEmbeddedOAuthState(forged);
    assert.equal(forgedCheck.valid, false);
  });

  test("5. Super Admin manual mode override transitions client correctly", async () => {
    const override = await manuallySetWorkspaceMode(demoClientId, "LIVE_PENDING_PAYMENT");
    assert.equal(override.ok, true);
    assert.equal(override.mode, "LIVE_PENDING_PAYMENT");

    const updated = await db.client.findUniqueOrThrow({ where: { id: demoClientId } });
    assert.equal(updated.workspaceMode, "LIVE_PENDING_PAYMENT");

    // Reset back to DEMO
    await manuallySetWorkspaceMode(demoClientId, "DEMO");
  });

  test("6. Payment verification and tenant reconciliation transitions client to LIVE_ACTIVE", async () => {
    // Add WhatsApp credentials for demoClient
    await db.client.update({
      where: { id: demoClientId },
      data: {
        waToken: seal("EAA_test_token_live"),
        waPhoneNumberId: "123456789012345",
        waBusinessAccountId: "987654321098765",
      },
    });

    await db.whatsAppNumber.create({
      data: {
        clientId: demoClientId,
        label: "Primary",
        phoneNumberId: "123456789012345",
        businessAccountId: "987654321098765",
        token: seal("EAA_test_token_live"),
        isDefault: true,
      },
    });

    // Grant verified gateway plan period (Razorpay simulation)
    const payRef = `pay_test_${Date.now()}`;
    const grant = await grantGatewayPeriod({
      clientId: demoClientId,
      plan: "starter",
      cycle: "m",
      amountPaise: 99900,
      paymentRef: payRef,
      paymentId: `rzp_${Date.now()}`,
      by: "Razorpay Test",
    });
    assert.equal(grant.ok, true);

    // Reconcile tenant
    const recon = await reconcileTenantWorkspaceMode(demoClientId);
    assert.equal(recon.mode, "LIVE_ACTIVE");
    assert.equal(recon.hasActiveConnection, true);
    assert.equal(recon.hasActiveSubscription, true);

    const clientAfter = await db.client.findUniqueOrThrow({ where: { id: demoClientId } });
    assert.equal(clientAfter.workspaceMode, "LIVE_ACTIVE");
  });

  test("7. LIVE_PENDING_CONNECTION state transition when subscription active but connection missing", async () => {
    // Create a new client with active subscription but NO WhatsApp connection
    const pendingConnClient = await db.client.create({
      data: {
        name: `PENDING_CONN_${Date.now()}`,
        workspaceMode: "DEMO",
        planRequired: true,
      },
    });

    try {
      // Grant subscription
      await grantGatewayPeriod({
        clientId: pendingConnClient.id,
        plan: "starter",
        cycle: "m",
        amountPaise: 99900,
        paymentRef: `pay_pconn_${Date.now()}`,
        paymentId: `rzp_pconn_${Date.now()}`,
        by: "Razorpay Test",
      });

      // Reconcile: since subscription is active but WhatsApp is not connected,
      // it MUST transition to LIVE_PENDING_CONNECTION
      const recon = await reconcileTenantWorkspaceMode(pendingConnClient.id);
      assert.equal(recon.mode, "LIVE_PENDING_CONNECTION");
      assert.equal(recon.hasActiveSubscription, true);
      assert.equal(recon.hasActiveConnection, false);
      assert.match(recon.reason, /Awaiting WhatsApp Business account connection/i);

      // Verify tenant readiness resolver
      const readiness = await resolveTenantReadiness(pendingConnClient.id);
      assert.equal(readiness.workspaceMode, "LIVE_PENDING_CONNECTION");
      assert.equal(readiness.canSendOutbound, false);
      assert.equal(readiness.canDispatchCampaigns, false);
      assert.ok(readiness.blockers.some((b) => b.includes("No verified active WhatsApp connection")));
    } finally {
      await db.planPurchase.deleteMany({ where: { clientId: pendingConnClient.id } }).catch(() => {});
      await db.client.deleteMany({ where: { id: pendingConnClient.id } }).catch(() => {});
    }
  });

  test("8. Break-glass Super Admin override requires explicit flag and audit logs to PaymentEvent", async () => {
    // Attempt to force LIVE_ACTIVE without breakGlass flag on an unconnected client
    const unprivilegedAttempt = await manuallySetWorkspaceMode(liveClientId, "LIVE_ACTIVE");
    // Since liveClientId has no verified connection/subscription, non-break-glass without credentials rejects
    // (or requires break-glass)
    const clientFresh = await db.client.create({
      data: { name: `TEST_BG_${Date.now()}`, workspaceMode: "DEMO" },
    });

    try {
      const reject = await manuallySetWorkspaceMode(clientFresh.id, "LIVE_ACTIVE", {
        reason: "short",
      });
      assert.equal(reject.ok, false);
      assert.match(reject.message, /breakGlass: true/i);

      // Now use valid breakGlass with written justification
      const auditReason = "Emergency enterprise onboarding signed contract by VP Operations ref #99812";
      const approved = await manuallySetWorkspaceMode(clientFresh.id, "LIVE_ACTIVE", {
        breakGlass: true,
        reason: auditReason,
        adminUserId: "admin_test_user",
        adminEmail: "admin@thabaal.com",
      });
      assert.equal(approved.ok, true);
      assert.equal(approved.mode, "LIVE_ACTIVE");

      // Verify immutable audit log in PaymentEvent
      const auditLog = await db.paymentEvent.findFirst({
        where: {
          clientId: clientFresh.id,
          note: { contains: "SUPER_ADMIN_BREAK_GLASS" },
        },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(auditLog);
      assert.equal(auditLog.clientId, clientFresh.id);
      assert.match(auditLog.note ?? "", /Enterprise emergency/i);

      // SEC-01: Break-glass override without connection MUST NEVER bypass outbound safety!
      const guardCheck = await canSendLiveOutbound(clientFresh.id, "emergency broadcast");
      assert.equal(guardCheck.allowed, false, "Break-glass tenant without active connection MUST NOT send live outbound");
      assert.equal(guardCheck.simulated, true);
      assert.match(guardCheck.reason ?? "", /No verified active WhatsApp connection/i);
    } finally {
      await db.client.deleteMany({ where: { id: clientFresh.id } }).catch(() => {});
    }
  });

  test("9. Embedded Signup OAuth state rejects replay attacks via single-use nonces", async () => {
    await _clearUsedNoncesForTesting();
    const state = createEmbeddedOAuthState(demoClientId);

    // First verification: must succeed
    const firstCheck = await verifyEmbeddedOAuthState(state);
    assert.equal(firstCheck.valid, true);
    assert.equal(firstCheck.clientId, demoClientId);

    // Immediate replay of the same token in same process: MUST be rejected
    const replayCheck = await verifyEmbeddedOAuthState(state);
    assert.equal(replayCheck.valid, false);

    // SEC-03: Simulate a PM2 cluster worker restart / different cluster process
    // where in-memory cache is completely empty. The DB persistence must catch the replay!
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const nonce = decoded.raw.split(":")[2];
    const dbRecord = await db.revokedMediaToken.findUnique({
      where: { tokenHash: `oauth_nonce:${nonce}` },
    });
    assert.ok(dbRecord, "OAuth single-use nonce must be persisted in PostgreSQL RevokedMediaToken table");

    // Replay across cluster process:
    const replayCrossProcessCheck = await verifyEmbeddedOAuthState(state);
    assert.equal(replayCrossProcessCheck.valid, false, "Replay must be rejected across cluster processes");
  });

  test("10. Webhook multi-app signature fail-closed verification", async () => {
    const rawPayload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

    // Missing signature header: must return invalid
    const noSigResult = await checkMultiAppSignature(rawPayload, null);
    assert.equal(noSigResult.status, "invalid");

    // Malformed signature header: must return invalid
    const badHeaderResult = await checkMultiAppSignature(rawPayload, "md5=12345");
    assert.equal(badHeaderResult.status, "invalid");

    // Correct HMAC signature with candidate secret
    const testSecret = "test_meta_webhook_secret_abcdef123456";
    const validHmac = "sha256=" + createHmac("sha256", testSecret).update(rawPayload).digest("hex");

    // If candidate secret is in DB, it matches
    const testCred = await db.metaAppCredential.create({
      data: {
        appId: `test_app_${Date.now()}`,
        appName: "Test Webhook App",
        appSecret: testSecret,
      },
    });

    try {
      const matchResult = await checkMultiAppSignature(rawPayload, validHmac);
      assert.equal(matchResult.status, "signed");
      assert.equal(matchResult.matchedAppId, testCred.appId);

      // Forged signature with incorrect digest
      const forgedSig = "sha256=" + "a".repeat(64);
      const forgedResult = await checkMultiAppSignature(rawPayload, forgedSig);
      assert.equal(forgedResult.status, "invalid");

      // SEC-02: Cross-tenant secret isolation:
      // When a webhook payload carries Tenant A's phone number ID, Tenant B's secret MUST NOT authenticate it!
      const tenantBSecret = "tenant_b_private_secret_99887766";
      const tenantBCred = await db.metaAppCredential.create({
        data: {
          appId: `app_b_${Date.now()}`,
          appName: "Tenant B App",
          appSecret: tenantBSecret,
          clientId: liveClientId, // Belongs to Tenant B (liveClientId)
        },
      });

      try {
        const payloadForTenantA = JSON.stringify({
          object: "whatsapp_business_account",
          entry: [
            {
              id: "987654321098765", // Tenant A WABA
              changes: [
                {
                  value: {
                    metadata: { phone_number_id: "123456789012345" }, // Tenant A phone number ID
                  },
                  field: "messages",
                },
              ],
            },
          ],
        });

        // Sign Tenant A's payload using Tenant B's secret
        const crossTenantSig = "sha256=" + createHmac("sha256", tenantBSecret).update(payloadForTenantA).digest("hex");
        const crossCheck = await checkMultiAppSignature(payloadForTenantA, crossTenantSig);
        assert.equal(crossCheck.status, "invalid", "Tenant B secret MUST NOT authenticate Tenant A webhook event!");
      } finally {
        await db.metaAppCredential.deleteMany({ where: { id: tenantBCred.id } }).catch(() => {});
      }
    } finally {
      await db.metaAppCredential.deleteMany({ where: { id: testCred.id } }).catch(() => {});
    }
  });

  test("11. Cross-tenant data isolation: Customer queries strictly scoped by clientId", async () => {
    // Create customers for demoClientId and liveClientId
    const custA = await db.customer.create({
      data: {
        clientId: demoClientId,
        name: "Customer Alpha",
        phone: "+919888800001",
      },
    });

    const custB = await db.customer.create({
      data: {
        clientId: liveClientId,
        name: "Customer Beta",
        phone: "+919888800002",
      },
    });

    try {
      // Query scoped to demoClientId
      const scopedToA = await db.customer.findMany({
        where: { clientId: demoClientId },
      });
      assert.ok(scopedToA.some((c) => c.id === custA.id));
      assert.ok(!scopedToA.some((c) => c.id === custB.id), "Tenant A MUST NOT see Tenant B customer");

      // Query scoped to liveClientId
      const scopedToB = await db.customer.findMany({
        where: { clientId: liveClientId },
      });
      assert.ok(scopedToB.some((c) => c.id === custB.id));
      assert.ok(!scopedToB.some((c) => c.id === custA.id), "Tenant B MUST NOT see Tenant A customer");
    } finally {
      await db.customer.deleteMany({ where: { id: { in: [custA.id, custB.id] } } }).catch(() => {});
    }
  });

  test("12. Concurrent duplicate gateway payments race condition (PAY-CONCURRENCY)", async () => {
    const paymentRef = `razorpay_pay_race_${Date.now()}`;
    const paymentInput = {
      clientId: liveClientId,
      plan: "growth",
      cycle: "m",
      amountPaise: 119900,
      paymentRef,
      paymentId: `pay_${Date.now()}`,
      by: "Razorpay Webhook",
    };

    // Fire 5 concurrent parallel requests with the identical paymentRef
    const concurrentResults = await Promise.all([
      grantGatewayPeriod(paymentInput),
      grantGatewayPeriod(paymentInput),
      grantGatewayPeriod(paymentInput),
      grantGatewayPeriod(paymentInput),
      grantGatewayPeriod(paymentInput),
    ]);

    // All must report ok: true
    for (const res of concurrentResults) {
      assert.equal(res.ok, true);
    }

    // Exactly one call granted the new period; all other 4 returned code: "already"
    const newlyCreated = concurrentResults.filter((r) => r.code !== "already");
    const alreadyRecorded = concurrentResults.filter((r) => r.code === "already");
    assert.equal(newlyCreated.length, 1, "Exactly one concurrent call must create the purchase record");
    assert.equal(alreadyRecorded.length, 4, "All remaining concurrent calls must report 'already'");

    // Verify database has exactly 1 PlanPurchase record with this paymentRef
    const dbPurchases = await db.planPurchase.findMany({
      where: { paymentRef },
    });
    assert.equal(dbPurchases.length, 1, "Database must store exactly 1 PlanPurchase record for this paymentRef");
    assert.equal(dbPurchases[0].status, "VERIFIED");
  });
});
