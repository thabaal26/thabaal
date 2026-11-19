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
