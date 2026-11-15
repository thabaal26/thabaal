import "server-only";
import { db } from "./db";
import { normalizeGraphVersion } from "./graph-version";
import { waConfig, type WaConfig } from "./whatsapp";
import type { ConnectionStatus, OnboardingMode } from "@prisma/client";

/**
 * Mask a secret string for safe UI presentation (e.g. "••••••••debf" or "EA••••••••tawZ").
 * Never displays plaintext secrets in UI, API responses, or logs.
 */
export function maskSecret(secret?: string | null): string {
  if (!secret) return "—";
  const s = secret.trim();
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 2)}••••••••${s.slice(-4)}`;
}

export interface ResolvedTenantConnection {
  connectionId: string | null;
  clientId: string;
  onboardingMode: OnboardingMode;
  status: ConnectionStatus;
  wabaId: string;
  token: string | null;
  appId: string | null;
  appSecret: string | null;
  graphVersion: string;
  defaultPhoneNumberId: string | null;
  webhookSubscribed: boolean;
  lastValidatedAt: Date | null;
}

/**
 * Resolves the active WhatsApp connection for a given client (tenant).
 * Prioritizes the unified WhatsAppConnection model, falling back transparently
 * to legacy Client.waToken and WhatsAppNumber records for 100% backward compatibility.
 */
export async function resolveTenantConnection(
  clientId: string,
  preferredPhoneNumberId?: string | null,
): Promise<ResolvedTenantConnection | null> {
  if (!clientId) return null;

  // 1. Try finding an active WhatsAppConnection for this client
  const conn = await db.whatsAppConnection.findFirst({
    where: { clientId, status: "ACTIVE" },
    include: {
      appCredential: true,
      numbers: {
        select: { id: true, phoneNumberId: true, isDefault: true, token: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (conn) {
    let chosenNumber = conn.numbers.find((n) => n.isDefault);
    if (preferredPhoneNumberId) {
      const match = conn.numbers.find((n) => n.phoneNumberId === preferredPhoneNumberId);
      if (match) chosenNumber = match;
    }
    if (!chosenNumber && conn.numbers.length > 0) {
      chosenNumber = conn.numbers[0];
    }

    return {
      connectionId: conn.id,
      clientId: conn.clientId,
      onboardingMode: conn.onboardingMode,
      status: conn.status,
      wabaId: conn.wabaId,
      token: chosenNumber?.token || conn.token,
      appId: conn.appCredential?.appId ?? null,
      appSecret: conn.appCredential?.appSecret ?? null,
      graphVersion: normalizeGraphVersion(conn.graphVersion),
      defaultPhoneNumberId: chosenNumber?.phoneNumberId ?? null,
      webhookSubscribed: conn.webhookSubscribed,
      lastValidatedAt: conn.lastValidatedAt,
    };
  }

  // 2. Legacy fallback: Check Client and WhatsAppNumber records (e.g. Thenan Oils, Finforte)
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: {
      numbers: {
        select: { id: true, phoneNumberId: true, businessAccountId: true, isDefault: true, token: true },
      },
      metaApps: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  if (!client) return null;

  let chosenNumber = client.numbers.find((n) => n.isDefault);
  if (preferredPhoneNumberId) {
    const match = client.numbers.find((n) => n.phoneNumberId === preferredPhoneNumberId);
    if (match) chosenNumber = match;
  }
  if (!chosenNumber && client.numbers.length > 0) {
    chosenNumber = client.numbers[0];
  }

  const token = chosenNumber?.token || client.waToken;
  const wabaId = chosenNumber?.businessAccountId || client.waBusinessAccountId;
  const phoneNumberId = chosenNumber?.phoneNumberId || client.waPhoneNumberId;

  if (!token || !wabaId) return null;

  const appCred = client.metaApps[0];

  return {
    connectionId: null,
    clientId: client.id,
    onboardingMode: "MANUAL",
    status: "ACTIVE",
    wabaId,
    token,
    appId: appCred?.appId ?? process.env.META_APP_ID ?? null,
    appSecret: appCred?.appSecret ?? process.env.META_APP_SECRET ?? null,
    graphVersion: normalizeGraphVersion(),
    defaultPhoneNumberId: phoneNumberId ?? null,
    webhookSubscribed: true,
    lastValidatedAt: client.createdAt,
  };
}

/**
 * Produces a normalized WaConfig for any tenant, bridging the unified connection layer
 * seamlessly to the existing WhatsApp Cloud API client (whatsapp.ts).
 */
export async function getWaConfigForClient(
  clientId: string,
  preferredPhoneNumberId?: string | null,
): Promise<WaConfig> {
  const resolved = await resolveTenantConnection(clientId, preferredPhoneNumberId);
  if (!resolved) {
    return waConfig({ token: null, phoneNumberId: null, businessAccountId: null, clientId });
  }

  return {
    live: Boolean(resolved.token && resolved.defaultPhoneNumberId && resolved.wabaId),
    own: true,
    clientId: resolved.clientId,
    notConnected: !Boolean(resolved.token && resolved.defaultPhoneNumberId && resolved.wabaId),
    token: resolved.token ?? undefined,
    phoneNumberId: resolved.defaultPhoneNumberId ?? undefined,
    wabaId: resolved.wabaId ?? undefined,
    appId: resolved.appId ?? process.env.META_APP_ID,
    version: resolved.graphVersion,
  };
}
