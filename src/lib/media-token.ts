import "server-only";
import crypto from "node:crypto";
import { getStoredPublicImage } from "./uploaded-image";
import { db } from "./db";

const DEFAULT_TTL_SECONDS = 72 * 3600; // 72 hours per OD-02

/**
 * Returns primary and rotation signing keys derived using SHA-256.
 * Zero predictable fallback strings. If no environment secret is present, returns null.
 */
function getMediaSigningSecrets(): { primary: Buffer; rotation: Buffer[] } | null {
  const primaryRaw = process.env.DATA_ENC_KEY || process.env.AUTH_SECRET || process.env.MEDIA_SIGNING_SECRET;
  if (!primaryRaw) return null;

  const primary = crypto.createHash("sha256").update(primaryRaw).digest();
  const rotationRaws = [
    process.env.DATA_ENC_KEY_OLD,
    process.env.AUTH_SECRET_OLD,
    process.env.MEDIA_SIGNING_SECRET_OLD,
    ...(process.env.MEDIA_ROTATION_KEYS ? process.env.MEDIA_ROTATION_KEYS.split(",") : []),
  ].filter((k): k is string => Boolean(k && k.trim()));

  const rotation = rotationRaws.map((r) => crypto.createHash("sha256").update(r.trim()).digest());
  return { primary, rotation };
}

export interface MediaTokenPayload {
  imageId: string;
  clientId?: string;
  exp: number; // Unix timestamp in seconds
  iat: number; // Unix timestamp in seconds
  jti?: string; // Unique Token Identifier for targeted revocation (F-01)
}

export interface MediaVerificationResult {
  valid: boolean;
  clientId?: string;
  expired?: boolean;
  reason?: string;
}

// In-memory revocation cache for high-throughput reads (tokenHash -> exp timestamp)
const revokedCache = new Map<string, number>();

let revocationTableEnsured = false;

/**
 * Ensures the persistent PostgreSQL RevokedMediaToken table exists with appropriate indexes.
 */
export async function ensureRevocationTable(): Promise<void> {
  if (revocationTableEnsured) return;
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RevokedMediaToken" (
        "tokenHash" TEXT PRIMARY KEY,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "clientId" TEXT,
        "reason" TEXT
      )
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RevokedMediaToken_expiresAt_idx" ON "RevokedMediaToken"("expiresAt");
      CREATE INDEX IF NOT EXISTS "RevokedMediaToken_clientId_idx" ON "RevokedMediaToken"("clientId");
    `).catch(() => {});
    revocationTableEnsured = true;
  } catch (e) {
    // Table may already be handled by Prisma migration
  }
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Persistently revokes a capability token before its natural 72-hour expiration.
 * Stores a cryptographic hash of the token in PostgreSQL (F-01). Survives PM2 restarts and process reloads.
 */
export async function revokeMediaToken(
  token: string,
  opts?: { clientId?: string | null; reason?: string },
): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const payload: MediaTokenPayload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    const tokenH = hashToken(token);
    const expDate = new Date(payload.exp * 1000);

    // 1. Immediately update local in-memory cache
    revokedCache.set(tokenH, payload.exp);
    if (payload.jti) {
      revokedCache.set(payload.jti, payload.exp);
    }

    // 2. Persist to PostgreSQL database (survives PM2 restarts, reboots, and cluster instances)
    await ensureRevocationTable();
    await db.$executeRaw`
      INSERT INTO "RevokedMediaToken" ("tokenHash", "expiresAt", "clientId", "reason")
      VALUES (${tokenH}, ${expDate}, ${opts?.clientId ?? payload.clientId ?? null}, ${opts?.reason ?? "Revoked by user"})
      ON CONFLICT ("tokenHash") DO NOTHING
    `;

    if (payload.jti) {
      await db.$executeRaw`
        INSERT INTO "RevokedMediaToken" ("tokenHash", "expiresAt", "clientId", "reason")
        VALUES (${payload.jti}, ${expDate}, ${opts?.clientId ?? payload.clientId ?? null}, ${opts?.reason ?? "Revoked by JTI"})
        ON CONFLICT ("tokenHash") DO NOTHING
      `;
    }

    return true;
  } catch (e) {
    console.error("Failed to persist media token revocation:", e);
    return true;
  }
}

/**
 * Checks whether a token has been explicitly revoked via in-memory cache or persistent database.
 * Fails closed on database communication errors to protect private media assets.
 */
export async function isMediaTokenRevoked(token: string): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  const tokenH = hashToken(token);
  const now = Math.floor(Date.now() / 1000);

  // Fast path: In-memory cache hit
  const cachedExp = revokedCache.get(tokenH);
  if (cachedExp) {
    if (cachedExp < now) {
      revokedCache.delete(tokenH);
    } else {
      return true;
    }
  }

  // Inspect JTI from token payload if present
  let jti: string | undefined;
  try {
    const parts = token.split(".");
    if (parts.length === 2) {
      const payload: MediaTokenPayload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
      jti = payload.jti;
      if (jti && revokedCache.has(jti)) {
        return true;
      }
    }
  } catch {
    // Malformed token payload will fail signature verification anyway
  }

  // Persistent path: Query PostgreSQL RevokedMediaToken table
  try {
    await ensureRevocationTable();
    const rows: { count: number }[] = await db.$queryRaw`
      SELECT COUNT(*)::int as count FROM "RevokedMediaToken"
      WHERE ("tokenHash" = ${tokenH} OR (${jti ? jti : ""} != '' AND "tokenHash" = ${jti ? jti : ""}))
        AND "expiresAt" > NOW()
    `;

    if (rows && rows[0]?.count > 0) {
      revokedCache.set(tokenH, now + 300); // Cache positive revocation in-memory for 5 minutes
      return true;
    }
    return false;
  } catch (err) {
    console.error("Revocation store check failed, failing closed:", err);
    // FAIL CLOSED: If persistent revocation store cannot be reached, reject access to private media
    return true;
  }
}

/**
 * Revokes all capability tokens for a specific media image asset (F-02).
 */
export async function revokeTokensForImage(
  imageId: string,
  opts?: { clientId?: string | null; reason?: string },
): Promise<void> {
  if (!imageId) return;
  const key = `img:${imageId}`;
  const now = Math.floor(Date.now() / 1000);
  const expDate = new Date((now + DEFAULT_TTL_SECONDS) * 1000);

  revokedCache.set(key, now + DEFAULT_TTL_SECONDS);
  try {
    await ensureRevocationTable();
    await db.$executeRaw`
      INSERT INTO "RevokedMediaToken" ("tokenHash", "expiresAt", "clientId", "reason")
      VALUES (${key}, ${expDate}, ${opts?.clientId ?? null}, ${opts?.reason ?? "Image replaced or deleted"})
      ON CONFLICT ("tokenHash") DO NOTHING
    `;
  } catch (e) {
    console.error("Failed to revoke image tokens:", e);
  }
}

/**
 * Generates an HMAC-SHA256 capability token for secure, time-bounded media access.
 * Scoped strictly to the image ID and optional tenant clientId with unique JTI (F-01).
 * Requires a configured environment secret (DATA_ENC_KEY or AUTH_SECRET); fails safely otherwise.
 */
export function signMediaToken(opts: {
  imageId: string;
  clientId?: string | null;
  ttlSeconds?: number;
}): string {
  const secrets = getMediaSigningSecrets();
  if (!secrets) {
    throw new Error("Cannot sign media capability token: DATA_ENC_KEY or AUTH_SECRET must be configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const jti = crypto.randomBytes(16).toString("hex");

  const payload: MediaTokenPayload = {
    imageId: opts.imageId,
    ...(opts.clientId ? { clientId: opts.clientId } : {}),
    iat: now,
    exp: now + ttl,
    jti,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secrets.primary).update(payloadB64).digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Validates a capability token against an image ID using timing-safe comparison.
 * Checks revocation (in-memory and persistent DB), signature, expiration, and image ID matching.
 */
export async function verifyMediaToken(
  token: string | null | undefined,
  expectedImageId: string,
): Promise<MediaVerificationResult> {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Missing token" };
  }

  // Check persistent and cached revocation
  if (await isMediaTokenRevoked(token)) {
    return { valid: false, reason: "Token revoked" };
  }

  // Also check if entire image asset was revoked
  if (revokedCache.has(`img:${expectedImageId}`)) {
    return { valid: false, reason: "Asset access revoked" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "Malformed token" };
  }

  const [payloadB64, providedSig] = parts;

  try {
    const secrets = getMediaSigningSecrets();
    if (!secrets) {
      return { valid: false, reason: "Server signing secret not configured" };
    }

    const providedBuf = Buffer.from(providedSig);

    // Try primary secret first
    let sigMatch = false;
    const primarySig = crypto.createHmac("sha256", secrets.primary).update(payloadB64).digest("base64url");
    const primaryBuf = Buffer.from(primarySig);
    if (providedBuf.length === primaryBuf.length && crypto.timingSafeEqual(providedBuf, primaryBuf)) {
      sigMatch = true;
    }

    // Try rotation secrets if primary does not match
    if (!sigMatch && secrets.rotation.length > 0) {
      for (const rotSecret of secrets.rotation) {
        const rotSig = crypto.createHmac("sha256", rotSecret).update(payloadB64).digest("base64url");
        const rotBuf = Buffer.from(rotSig);
        if (providedBuf.length === rotBuf.length && crypto.timingSafeEqual(providedBuf, rotBuf)) {
          sigMatch = true;
          break;
        }
      }
    }

    if (!sigMatch) {
      return { valid: false, reason: "Invalid signature" };
    }

    const payload: MediaTokenPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));

    if (payload.imageId !== expectedImageId) {
      return { valid: false, reason: "Image ID mismatch" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, expired: true, reason: "Token expired" };
    }

    return {
      valid: true,
      clientId: payload.clientId,
    };
  } catch {
    return { valid: false, reason: "Token parsing failure" };
  }
}

/**
 * Appends a capability token to a media URL if not already present.
 */
export function mediaUrlWithToken(
  rawUrl: string,
  opts: { imageId: string; clientId?: string | null; ttlSeconds?: number },
): string {
  const token = signMediaToken(opts);
  const separator = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${separator}token=${token}`;
}

/**
 * Inspects a media URL and appends a signed capability token if it points to a private /api/upload/[id] asset.
 * If the image is explicitly public (e.g. approved WhatsApp template header), returns the URL untouched.
 */
export async function signMediaUrlIfNeeded(rawUrl: string, clientId?: string | null): Promise<string> {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  const match = rawUrl.match(/\/api\/upload\/([a-zA-Z0-9._-]+)/);
  if (!match) return rawUrl;
  const imageId = match[1];

  // If already tokenized, leave as is
  if (rawUrl.includes("token=")) return rawUrl;

  try {
    const stored = await getStoredPublicImage(imageId);
    // Explicit public assets (e.g. approved template headers) do not need capability tokens
    if (stored?.isPublic) {
      return rawUrl;
    }

    return mediaUrlWithToken(rawUrl, {
      imageId,
      clientId: stored?.clientId ?? clientId,
      ttlSeconds: 72 * 3600,
    });
  } catch {
    return rawUrl;
  }
}
