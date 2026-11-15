import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { normalizeGraphVersion } from "./graph-version";
import { maskSecret } from "./whatsapp-connection-provider";

/**
 * Feature flag for Meta Tech Provider Embedded Signup.
 * Defaults strictly to false until official Tech Provider access is verified.
 */
export function isEmbeddedSignupEnabled(): boolean {
  return process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "true";
}

export interface PlatformMetaConfig {
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  enabled: boolean;
}

export function getPlatformMetaConfig(): PlatformMetaConfig {
  const appId = process.env.META_PLATFORM_APP_ID?.trim() || process.env.META_APP_ID?.trim() || null;
  const configId = process.env.META_SIGNUP_CONFIG_ID?.trim() || null;
  const graphVersion = normalizeGraphVersion();
  const enabled = isEmbeddedSignupEnabled();

  return { appId, configId, graphVersion, enabled };
}

function getOAuthSigningSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.DATA_ENC_KEY || process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET or DATA_ENC_KEY must be configured in production for OAuth state security.");
    }
    return "ephemeral_dev_state_secret_thabaal";
  }
  return secret;
}

// In-memory single-use nonce tracker with 15-minute TTL
const usedNonces = new Map<string, number>();

function pruneExpiredNonces(now: number) {
  for (const [nonce, expiresAt] of usedNonces.entries()) {
    if (expiresAt <= now) {
      usedNonces.delete(nonce);
    }
  }
}

/** Exported strictly for automated test teardown/isolation */
export async function _clearUsedNoncesForTesting(): Promise<void> {
  usedNonces.clear();
  try {
    await db.revokedMediaToken.deleteMany({
      where: { tokenHash: { startsWith: "oauth_nonce:" } },
    });
  } catch {}
}

/**
 * Generates a tamper-proof signed OAuth state string binding the tenant (clientId)
 * to prevent CSRF and cross-tenant hijacking during Embedded Signup.
 */
export function createEmbeddedOAuthState(clientId: string): string {
  const secret = getOAuthSigningSecret();
  const nonce = randomBytes(16).toString("hex");
  const ts = Date.now().toString();
  const raw = `${clientId}:${ts}:${nonce}`;
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  return Buffer.from(JSON.stringify({ raw, sig })).toString("base64url");
}

/**
 * Validates the OAuth state returned in the Embedded Signup callback.
 * Ensures the state has not expired (15-minute window), was signed by this server,
 * and has not been replayed.
 *
 * Persists single-use nonces atomically to PostgreSQL (RevokedMediaToken) to guarantee
 * replay protection across PM2 clusters and server restarts.
 */
export async function verifyEmbeddedOAuthState(stateString: string): Promise<{ valid: boolean; clientId?: string }> {
  try {
    const secret = getOAuthSigningSecret();
    const decoded = JSON.parse(Buffer.from(stateString, "base64url").toString("utf8"));
    const { raw, sig } = decoded;

    const expectedSig = createHmac("sha256", secret).update(raw).digest("hex");
    const bufExpected = Buffer.from(expectedSig, "hex");
    const bufGiven = Buffer.from(sig, "hex");

    if (bufExpected.length !== bufGiven.length || !timingSafeEqual(bufExpected, bufGiven)) {
      return { valid: false };
    }

    const parts = raw.split(":");
    if (parts.length < 3) {
      return { valid: false };
    }
    const [clientId, tsStr, nonce] = parts;
    const ts = parseInt(tsStr, 10);
    if (isNaN(ts)) {
      return { valid: false };
    }

    const now = Date.now();
    // 15-minute expiry window, allow up to 1-minute future clock skew
    if (now - ts > 15 * 60 * 1000 || ts > now + 60 * 1000) {
      return { valid: false };
    }

    // Fast-path in-memory replay check
    pruneExpiredNonces(now);
    if (usedNonces.has(nonce)) {
      return { valid: false };
    }

    // Atomic database-backed replay protection across multi-process PM2 cluster instances
    try {
      const expiresAt = new Date(ts + 15 * 60 * 1000);
      await db.revokedMediaToken.create({
        data: {
          tokenHash: `oauth_nonce:${nonce}`,
          expiresAt,
          clientId: clientId || null,
          reason: "Embedded Signup OAuth nonce consumption",
        },
      });
    } catch {
      // Unique constraint violation means this nonce was already consumed in another process!
      return { valid: false };
    }

    // Record nonce in local process cache
    usedNonces.set(nonce, ts + 15 * 60 * 1000);

    return { valid: true, clientId };
  } catch {
    return { valid: false };
  }
}

export interface ExchangeCodeResult {
  ok: boolean;
  message?: string;
  connectionId?: string;
}

/**
 * Exchanges the authorization code received from Meta Embedded Signup for a permanent access token.
 * Strictly gated behind the feature flag.
 */
export async function exchangeEmbeddedCodeForToken(
  code: string,
  state: string,
): Promise<ExchangeCodeResult> {
  if (!isEmbeddedSignupEnabled()) {
    return {
      ok: false,
      message: "Meta Embedded Signup is currently disabled pending official Meta Tech Provider verification.",
    };
  }

  const stateCheck = await verifyEmbeddedOAuthState(state);
  if (!stateCheck.valid || !stateCheck.clientId) {
    return { ok: false, message: "Invalid or expired OAuth state parameter (CSRF protection failed)." };
  }

  const clientId = stateCheck.clientId;
  const config = getPlatformMetaConfig();
  const platformSecret = process.env.META_PLATFORM_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim();

  if (!config.appId || !platformSecret) {
    return { ok: false, message: "Platform Meta credentials are not configured on the server." };
  }

  try {
    // Exchange code for access token via Graph API oauth/access_token
    const url = `https://graph.facebook.com/${config.graphVersion}/oauth/access_token?` +
      new URLSearchParams({
        client_id: config.appId,
        client_secret: platformSecret,
        code,
      }).toString();

    const tokenRes = await fetch(url, { cache: "no-store" });
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };

    if (!tokenRes.ok || !tokenJson.access_token) {
      return {
        ok: false,
        message: tokenJson.error?.message || "Failed to exchange authorization code for access token.",
      };
    }

    const accessToken = tokenJson.access_token;

    // In a full Tech Provider flow, debug_token or shared_waba gives the WABA ID
    const debugUrl = `https://graph.facebook.com/${config.graphVersion}/debug_token?input_token=${accessToken}&access_token=${config.appId}|${platformSecret}`;
    const debugRes = await fetch(debugUrl, { cache: "no-store" });
    const debugJson = (await debugRes.json().catch(() => ({}))) as {
      data?: { granular_scopes?: { target_ids?: string[] }[] };
    };

    // Extract WABA ID from granular scopes
    let wabaId = "";
    for (const scope of debugJson.data?.granular_scopes ?? []) {
      if (scope.target_ids && scope.target_ids.length > 0) {
        wabaId = scope.target_ids[0];
        break;
      }
    }

    if (!wabaId) {
      return {
        ok: false,
        message: "Could not identify the WhatsApp Business Account ID from the granted token scopes.",
      };
    }

    // Upsert or retrieve Platform MetaAppCredential
    const platformApp = await db.metaAppCredential.upsert({
      where: { appId: config.appId },
      create: {
        appId: config.appId,
        appName: "Thabaal Platform App",
        appSecret: platformSecret,
        isPlatformApp: true,
      },
      update: {
        appSecret: platformSecret,
        isPlatformApp: true,
      },
    });

    // Save WhatsAppConnection for this client
    const connection = await db.whatsAppConnection.upsert({
      where: {
        clientId_wabaId: {
          clientId,
          wabaId,
        },
      },
      create: {
        clientId,
        appCredentialId: platformApp.id,
        onboardingMode: "EMBEDDED_SIGNUP",
        wabaId,
        token: accessToken,
        graphVersion: config.graphVersion,
        status: "ACTIVE",
        webhookSubscribed: true,
        lastValidatedAt: new Date(),
      },
      update: {
        appCredentialId: platformApp.id,
        onboardingMode: "EMBEDDED_SIGNUP",
        token: accessToken,
        status: "ACTIVE",
        lastValidatedAt: new Date(),
      },
    });

    return { ok: true, connectionId: connection.id };
  } catch (e) {
    return {
      ok: false,
      message: `Embedded signup token exchange failed: ${e instanceof Error ? e.message : "network error"}`,
    };
  }
}
