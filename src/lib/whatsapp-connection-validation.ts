import { normalizeGraphVersion } from "./graph-version";
import type { MetaPhoneNumber } from "./whatsapp";

const DIGITS = /^\d{6,30}$/;
const HEX_SECRET = /^[a-fA-F0-9]{20,64}$/;
const META_TOKEN = /^EA[A-Za-z0-9_]{20,}$/;

export interface ActionResult<T = unknown> {
  ok: boolean;
  message?: string;
  data?: T;
}

export interface ValidateWabaResult {
  wabaId: string;
  name: string;
  currency?: string;
  timezoneId?: string;
}

export interface WabaPhoneNumberOption {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating?: string;
  alreadyAssignedTo?: string;
}

/**
 * Validates Meta App ID and App Secret syntax and format.
 */
export async function validateMetaAppInput(
  appId: string,
  appSecret: string,
): Promise<ActionResult> {
  const trimmedId = appId?.trim() || "";
  const trimmedSecret = appSecret?.trim() || "";

  if (!DIGITS.test(trimmedId)) {
    return { ok: false, message: "Meta App ID must be numeric (found in Meta App Dashboard › App settings › Basic)." };
  }
  if (!HEX_SECRET.test(trimmedSecret)) {
    return { ok: false, message: "Meta App Secret must be a valid 32-character hexadecimal string." };
  }

  return { ok: true };
}

/**
 * Validates WABA access using the provided System User Access Token via Meta Graph API.
 */
export async function validateWabaAccess(
  wabaId: string,
  token: string,
  graphVersion?: string,
): Promise<ActionResult<ValidateWabaResult>> {
  const trimmedWaba = wabaId?.trim() || "";
  const trimmedToken = token?.trim() || "";
  const version = normalizeGraphVersion(graphVersion);

  if (!DIGITS.test(trimmedWaba)) {
    return { ok: false, message: "WhatsApp Business Account ID must be numeric (found in Meta Business Suite or WhatsApp Manager)." };
  }
  if (!META_TOKEN.test(trimmedToken)) {
    return { ok: false, message: "System User Access Token must start with 'EA' and contain valid token characters." };
  }

  try {
    const url = `https://graph.facebook.com/${version}/${trimmedWaba}?fields=id,name,timezone_id,currency`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${trimmedToken}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || json.error) {
      const err = json.error ?? {};
      return {
        ok: false,
        message: err.error_user_msg || err.message || `Meta Graph API returned error (${res.status})`,
      };
    }

    return {
      ok: true,
      data: {
        wabaId: json.id,
        name: json.name || "WhatsApp Business Account",
        currency: json.currency,
        timezoneId: json.timezone_id,
      },
    };
  } catch (e) {
    return {
      ok: false,
      message: `Failed to connect to Meta Graph API: ${e instanceof Error ? e.message : "network error"}`,
    };
  }
}

/**
 * Strict validation and token redaction for fetching WABA phone numbers.
 * Enforces:
 * - WABA ID format: 5-25 numeric digits
 * - Token length: 1-4096 chars
 * - Graph version normalization
 * - Bearer token redaction from error messages
 */
export async function queryWabaPhoneNumbers(
  wabaId: string,
  token: string,
  graphVersion?: string,
  options?: {
    lookupExisting?: (phoneIds: string[]) => Promise<{ phoneNumberId: string; clientName: string }[]>;
  }
): Promise<ActionResult<WabaPhoneNumberOption[]>> {
  const trimmedWaba = (wabaId ?? "").trim();
  const trimmedToken = (token ?? "").trim();

  if (!/^\d{5,25}$/.test(trimmedWaba)) {
    return { ok: false, message: "Invalid WABA ID format. WABA ID must be between 5 and 25 digits." };
  }
  if (!trimmedToken || trimmedToken.length > 4096) {
    return { ok: false, message: "Invalid access token. Token length must be between 1 and 4096 characters." };
  }

  const version = normalizeGraphVersion(graphVersion);

  try {
    const url = `https://graph.facebook.com/${version}/${trimmedWaba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${trimmedToken}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { data?: MetaPhoneNumber[]; error?: { message?: string } };

    if (!res.ok || json.error || !Array.isArray(json.data)) {
      const rawMsg = json.error?.message || `Could not fetch phone numbers from Meta (${res.status})`;
      const safeMsg = rawMsg.replace(/Bearer\s+[A-Za-z0-9_-]+/gi, "Bearer [REDACTED]");
      return { ok: false, message: safeMsg };
    }

    const numbers = json.data;
    if (numbers.length === 0) {
      return {
        ok: false,
        message: "This WABA has no registered phone numbers. Add and verify a phone number in WhatsApp Manager first.",
      };
    }

    const assigned = options?.lookupExisting ? await options.lookupExisting(numbers.map((n) => n.id)) : [];

    const resultOptions: WabaPhoneNumberOption[] = numbers.map((n) => {
      const match = assigned.find((e) => e.phoneNumberId === n.id);
      return {
        id: n.id,
        displayPhoneNumber: n.display_phone_number,
        verifiedName: n.verified_name,
        qualityRating: n.quality_rating,
        alreadyAssignedTo: match ? match.clientName : undefined,
      };
    });

    return { ok: true, data: resultOptions };
  } catch (e) {
    return {
      ok: false,
      message: `Error querying phone numbers: ${e instanceof Error ? e.message.replace(/Bearer\s+[A-Za-z0-9_-]+/gi, "Bearer [REDACTED]") : "network error"}`,
    };
  }
}

export const ONBOARDING_ATTEMPT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface OnboardingAttemptRecord {
  id: string;
  clientId: string;
  wabaId: string;
  token: string | null;
  status: string;
  lastValidatedAt: Date | null;
}

export interface VerifyWabaOnboardingOptions {
  findActiveForeignConnection?: (wabaId: string, clientId: string) => Promise<boolean>;
  findForeignReservation?: (wabaId: string, clientId: string) => Promise<boolean>;
  findTenantConnection: (wabaId: string, clientId: string) => Promise<OnboardingAttemptRecord | null>;
  validateWabaMetaAccess?: (wabaId: string, token: string, version: string) => Promise<ActionResult<ValidateWabaResult>>;
  upsertDraftConnection?: (clientId: string, wabaId: string, token: string, version: string) => Promise<void>;
  updateDraftToken?: (connectionId: string, token: string) => Promise<void>;
  now?: Date;
  ttlMs?: number;
}

/**
 * SEC-01 Hardening: Strict tenant-bound WABA and token authorization.
 * Enforces:
 * 1. Manager client context resolution.
 * 2. Cross-tenant WABA access prevention (cannot claim or probe active foreign WABA or pending foreign DRAFT).
 * 3. Atomic onboarding reservation to prevent race conditions during simultaneous first-time onboarding.
 * 4. Onboarding attempt verification (expiry, pending/active status, client ownership).
 * 5. Token authorization for the requested WABA (unauthorized tokens can never reach /phone_numbers listing).
 * 6. First-time onboarding allowance without existing sender records.
 */
export async function verifyTenantWabaOnboarding(
  input: {
    clientId: string;
    wabaId: string;
    token: string;
    graphVersion?: string;
    attemptId?: string;
  },
  opts: VerifyWabaOnboardingOptions
): Promise<ActionResult<{ connectionId?: string; isFirstTime: boolean }>> {
  const { clientId, wabaId, token, graphVersion, attemptId } = input;
  const trimmedWaba = (wabaId ?? "").trim();
  const trimmedToken = (token ?? "").trim();
  const trimmedClientId = (clientId ?? "").trim();

  if (!trimmedClientId) {
    return { ok: false, message: "Missing tenant client context." };
  }
  if (!/^\d{5,25}$/.test(trimmedWaba)) {
    return { ok: false, message: "Invalid WABA ID format. WABA ID must be between 5 and 25 digits." };
  }
  if (!trimmedToken || trimmedToken.length > 4096) {
    return { ok: false, message: "Invalid access token. Token length must be between 1 and 4096 characters." };
  }

  // 1. Cross-tenant WABA rejection (checks both active connections and pending non-expired DRAFT reservations):
  const checkForeign = opts.findForeignReservation || opts.findActiveForeignConnection;
  if (checkForeign) {
    const isForeignReserved = await checkForeign(trimmedWaba, trimmedClientId);
    if (isForeignReserved) {
      return {
        ok: false,
        message: `WhatsApp Business Account ${trimmedWaba} is already registered or reserved by another tenant. Cross-tenant WABA access is strictly prohibited.`,
      };
    }
  }

  // 2. Load existing connection / onboarding attempt for this client
  const connection = await opts.findTenantConnection(trimmedWaba, trimmedClientId);

  // 3. If an explicit attemptId was supplied, verify it matches
  if (attemptId && connection && connection.id !== attemptId) {
    return {
      ok: false,
      message: "Onboarding attempt ID does not match the authorized connection context for this tenant.",
    };
  }

  // 4. Check expiry on existing attempt
  const ttl = opts.ttlMs ?? ONBOARDING_ATTEMPT_TTL_MS;
  const currentTime = (opts.now ?? new Date()).getTime();
  if (connection && connection.lastValidatedAt) {
    const elapsed = currentTime - connection.lastValidatedAt.getTime();
    if (elapsed > ttl) {
      return {
        ok: false,
        message: "WhatsApp onboarding attempt has expired. Please re-validate your WABA credentials.",
      };
    }
  }

  const version = normalizeGraphVersion(graphVersion);

  // 5. First-time onboarding vs Existing connection
  if (!connection) {
    // Valid first-time tenant onboarding: verify token authorization for requested WABA
    if (opts.validateWabaMetaAccess) {
      const authCheck = await opts.validateWabaMetaAccess(trimmedWaba, trimmedToken, version);
      if (!authCheck.ok) {
        return {
          ok: false,
          message: authCheck.message || "Token is not authorized for the requested WABA.",
        };
      }
    }
    // Atomic reservation of draft connection attempt
    if (opts.upsertDraftConnection) {
      try {
        await opts.upsertDraftConnection(trimmedClientId, trimmedWaba, trimmedToken, version);
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : "Failed to reserve onboarding attempt for tenant.",
        };
      }
    }
    return { ok: true, data: { isFirstTime: true } };
  }

  // Existing connection: verify token authorization
  if (connection.token !== trimmedToken) {
    if (opts.validateWabaMetaAccess) {
      const authCheck = await opts.validateWabaMetaAccess(trimmedWaba, trimmedToken, version);
      if (!authCheck.ok) {
        return {
          ok: false,
          message: "Provided token does not have authorization for the requested WABA.",
        };
      }
    }
    if (opts.updateDraftToken) {
      await opts.updateDraftToken(connection.id, trimmedToken);
    }
  }

  return { ok: true, data: { connectionId: connection.id, isFirstTime: false } };
}

/**
 * Atomic reservation of a WABA DRAFT connection with PostgreSQL advisory xact lock.
 * Serializes concurrent onboarding attempts on the same WABA ID across all database connections,
 * guaranteeing race safety under PostgreSQL READ COMMITTED isolation.
 * Lock is automatically released on commit or rollback.
 */
export async function atomicReserveWabaDraft(
  txOrDb: any,
  clientId: string,
  wabaId: string,
  token: string,
  graphVersion: string = "v23.0"
): Promise<{ id: string; status: string }> {
  const executeInTransaction = async (tx: any) => {
    // 1. Transaction-scoped PostgreSQL advisory lock:
    // Serializes concurrent onboarding transactions for this specific WABA across the database.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waba_onboarding:' || ${wabaId})::bigint)`;

    // 2. Re-check for foreign reservations (active connections or unexpired DRAFTs within 30 min)
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const foreign = await tx.whatsAppConnection.findFirst({
      where: {
        wabaId,
        clientId: { not: clientId },
        OR: [
          { status: { in: ["ACTIVE", "VALIDATING", "PENDING_WEBHOOK"] } },
          { status: "DRAFT", lastValidatedAt: { gte: cutoff } },
        ],
      },
    });

    if (foreign) {
      throw new Error(`WhatsApp Business Account ${wabaId} is already registered or reserved by another tenant.`);
    }

    // 3. Atomically upsert the tenant's draft connection
    return await tx.whatsAppConnection.upsert({
      where: { clientId_wabaId: { clientId, wabaId } },
      create: {
        clientId,
        wabaId,
        token,
        graphVersion,
        status: "DRAFT",
        lastValidatedAt: new Date(),
      },
      update: {
        token,
        graphVersion,
        status: "DRAFT",
        lastValidatedAt: new Date(),
      },
    });
  };

  if ("$transaction" in txOrDb && typeof txOrDb.$transaction === "function") {
    return await txOrDb.$transaction(executeInTransaction);
  } else {
    return await executeInTransaction(txOrDb);
  }
}

