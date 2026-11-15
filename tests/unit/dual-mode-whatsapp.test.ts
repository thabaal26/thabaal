import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { seal, unseal } from "@/lib/secret-box";
import {
  maskSecret,
  resolveTenantConnection,
  getWaConfigForClient,
} from "@/lib/whatsapp-connection-provider";
import {
  checkMultiAppSignature,
  verifyWebhookToken,
  safeEqual,
} from "@/lib/multi-app-webhook";
import {
  isEmbeddedSignupEnabled,
  createEmbeddedOAuthState,
  verifyEmbeddedOAuthState,
  exchangeEmbeddedCodeForToken,
  getPlatformMetaConfig,
} from "@/lib/whatsapp-embedded";
import {
  validateMetaAppInput,
  validateWabaAccess,
} from "@/lib/whatsapp-connection-validation";

test("Dual-Mode WhatsApp Onboarding Architecture & Security", async (t) => {
  // Test isolation cleanup
  const cleanTestEntities = async () => {
    await db.whatsAppNumber.deleteMany({
      where: { phoneNumberId: { in: ["test_phone_tenant_a", "test_phone_tenant_b", "test_phone_legacy_01"] } },
    }).catch(() => {});
    await db.whatsAppConnection.deleteMany({
      where: { wabaId: { in: ["waba_tenant_a", "waba_tenant_b", "waba_legacy_01"] } },
    }).catch(() => {});
    await db.metaAppCredential.deleteMany({
      where: { appId: { in: ["app_tenant_a", "app_tenant_b", "app_platform_01"] } },
    }).catch(() => {});
    await db.client.deleteMany({
      where: { id: { in: ["tenant_test_a", "tenant_test_b", "tenant_legacy_test"] } },
    }).catch(() => {});
  };

  await cleanTestEntities();

  await t.test("1. Credential Encryption & Masking at Rest", async () => {
    const rawSecret = "0123456789abcdef0123456789abcdef";
    const rawToken = "EAABtest_token_secret_1234567890";

    // Secret masking guarantees
    assert.equal(maskSecret(rawSecret), "01••••••••cdef");
    assert.equal(maskSecret(rawToken), "EA••••••••7890");
    assert.equal(maskSecret(null), "—");
    assert.equal(maskSecret("short"), "••••••••");

    // AES-256-GCM authenticated encryption round-trip
    const sealedSecret = seal(rawSecret);
    assert.ok(sealedSecret && sealedSecret.startsWith("enc:v1:"), "Must use enc:v1: prefix");
    const unsealedSecret = unseal(sealedSecret);
    assert.equal(unsealedSecret, rawSecret, "Unsealed secret must match original");

    // Tampering authentication tag check
    const tampered = sealedSecret.slice(0, -4) + "AAAA";
    assert.equal(unseal(tampered), null, "Tampered ciphertext must fail authentication and return null");
  });

  await t.test("2. Input Validation (Meta App & WABA)", async () => {
    // Valid App ID and 32-char hex secret
    const validApp = await validateMetaAppInput("1633333557630357", "b15001d71a3a0702b52030327e34debf");
    assert.equal(validApp.ok, true);

    // Invalid non-numeric App ID
    const invalidId = await validateMetaAppInput("not_an_id", "b15001d71a3a0702b52030327e34debf");
    assert.equal(invalidId.ok, false);
    assert.match(invalidId.message!, /numeric/i);

    // Invalid non-hex App Secret
    const invalidSecret = await validateMetaAppInput("1633333557630357", "not-a-hex-secret!");
    assert.equal(invalidSecret.ok, false);
    assert.match(invalidSecret.message!, /hexadecimal/i);

    // Invalid token format
    const invalidToken = await validateWabaAccess("1465822505685652", "invalid_token_prefix");
    assert.equal(invalidToken.ok, false);
    assert.match(invalidToken.message!, /start with 'EA'/i);
  });

  await t.test("3. Multi-Tenant Isolation & Credential Separation", async () => {
    // Create Tenant A
    const tenantA = await db.client.create({
      data: { id: "tenant_test_a", name: "Tenant Test A Corp" },
    });
    const appA = await db.metaAppCredential.create({
      data: {
        appId: "app_tenant_a",
        appName: "Tenant A App",
        appSecret: "aaaa111122223333aaaa111122223333",
        verifyToken: "verify_token_tenant_a",
        clientId: tenantA.id,
      },
    });
    const connA = await db.whatsAppConnection.create({
      data: {
        clientId: tenantA.id,
        appCredentialId: appA.id,
        wabaId: "waba_tenant_a",
        token: "EAATenantAToken1234567890",
        status: "ACTIVE",
        webhookSubscribed: true,
      },
    });
    await db.whatsAppNumber.create({
      data: {
        clientId: tenantA.id,
        connectionId: connA.id,
        label: "Tenant A Main",
        phoneNumberId: "test_phone_tenant_a",
        businessAccountId: "waba_tenant_a",
        displayPhone: "+91 99999 11111",
        isDefault: true,
      },
    });

    // Create Tenant B
    const tenantB = await db.client.create({
      data: { id: "tenant_test_b", name: "Tenant Test B Corp" },
    });
    const appB = await db.metaAppCredential.create({
      data: {
        appId: "app_tenant_b",
        appName: "Tenant B App",
        appSecret: "bbbb111122223333bbbb111122223333",
        verifyToken: "verify_token_tenant_b",
        clientId: tenantB.id,
      },
    });
    const connB = await db.whatsAppConnection.create({
      data: {
        clientId: tenantB.id,
        appCredentialId: appB.id,
        wabaId: "waba_tenant_b",
        token: "EAATenantBToken1234567890",
        status: "ACTIVE",
        webhookSubscribed: true,
      },
    });
    await db.whatsAppNumber.create({
      data: {
        clientId: tenantB.id,
        connectionId: connB.id,
        label: "Tenant B Main",
        phoneNumberId: "test_phone_tenant_b",
        businessAccountId: "waba_tenant_b",
        displayPhone: "+91 99999 22222",
        isDefault: true,
      },
    });

    // Resolve Tenant A
    const resA = await resolveTenantConnection(tenantA.id);
    assert.ok(resA);
    assert.equal(resA.clientId, tenantA.id);
    assert.equal(resA.wabaId, "waba_tenant_a");
    assert.equal(resA.appId, "app_tenant_a");
    assert.equal(resA.appSecret, "aaaa111122223333aaaa111122223333");
    assert.equal(resA.token, "EAATenantAToken1234567890");

    // Resolve Tenant B
    const resB = await resolveTenantConnection(tenantB.id);
    assert.ok(resB);
    assert.equal(resB.clientId, tenantB.id);
    assert.equal(resB.wabaId, "waba_tenant_b");
    assert.equal(resB.appId, "app_tenant_b");
    assert.equal(resB.appSecret, "bbbb111122223333bbbb111122223333");
    assert.equal(resB.token, "EAATenantBToken1234567890");

    // Strict Cross-tenant non-leakage
    assert.notEqual(resA.token, resB.token);
    assert.notEqual(resA.appSecret, resB.appSecret);
    assert.notEqual(resA.wabaId, resB.wabaId);

    // Provider WaConfig check
    const cfgA = await getWaConfigForClient(tenantA.id);
    assert.equal(cfgA.live, true);
    assert.equal(cfgA.clientId, tenantA.id);
    assert.equal(cfgA.phoneNumberId, "test_phone_tenant_a");
    assert.equal(cfgA.wabaId, "waba_tenant_a");
  });

  await t.test("4. Multi-App Webhook Verification & Routing", async () => {
    const rawPayloadA = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "waba_tenant_a", changes: [{ field: "messages", value: { metadata: { phone_number_id: "test_phone_tenant_a" } } }] }],
    });
    const rawPayloadB = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "waba_tenant_b", changes: [{ field: "messages", value: { metadata: { phone_number_id: "test_phone_tenant_b" } } }] }],
    });

    // 1. Signature from App A with App A's Secret
    const sigA = "sha256=" + createHmac("sha256", "aaaa111122223333aaaa111122223333").update(rawPayloadA).digest("hex");
    const checkA = await checkMultiAppSignature(rawPayloadA, sigA);
    assert.equal(checkA.status, "signed");
    if (checkA.status === "signed") {
      assert.equal(checkA.matchedAppId, "app_tenant_a");
    }

    // 2. Signature from App B with App B's Secret
    const sigB = "sha256=" + createHmac("sha256", "bbbb111122223333bbbb111122223333").update(rawPayloadB).digest("hex");
    const checkB = await checkMultiAppSignature(rawPayloadB, sigB);
    assert.equal(checkB.status, "signed");
    if (checkB.status === "signed") {
      assert.equal(checkB.matchedAppId, "app_tenant_b");
    }

    // 3. Forged or Mismatched Signature (App B secret signing App A's payload)
    const forgedSig = "sha256=" + createHmac("sha256", "wrong_attacker_secret_1234567890").update(rawPayloadA).digest("hex");
    const checkForged = await checkMultiAppSignature(rawPayloadA, forgedSig);
    assert.equal(checkForged.status, "invalid", "Forged signature must be rejected");

    // 4. Missing or malformed header
    const checkMissing = await checkMultiAppSignature(rawPayloadA, "malformed-header-without-sha256");
    assert.equal(checkMissing.status, "invalid");

    // 5. GET Webhook Handshake Verification
    assert.equal(await verifyWebhookToken("verify_token_tenant_a"), true);
    assert.equal(await verifyWebhookToken("verify_token_tenant_b"), true);
    assert.equal(await verifyWebhookToken("completely_unknown_token"), false);
  });

  await t.test("5. Backward Compatibility (Legacy Client.waToken Fallback)", async () => {
    // Create Legacy Client without WhatsAppConnection record (mimicking Thenan Oils / historical DB state)
    const legacyClient = await db.client.create({
      data: {
        id: "tenant_legacy_test",
        name: "Legacy Oils Store",
        waToken: "EAALegacyClientToken987654321",
        waBusinessAccountId: "waba_legacy_01",
        waPhoneNumberId: "test_phone_legacy_01",
      },
    });
    await db.whatsAppNumber.create({
      data: {
        clientId: legacyClient.id,
        label: "Legacy Main",
        phoneNumberId: "test_phone_legacy_01",
        businessAccountId: "waba_legacy_01",
        displayPhone: "+91 94444 33333",
        isDefault: true,
      },
    });

    const resLegacy = await resolveTenantConnection(legacyClient.id);
    assert.ok(resLegacy);
    assert.equal(resLegacy.clientId, legacyClient.id);
    assert.equal(resLegacy.wabaId, "waba_legacy_01");
    assert.equal(resLegacy.token, "EAALegacyClientToken987654321");
    assert.equal(resLegacy.defaultPhoneNumberId, "test_phone_legacy_01");

    const cfgLegacy = await getWaConfigForClient(legacyClient.id);
    assert.equal(cfgLegacy.live, true);
    assert.equal(cfgLegacy.phoneNumberId, "test_phone_legacy_01");
    assert.equal(cfgLegacy.wabaId, "waba_legacy_01");
  });

  await t.test("6. Meta Embedded Signup Feature Flag & OAuth State Security", async () => {
    // 1. By default, Embedded Signup is disabled
    assert.equal(isEmbeddedSignupEnabled(), false, "Embedded signup must default to disabled");

    const config = getPlatformMetaConfig();
    assert.equal(config.enabled, false);

    // 2. Disabled feature flag blocks code exchange
    const blockedExchange = await exchangeEmbeddedCodeForToken("dummy_code", "dummy_state");
    assert.equal(blockedExchange.ok, false);
    assert.match(blockedExchange.message!, /disabled pending official Meta Tech Provider/i);

    // 3. OAuth State generation and CSRF protection
    const stateA = createEmbeddedOAuthState("tenant_test_a");
    assert.ok(stateA);

    const verifiedState = await verifyEmbeddedOAuthState(stateA);
    assert.equal(verifiedState.valid, true);
    assert.equal(verifiedState.clientId, "tenant_test_a");

    // Tampered state signature
    const tamperedState = stateA.slice(0, -6) + "xxxxxx";
    assert.equal((await verifyEmbeddedOAuthState(tamperedState)).valid, false);
  });

  // Final cleanup of test records
  await cleanTestEntities();
});
