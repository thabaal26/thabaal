import "server-only";

// Meta-hosted Embedded Signup: a business finishes Meta's sign-up page and shares its WhatsApp account with Thabaal.
// Meta tells the webhook (account_update, event PARTNER_ADDED, with waba_info.waba_id and owner_business_id).
// We keep that as a "new WhatsApp account" for Thabaal to attach to a business on the Requests page; nothing about any
// existing business changes until an admin presses Attach. The table is created on first use (like PortalMetaAlert),
// so deploying this needs no migration, and every function here is safe to call when the table or Meta is unavailable.

import { createHmac, randomUUID } from "node:crypto";
import { db } from "./db";

const VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const ID = /^\d{6,25}$/;
export const META_TOKEN = /^EA[A-Za-z0-9]{20,}$/;

export type MetaSignup = {
  id: string;
  wabaId: string;
  ownerBusinessId: string | null;
  status: "NEW" | "ATTACHED" | "IGNORED";
  clientId: string | null;
  note: string | null;
  createdAt: string;
};

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PortalMetaSignup" (
      "id" TEXT PRIMARY KEY,
      "wabaId" TEXT NOT NULL UNIQUE,
      "ownerBusinessId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "clientId" TEXT,
      "note" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "decidedAt" TIMESTAMPTZ
    )
  `);
  ensured = true;
}

/** Thabaal's Meta-hosted Embedded Signup page (app and login configuration ids are public). META_SIGNUP_URL overrides it. */
const DEFAULT_SIGNUP_URL =
  "https://business.facebook.com/messaging/whatsapp/onboard/?app_id=1122787110109595&config_id=1151273253893793&extras=%7B%22sessionInfoVersion%22%3A%223%22%2C%22version%22%3A%22v4%22%7D";
export const metaSignupUrl = () => {
  const u = process.env.META_SIGNUP_URL?.trim();
  return u && /^https:\/\/business\.facebook\.com\//.test(u) ? u : DEFAULT_SIGNUP_URL;
};

let connectEnsured = false;
async function ensureConnectTable() {
  if (connectEnsured) return;
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PortalMetaConnect" ("clientId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  connectEnsured = true;
}

/** A business pressed "Connect your WhatsApp": remembered so the new account can be matched to it. Never throws. */
export async function recordConnectStart(clientId: string): Promise<void> {
  try {
    await ensureConnectTable();
    await db.$executeRaw`INSERT INTO "PortalMetaConnect" ("clientId") VALUES (${clientId})`;
  } catch {
    // matching is a convenience only
  }
}

/** Businesses that pressed Connect in the last few hours, newest first, once each. */
export async function recentConnectStarts(hours = 6): Promise<{ clientId: string; at: string }[]> {
  try {
    await ensureConnectTable();
    return await db.$queryRaw<{ clientId: string; at: string }[]>`
      SELECT "clientId", MAX("createdAt")::text AS "at" FROM "PortalMetaConnect"
      WHERE "createdAt" > NOW() - make_interval(hours => ${hours}::int)
      GROUP BY "clientId" ORDER BY MAX("createdAt") DESC LIMIT 10
    `;
  } catch {
    return [];
  }
}

/** What a PARTNER_ADDED event says, or null for any other event. Meta's own field names; ids must be plain digits. */
export function parsePartnerAdded(entryId: unknown, value: unknown): { wabaId: string; ownerBusinessId: string | null } | null {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (String(v.event ?? "") !== "PARTNER_ADDED") return null;
  const info = (v.waba_info && typeof v.waba_info === "object" ? v.waba_info : {}) as Record<string, unknown>;
  const wabaId = String(info.waba_id ?? entryId ?? "").trim();
  if (!ID.test(wabaId)) return null;
  const owner = String(info.owner_business_id ?? "").trim();
  return { wabaId, ownerBusinessId: ID.test(owner) ? owner : null };
}

/** Saves a PARTNER_ADDED event once per WhatsApp account. Never throws: the webhook must not be affected. */
export async function recordMetaSignup(entryId: unknown, value: unknown): Promise<boolean> {
  try {
    const p = parsePartnerAdded(entryId, value);
    if (!p) return false;
    // An account a business already uses isn't a new sign-up (Meta also sends this event when we're added by hand).
    if (await db.whatsAppNumber.findFirst({ where: { businessAccountId: p.wabaId }, select: { id: true } })) return false;
    await ensureTable();
    await db.$executeRaw`
      INSERT INTO "PortalMetaSignup" ("id", "wabaId", "ownerBusinessId")
      VALUES (${randomUUID()}, ${p.wabaId}, ${p.ownerBusinessId})
      ON CONFLICT ("wabaId") DO UPDATE SET "ownerBusinessId" = COALESCE("PortalMetaSignup"."ownerBusinessId", EXCLUDED."ownerBusinessId")
    `;
    return true;
  } catch (e) {
    console.error("[meta signup] could not save PARTNER_ADDED:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function pendingSignupCount(): Promise<number> {
  try {
    await ensureTable();
    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "PortalMetaSignup" WHERE "status" = 'NEW'`;
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

/** Waiting accounts first (oldest first), then the last few that were attached or ignored. */
export async function listSignups(): Promise<MetaSignup[]> {
  try {
    await ensureTable();
    const sel = `"id", "wabaId", "ownerBusinessId", "status", "clientId", "note", "createdAt"::text AS "createdAt"`;
    const [open, done] = await Promise.all([
      db.$queryRawUnsafe<MetaSignup[]>(`SELECT ${sel} FROM "PortalMetaSignup" WHERE "status" = 'NEW' ORDER BY "createdAt" ASC LIMIT 50`),
      db.$queryRawUnsafe<MetaSignup[]>(`SELECT ${sel} FROM "PortalMetaSignup" WHERE "status" <> 'NEW' ORDER BY "decidedAt" DESC NULLS LAST LIMIT 10`),
    ]);
    return [...open, ...done];
  } catch {
    return [];
  }
}

export async function getSignup(id: string): Promise<MetaSignup | null> {
  try {
    await ensureTable();
    const rows = await db.$queryRaw<MetaSignup[]>`
      SELECT "id", "wabaId", "ownerBusinessId", "status", "clientId", "note", "createdAt"::text AS "createdAt"
      FROM "PortalMetaSignup" WHERE "id" = ${id}
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Closes a waiting account. Only a NEW row changes, so pressing twice is harmless. Returns whether it changed. */
export async function closeSignup(id: string, status: "ATTACHED" | "IGNORED", clientId: string | null, note: string | null): Promise<boolean> {
  await ensureTable();
  const n = await db.$executeRaw`
    UPDATE "PortalMetaSignup" SET "status" = ${status}, "clientId" = ${clientId}, "note" = ${note}, "decidedAt" = NOW()
    WHERE "id" = ${id} AND "status" = 'NEW'
  `;
  return n > 0;
}

/** Meta's proof that a server call really comes from our app: HMAC-SHA256 of the token, keyed with the app secret. */
export const appSecretProof = (token: string, appSecret: string) => createHmac("sha256", appSecret).update(token).digest("hex");

type Fetch = typeof fetch;
export type Fail = { ok: false; message: string };

const metaMessage = (json: unknown, status: number) => {
  const e = ((json ?? {}) as { error?: { message?: string; error_user_msg?: string; code?: number } }).error;
  return e ? `${e.error_user_msg || e.message || "Meta refused the request"} (code ${e.code ?? status})` : `Meta answered with status ${status}`;
};

/** The customer's own access token, fetched with Thabaal's system user token (hosted Embedded Signup, no code needed). */
export async function fetchCustomerToken(input: { businessId: string; systemToken: string; appSecret: string; fetchImpl?: Fetch }): Promise<{ ok: true; token: string } | Fail> {
  if (!ID.test(input.businessId)) return { ok: false, message: "Meta did not send this customer's business ID, so their token can't be fetched." };
  try {
    const res = await (input.fetchImpl ?? fetch)(`https://graph.facebook.com/${VERSION}/${input.businessId}/system_user_access_tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.systemToken}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ appsecret_proof: appSecretProof(input.systemToken, input.appSecret), fetch_only: "true" }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: unknown; error?: unknown };
    if (!res.ok || json.error) return { ok: false, message: `Meta said: ${metaMessage(json, res.status)}` };
    const token = typeof json.access_token === "string" ? json.access_token : "";
    if (!META_TOKEN.test(token)) return { ok: false, message: "Meta did not return a usable access token for this customer. Check that Thabaal's system user has access to their business." };
    return { ok: true, token };
  } catch (e) {
    return { ok: false, message: `Could not reach Meta: ${e instanceof Error ? e.message : "network error"}` };
  }
}

/** Asks Meta to send this customer's webhooks to our app. Best effort: returns whether Meta confirmed it. */
export async function subscribeToAccount(wabaId: string, token: string, fetchImpl?: Fetch): Promise<boolean> {
  try {
    const res = await (fetchImpl ?? fetch)(`https://graph.facebook.com/${VERSION}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: unknown };
    return res.ok && !json.error && json.success !== false;
  } catch {
    return false;
  }
}
