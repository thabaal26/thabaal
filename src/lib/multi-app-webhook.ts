import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";

export type MultiAppSignatureResult =
  | { status: "signed"; matchedAppId?: string; source: "database" | "environment" }
  | { status: "unchecked" }
  | { status: "invalid" };

/**
 * Safely compares two strings in constant time to prevent timing attacks.
 */
export function safeEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Validates the GET webhook handshake token across both the environment default
 * and all tenant-configured Meta App verify tokens in the database.
 */
export async function verifyWebhookToken(token?: string | null): Promise<boolean> {
  if (!token) return false;

  // 1. Check global environment verify token
  const envToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (envToken && safeEqual(token, envToken)) {
    return true;
  }

  // 2. Check registered MetaAppCredential verify tokens
  try {
    const appCredentials = await db.metaAppCredential.findMany({
      where: { verifyToken: { not: null } },
      select: { verifyToken: true },
    });

    for (const app of appCredentials) {
      if (app.verifyToken && safeEqual(token, app.verifyToken)) {
        return true;
      }
    }
  } catch (e) {
    console.error("[multi-app-webhook] Failed to query app verify tokens:", e);
  }

  return false;
}

interface CandidateSecret {
  secret: string;
  appId?: string;
  source: "database" | "environment";
}

/**
 * Inspects unverified raw body for potential routing hints (WABA ID or phone_number_id)
 * to prioritize candidate App Secrets. Never trusts the unverified payload for data operations.
 */
function extractPayloadHints(raw: string): { wabaId?: string; phoneNumberId?: string } {
  try {
    const parsed = JSON.parse(raw);
    const wabaId = parsed?.entry?.[0]?.id ? String(parsed.entry[0].id) : undefined;
    const phoneNumberId = parsed?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
      ? String(parsed.entry[0].changes[0].value.metadata.phone_number_id)
      : undefined;
    return { wabaId, phoneNumberId };
  } catch {
    return {};
  }
}

/**
 * Resolves candidate Meta App Secrets from:
 * 1. Targeted MetaAppCredential linked to the hinted WABA or phone_number_id.
 * 2. Platform MetaAppCredential records (isPlatformApp === true or clientId === null).
 * 3. The global META_APP_SECRET environment variable.
 *
 * Foreign tenant secrets (where clientId is assigned to a different client) are strictly excluded.
 */
async function getCandidateAppSecrets(raw: string): Promise<CandidateSecret[]> {
  const candidates: CandidateSecret[] = [];
  const seenSecrets = new Set<string>();

  const addCandidate = (secret?: string | null, appId?: string, source: "database" | "environment" = "database") => {
    if (!secret || secret === "[SENSITIVE]" || seenSecrets.has(secret)) return;
    seenSecrets.add(secret);
    candidates.push({ secret, appId, source });
  };

  const { wabaId, phoneNumberId } = extractPayloadHints(raw);

  try {
    let targetedClientId: string | null = null;

    // 1. Resolve target tenant owning WABA or Phone Number ID
    if (wabaId || phoneNumberId) {
      const targetedConnection = await db.whatsAppConnection.findFirst({
        where: {
          OR: [
            ...(wabaId ? [{ wabaId }] : []),
            ...(phoneNumberId ? [{ numbers: { some: { phoneNumberId } } }] : []),
          ],
        },
        include: { appCredential: true },
      });

      if (targetedConnection) {
        targetedClientId = targetedConnection.clientId;
        if (targetedConnection.appCredential?.appSecret) {
          addCandidate(targetedConnection.appCredential.appSecret, targetedConnection.appCredential.appId, "database");
        }
      } else {
        // Check legacy Client or WhatsAppNumber records
        const legacyMatch = await db.client.findFirst({
          where: {
            OR: [
              ...(wabaId ? [{ waBusinessAccountId: wabaId }] : []),
              ...(phoneNumberId ? [{ waPhoneNumberId: phoneNumberId }] : []),
              ...(phoneNumberId ? [{ numbers: { some: { phoneNumberId } } }] : []),
            ],
          },
          include: { metaApps: { take: 1, orderBy: { createdAt: "desc" } } },
        });
        if (legacyMatch) {
          targetedClientId = legacyMatch.id;
          const app = legacyMatch.metaApps[0];
          if (app?.appSecret) {
            addCandidate(app.appSecret, app.appId, "database");
          }
        }
      }
    }

    // 2. Query allowed MetaAppCredentials:
    // If a targeted tenant was identified, allow that tenant's credentials OR platform apps (clientId === null or isPlatformApp === true).
    // If NO tenant was identified (e.g. system payload / test ping without entries), allow only platform apps.
    // Under NO circumstances may foreign tenant credentials (clientId !== targetedClientId) be included.
    const allowedApps = await db.metaAppCredential.findMany({
      where: {
        OR: [
          { isPlatformApp: true },
          { clientId: null },
          ...(targetedClientId ? [{ clientId: targetedClientId }] : []),
        ],
      },
      select: { appId: true, appSecret: true },
    });

    for (const app of allowedApps) {
      addCandidate(app.appSecret, app.appId, "database");
    }
  } catch (e) {
    console.error("[multi-app-webhook] Error fetching database candidate secrets:", e);
  }

  // 3. Fallback: Global environment variable
  const envSecret = process.env.META_APP_SECRET?.trim();
  if (envSecret && envSecret !== "[SENSITIVE]") {
    addCandidate(envSecret, process.env.META_APP_ID, "environment");
  }

  return candidates;
}

/**
 * Verifies the incoming WhatsApp webhook signature against all candidate Meta App Secrets.
 *
 * Supports multi-tenant setups where different clients operate their own Meta Developer Apps
 * with distinct App Secrets, while preserving compatibility with single-app deployments.
 */
export async function checkMultiAppSignature(
  raw: string,
  header: string | null,
): Promise<MultiAppSignatureResult> {
  if (!header?.startsWith("sha256=")) {
    return { status: "invalid" };
  }

  const candidates = await getCandidateAppSecrets(raw);

  if (candidates.length === 0) {
    // Fail-closed in production unless explicitly permitted for test harnesses
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_UNVERIFIED_WEBHOOKS !== "true") {
      return { status: "invalid" };
    }
    return { status: "unchecked" };
  }

  const given = Buffer.from(header.slice(7), "utf8");

  for (const { secret, appId, source } of candidates) {
    try {
      const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"), "utf8");
      if (expected.length === given.length && timingSafeEqual(expected, given)) {
        return { status: "signed", matchedAppId: appId, source };
      }
    } catch {
      // Continue to next candidate
    }
  }

  return { status: "invalid" };
}
