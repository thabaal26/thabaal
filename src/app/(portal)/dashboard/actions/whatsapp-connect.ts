"use server";

import { db } from "@/lib/db";
import { getScope, requireManager, requireUser } from "@/lib/session";
import { normalizeGraphVersion } from "@/lib/graph-version";
import { maskSecret } from "@/lib/whatsapp-connection-provider";
import { listPhoneNumbers, type MetaPhoneNumber } from "@/lib/whatsapp";
import {
  validateMetaAppInput,
  validateWabaAccess,
  queryWabaPhoneNumbers,
  verifyTenantWabaOnboarding,
  atomicReserveWabaDraft,
  type ActionResult,
  type ValidateWabaResult,
  type WabaPhoneNumberOption,
} from "@/lib/whatsapp-connection-validation";

export { validateMetaAppInput, validateWabaAccess, queryWabaPhoneNumbers, verifyTenantWabaOnboarding, atomicReserveWabaDraft };
export type { ActionResult, ValidateWabaResult, WabaPhoneNumberOption };

async function revalidateSettings() {
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/whatsapp");
  } catch {}
}

const DIGITS = /^\d{6,30}$/;
const HEX_SECRET = /^[a-fA-F0-9]{20,64}$/;
const META_TOKEN = /^EA[A-Za-z0-9_]{20,}$/;

/**
 * Step 3: Retrieves available registered phone numbers under the WABA.
 * Secure: Requires manager capability, client binding, onboarding attempt verification,
 * and strict argument validation.
 */
export async function fetchWabaPhoneNumbers(
  wabaId: string,
  token: string,
  graphVersion?: string,
  attemptId?: string,
): Promise<ActionResult<WabaPhoneNumberOption[]>> {
  const scope = await requireManager(true);
  if ("denied" in scope) {
    return { ok: false, message: scope.denied };
  }

  const targetClientId = scope.clientId;
  if (!targetClientId) {
    return { ok: false, message: "No tenant context found for manager." };
  }

  // Tenant-bound WABA & token onboarding verification (SEC-01)
  const authCheck = await verifyTenantWabaOnboarding(
    { clientId: targetClientId, wabaId, token, graphVersion, attemptId },
    {
      findForeignReservation: async (waba, client) => {
        const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30-min attempt TTL
        const found = await db.whatsAppConnection.findFirst({
          where: {
            wabaId: waba,
            clientId: { not: client },
            OR: [
              { status: { in: ["ACTIVE", "VALIDATING", "PENDING_WEBHOOK"] } },
              { status: "DRAFT", lastValidatedAt: { gte: cutoff } },
            ],
          },
        });
        return !!found;
      },
      findTenantConnection: async (waba, client) => {
        const found = await db.whatsAppConnection.findFirst({
          where: { wabaId: waba, clientId: client, status: { in: ["DRAFT", "VALIDATING", "ACTIVE"] } },
        });
        if (!found) return null;
        return {
          id: found.id,
          clientId: found.clientId,
          wabaId: found.wabaId,
          token: found.token,
          status: found.status,
          lastValidatedAt: found.lastValidatedAt,
        };
      },
      validateWabaMetaAccess: async (waba, tok, ver) => {
        return validateWabaAccess(waba, tok, ver);
      },
      upsertDraftConnection: async (client, waba, tok, ver) => {
        // Atomic concurrency guard with PostgreSQL advisory xact lock:
        // Serializes concurrent onboarding attempts and prevents competing draft reservations.
        await atomicReserveWabaDraft(db, client, waba, tok, ver);
      },
      updateDraftToken: async (connId, tok) => {
        await db.whatsAppConnection.update({
          where: { id: connId },
          data: { token: tok, lastValidatedAt: new Date() },
        });
      },
    }
  );

  if (!authCheck.ok) {
    return { ok: false, message: authCheck.message };
  }

  return queryWabaPhoneNumbers(wabaId, token, graphVersion, {
    lookupExisting: async (ids) => {
      const existing = await db.whatsAppNumber.findMany({
        where: { phoneNumberId: { in: ids } },
        include: { client: { select: { name: true } } },
      });
      return existing.map((e) => ({ phoneNumberId: e.phoneNumberId, clientName: e.client.name }));
    },
  });
}

export interface SaveManualConnectionInput {
  clientId?: string;
  appId: string;
  appSecret: string;
  appName?: string;
  wabaId: string;
  token: string;
  graphVersion?: string;
  verifyToken?: string;
  selectedPhoneNumbers: {
    phoneNumberId: string;
    label: string;
    isDefault?: boolean;
  }[];
}

/**
 * Step 5: Completes validation and saves the manual connection in the database.
 * Encrypts credentials at rest and activates the connection only after server verification.
 */
export async function saveManualWhatsAppConnection(
  input: SaveManualConnectionInput,
): Promise<ActionResult<{ connectionId: string }>> {
  const user = await requireUser();
  const scope = await getScope();

  // Tenant authorization: ADMIN can specify any clientId; CLIENT manager can only configure their own clientId
  let targetClientId = user.clientId;
  if (user.role === "ADMIN" && input.clientId) {
    targetClientId = input.clientId;
  }
  if (!targetClientId) {
    return { ok: false, message: "No tenant context found for this operation." };
  }
  if (user.role !== "ADMIN" && (!scope.manager || scope.viewOnly)) {
    return { ok: false, message: "Only business managers or administrators can configure WhatsApp integrations." };
  }

  // 1. Validate App details
  const appValid = await validateMetaAppInput(input.appId, input.appSecret);
  if (!appValid.ok) return { ok: false, message: appValid.message };

  // 2. Validate WABA access
  const wabaValid = await validateWabaAccess(input.wabaId, input.token, input.graphVersion);
  if (!wabaValid.ok) return { ok: false, message: wabaValid.message };

  // 3. Validate selected phone numbers
  if (!input.selectedPhoneNumbers || input.selectedPhoneNumbers.length === 0) {
    return { ok: false, message: "Please select at least one phone number to connect." };
  }

  const version = normalizeGraphVersion(input.graphVersion);
  const trimmedAppId = input.appId.trim();
  const trimmedAppSecret = input.appSecret.trim();
  const trimmedToken = input.token.trim();
  const trimmedWaba = input.wabaId.trim();
  const verifyToken = input.verifyToken?.trim() || `thabaal_verify_${trimmedAppId}`;

  // Enforce strict tenant ownership: Reject cross-tenant App ID hijacking
  const existingApp = await db.metaAppCredential.findUnique({
    where: { appId: trimmedAppId },
  });
  if (existingApp && existingApp.clientId && existingApp.clientId !== targetClientId) {
    return {
      ok: false,
      message: `Meta App ID ${trimmedAppId} is already registered to another tenant. Cross-tenant credential sharing is strictly prohibited.`,
    };
  }

  // Enforce strict tenant ownership: Reject cross-tenant phone number hijacking
  const existingAssignedNumbers = await db.whatsAppNumber.findMany({
    where: { phoneNumberId: { in: input.selectedPhoneNumbers.map((n) => n.phoneNumberId) } },
    select: { phoneNumberId: true, clientId: true },
  });
  for (const num of existingAssignedNumbers) {
    if (num.clientId !== targetClientId) {
      return {
        ok: false,
        message: `Phone Number ID ${num.phoneNumberId} is already assigned to another tenant. Cross-tenant number assignment is prohibited.`,
      };
    }
  }

  try {
    // 4. Subscribe the Meta App to WABA webhooks
    const subUrl = `https://graph.facebook.com/${version}/${trimmedWaba}/subscribed_apps`;
    const subRes = await fetch(subUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${trimmedToken}` },
      cache: "no-store",
    });
    const subJson = (await subRes.json().catch(() => ({}))) as { success?: boolean };
    const webhookSubscribed = subRes.ok && subJson.success !== false;

    // 5. Upsert MetaAppCredential for this tenant (AES-256-GCM encrypted via db.ts)
    const appCred = await db.metaAppCredential.upsert({
      where: { appId: trimmedAppId },
      create: {
        appId: trimmedAppId,
        appName: input.appName?.trim() || wabaValid.data?.name || "Meta App",
        appSecret: trimmedAppSecret,
        verifyToken,
        isPlatformApp: false,
        clientId: targetClientId,
      },
      update: {
        appName: input.appName?.trim() || wabaValid.data?.name || "Meta App",
        appSecret: trimmedAppSecret,
        verifyToken,
        clientId: targetClientId,
      },
    });

    // 6. Upsert WhatsAppConnection for this tenant and WABA
    const connection = await db.whatsAppConnection.upsert({
      where: {
        clientId_wabaId: {
          clientId: targetClientId,
          wabaId: trimmedWaba,
        },
      },
      create: {
        clientId: targetClientId,
        appCredentialId: appCred.id,
        onboardingMode: "MANUAL",
        wabaId: trimmedWaba,
        token: trimmedToken,
        graphVersion: version,
        status: "ACTIVE",
        webhookSubscribed,
        lastValidatedAt: new Date(),
        assetCheck: {
          wabaName: wabaValid.data?.name,
          currency: wabaValid.data?.currency,
          timezone: wabaValid.data?.timezoneId,
        },
      },
      update: {
        appCredentialId: appCred.id,
        onboardingMode: "MANUAL",
        token: trimmedToken,
        graphVersion: version,
        status: "ACTIVE",
        webhookSubscribed,
        lastValidatedAt: new Date(),
        lastErrorCode: null,
        lastErrorDetails: null,
      },
    });

    // 7. Fetch verified phone number details from Meta for the selected numbers
    const phoneRes = await fetchWabaPhoneNumbers(trimmedWaba, trimmedToken, version);
    const availableNumbers = phoneRes.ok && phoneRes.data ? phoneRes.data : [];

    for (let i = 0; i < input.selectedPhoneNumbers.length; i++) {
      const item = input.selectedPhoneNumbers[i];
      const metaNumber = availableNumbers.find((n) => n.id === item.phoneNumberId);
      const isDefault = item.isDefault ?? (i === 0);

      await db.whatsAppNumber.upsert({
        where: { phoneNumberId: item.phoneNumberId },
        create: {
          clientId: targetClientId,
          connectionId: connection.id,
          label: item.label.trim() || metaNumber?.verifiedName || `Number ${i + 1}`,
          phoneNumberId: item.phoneNumberId,
          businessAccountId: trimmedWaba,
          displayPhone: metaNumber?.displayPhoneNumber,
          verifiedName: metaNumber?.verifiedName,
          qualityRating: metaNumber?.qualityRating,
          isDefault,
        },
        update: {
          clientId: targetClientId,
          connectionId: connection.id,
          label: item.label.trim() || metaNumber?.verifiedName || "WhatsApp Number",
          businessAccountId: trimmedWaba,
          displayPhone: metaNumber?.displayPhoneNumber,
          verifiedName: metaNumber?.verifiedName,
          qualityRating: metaNumber?.qualityRating,
          ...(isDefault ? { isDefault: true } : {}),
        },
      });
    }

    // 8. Also update client fallback fields for full backward compatibility
    await db.client.update({
      where: { id: targetClientId },
      data: {
        waToken: trimmedToken,
        waBusinessAccountId: trimmedWaba,
        waPhoneNumberId: input.selectedPhoneNumbers[0]?.phoneNumberId,
      },
    });

    await revalidateSettings();

    return { ok: true, data: { connectionId: connection.id } };
  } catch (e) {
    return {
      ok: false,
      message: `Failed to persist connection: ${e instanceof Error ? e.message : "database error"}`,
    };
  }
}

export interface ConnectionSummary {
  connected: boolean;
  connectionId?: string;
  onboardingMode?: string;
  status?: string;
  wabaId?: string;
  maskedToken?: string;
  maskedAppSecret?: string;
  appId?: string;
  appName?: string;
  webhookSubscribed?: boolean;
  lastValidatedAt?: string;
  phoneNumbers: {
    id: string;
    phoneNumberId: string;
    displayPhone?: string | null;
    verifiedName?: string | null;
    label: string;
    isDefault: boolean;
  }[];
}

/**
 * Reads masked connection summary for the current or target client.
 */
export async function getClientWhatsAppConnection(
  clientId?: string,
): Promise<ActionResult<ConnectionSummary>> {
  const user = await requireUser();
  const targetClientId = (user.role === "ADMIN" && clientId) ? clientId : user.clientId;
  if (!targetClientId) return { ok: false, message: "No tenant context found." };

  const conn = await db.whatsAppConnection.findFirst({
    where: { clientId: targetClientId },
    include: {
      appCredential: true,
      numbers: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (conn) {
    return {
      ok: true,
      data: {
        connected: conn.status === "ACTIVE",
        connectionId: conn.id,
        onboardingMode: conn.onboardingMode,
        status: conn.status,
        wabaId: conn.wabaId,
        maskedToken: maskSecret(conn.token),
        maskedAppSecret: maskSecret(conn.appCredential?.appSecret),
        appId: conn.appCredential?.appId,
        appName: conn.appCredential?.appName ?? undefined,
        webhookSubscribed: conn.webhookSubscribed,
        lastValidatedAt: conn.lastValidatedAt?.toISOString(),
        phoneNumbers: conn.numbers.map((n) => ({
          id: n.id,
          phoneNumberId: n.phoneNumberId,
          displayPhone: n.displayPhone,
          verifiedName: n.verifiedName,
          label: n.label,
          isDefault: n.isDefault,
        })),
      },
    };
  }

  // Fallback to legacy client record
  const client = await db.client.findUnique({
    where: { id: targetClientId },
    include: { numbers: true },
  });

  if (client?.waToken && client.numbers.length > 0) {
    return {
      ok: true,
      data: {
        connected: true,
        onboardingMode: "MANUAL",
        status: "ACTIVE",
        wabaId: client.waBusinessAccountId ?? undefined,
        maskedToken: maskSecret(client.waToken),
        maskedAppSecret: maskSecret(process.env.META_APP_SECRET),
        appId: process.env.META_APP_ID,
        webhookSubscribed: true,
        lastValidatedAt: client.createdAt.toISOString(),
        phoneNumbers: client.numbers.map((n) => ({
          id: n.id,
          phoneNumberId: n.phoneNumberId,
          displayPhone: n.displayPhone,
          verifiedName: n.verifiedName,
          label: n.label,
          isDefault: n.isDefault,
        })),
      },
    };
  }

  return {
    ok: true,
    data: {
      connected: false,
      phoneNumbers: [],
    },
  };
}

/**
 * Safely disconnects the WhatsApp integration for the tenant.
 */
export async function disconnectWhatsAppConnection(
  clientId?: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const scope = await getScope();
  const targetClientId = (user.role === "ADMIN" && clientId) ? clientId : user.clientId;

  if (!targetClientId) return { ok: false, message: "No tenant context found." };
  if (user.role !== "ADMIN" && (!scope.manager || scope.viewOnly)) {
    return { ok: false, message: "Permission denied." };
  }

  await db.whatsAppConnection.updateMany({
    where: { clientId: targetClientId },
    data: { status: "DISCONNECTED" },
  });

  await revalidateSettings();

  return { ok: true, message: "WhatsApp connection disconnected." };
}
