import "server-only";
import { db } from "./db";
import { clientAccess } from "./plan-access";
import { resolveTenantConnection } from "./whatsapp-connection-provider";
import type { WorkspaceMode } from "@prisma/client";

export interface ReconcileResult {
  mode: WorkspaceMode;
  changed: boolean;
  reason: string;
  hasActiveConnection: boolean;
  hasActiveSubscription: boolean;
}

export interface TenantReadiness {
  clientId: string;
  clientName: string;
  workspaceMode: WorkspaceMode;
  lifecycleState: WorkspaceMode;
  canSendOutbound: boolean;
  canDispatchCampaigns: boolean;
  canMutateCustomers: boolean;
  canAccessBilling: boolean;
  hasActiveConnection: boolean;
  hasActiveSubscription: boolean;
  isSuspended: boolean;
  subscriptionPlan: string | null;
  connectionStatus: string | null;
  blockers: string[];
}

export interface SuperAdminOverrideOptions {
  actorUserId?: string;
  actorEmail?: string;
  adminUserId?: string;
  adminEmail?: string;
  reason?: string;
  correlationId?: string;
  breakGlass?: boolean;
}

/**
 * Resolves the comprehensive operational readiness of a tenant across:
 * 1. WorkspaceMode
 * 2. Subscription state (plan, validity, period)
 * 3. WhatsApp connection health (WABA, token, Phone Number ID)
 * 4. Administrative suspension status
 */
export async function resolveTenantReadiness(
  clientId: string,
  now = new Date(),
): Promise<TenantReadiness> {
  if (!clientId) {
    return {
      clientId: "",
      clientName: "Unknown",
      workspaceMode: "DEMO",
      lifecycleState: "DEMO",
      canSendOutbound: false,
      canDispatchCampaigns: false,
      canMutateCustomers: false,
      canAccessBilling: false,
      hasActiveConnection: false,
      hasActiveSubscription: false,
      isSuspended: false,
      subscriptionPlan: null,
      connectionStatus: null,
      blockers: ["No tenant context provided."],
    };
  }

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, workspaceMode: true, planRequired: true },
  });

  if (!client) {
    return {
      clientId,
      clientName: "Not Found",
      workspaceMode: "DEMO",
      lifecycleState: "DEMO",
      canSendOutbound: false,
      canDispatchCampaigns: false,
      canMutateCustomers: false,
      canAccessBilling: false,
      hasActiveConnection: false,
      hasActiveSubscription: false,
      isSuspended: false,
      subscriptionPlan: null,
      connectionStatus: null,
      blockers: ["Tenant not found in database."],
    };
  }

  const [connection, access] = await Promise.all([
    resolveTenantConnection(clientId),
    clientAccess(clientId, now),
  ]);

  const hasActiveConnection = Boolean(
    connection &&
    connection.token &&
    connection.defaultPhoneNumberId &&
    connection.wabaId &&
    connection.status === "ACTIVE",
  );
  const hasActiveSubscription = client.planRequired
    ? !access.locked && (access.state === "ok" || access.state === "due")
    : !access.locked;
  const isSuspended = client.workspaceMode === "SUSPENDED";
  const blockers: string[] = [];

  if (isSuspended) {
    blockers.push("Tenant is administratively suspended.");
  }
  if (!hasActiveSubscription) {
    blockers.push("No active, verified paid subscription.");
  }
  if (!hasActiveConnection) {
    blockers.push("No verified active WhatsApp connection configured.");
  }

  const canSendOutbound = !isSuspended && client.workspaceMode === "LIVE_ACTIVE" && hasActiveSubscription && hasActiveConnection;
  const canDispatchCampaigns = canSendOutbound;
  const canMutateCustomers = !isSuspended && !access.locked;
  const canAccessBilling = true;

  return {
    clientId: client.id,
    clientName: client.name,
    workspaceMode: client.workspaceMode,
    lifecycleState: client.workspaceMode,
    canSendOutbound,
    canDispatchCampaigns,
    canMutateCustomers,
    canAccessBilling,
    hasActiveConnection,
    hasActiveSubscription,
    isSuspended,
    subscriptionPlan: access.plan,
    connectionStatus: connection?.status ?? null,
    blockers,
  };
}

/**
 * Reconciles and transitions a tenant's WorkspaceMode based on authoritative rules:
 * 1. SUSPENDED tenants remain SUSPENDED until explicit administrative break-glass review.
 * 2. BOTH active connection AND active subscription -> LIVE_ACTIVE
 * 3. Active connection BUT no subscription -> LIVE_PENDING_PAYMENT (credentials ready, awaiting payment)
 * 4. Active subscription BUT no connection -> LIVE_PENDING_CONNECTION (payment verified, awaiting WhatsApp setup)
 * 5. Neither connection NOR subscription -> DEMO
 */
export async function reconcileTenantWorkspaceMode(
  clientId: string,
  now = new Date(),
): Promise<ReconcileResult> {
  if (!clientId) {
    return {
      mode: "DEMO",
      changed: false,
      reason: "No clientId provided",
      hasActiveConnection: false,
      hasActiveSubscription: false,
    };
  }

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, workspaceMode: true, planRequired: true },
  });

  if (!client) {
    return {
      mode: "DEMO",
      changed: false,
      reason: "Client not found",
      hasActiveConnection: false,
      hasActiveSubscription: false,
    };
  }

  // Administrative hold: never automatically un-suspend
  if (client.workspaceMode === "SUSPENDED") {
    return {
      mode: "SUSPENDED",
      changed: false,
      reason: "Tenant is administratively suspended.",
      hasActiveConnection: false,
      hasActiveSubscription: false,
    };
  }

  const [connection, access] = await Promise.all([
    resolveTenantConnection(clientId),
    clientAccess(clientId, now),
  ]);

  const hasActiveConnection = Boolean(
    connection &&
    connection.token &&
    connection.defaultPhoneNumberId &&
    connection.wabaId &&
    connection.status === "ACTIVE",
  );
  const hasActiveSubscription = client.planRequired
    ? !access.locked && (access.state === "ok" || access.state === "due")
    : !access.locked;

  let targetMode: WorkspaceMode = client.workspaceMode;
  let reason = "No state transition required.";

  if (hasActiveConnection && hasActiveSubscription) {
    targetMode = "LIVE_ACTIVE";
    reason = "Tenant has validated WhatsApp credentials and active paid subscription. Full live capabilities activated.";
  } else if (hasActiveConnection && !hasActiveSubscription) {
    targetMode = "LIVE_PENDING_PAYMENT";
    reason = "WhatsApp credentials validated. Awaiting subscription plan payment.";
  } else if (!hasActiveConnection && hasActiveSubscription) {
    targetMode = "LIVE_PENDING_CONNECTION";
    reason = "Subscription plan payment verified. Awaiting WhatsApp Business account connection.";
  } else {
    // Neither connection nor active subscription
    targetMode = "DEMO";
    reason = "Workspace is in demo exploration mode. Awaiting WhatsApp setup and subscription payment.";
  }

  const changed = targetMode !== client.workspaceMode;

  if (changed) {
    await db.client.update({
      where: { id: clientId },
      data: {
        workspaceMode: targetMode,
        ...(targetMode === "LIVE_ACTIVE" ? { planRequired: true } : {}),
      },
    });
  }

  return {
    mode: targetMode,
    changed,
    reason,
    hasActiveConnection,
    hasActiveSubscription,
  };
}

/**
 * Super Admin manual mode override.
 * Requires administrator role verification.
 * For break-glass promotions to LIVE_ACTIVE without satisfied prerequisites,
 * requires explicit breakGlass flag, written justification, and creates an immutable audit record.
 */
export async function manuallySetWorkspaceMode(
  clientId: string,
  mode: WorkspaceMode,
  options?: SuperAdminOverrideOptions,
): Promise<{ ok: boolean; mode: WorkspaceMode; message: string }> {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, mode: "DEMO", message: "Client not found." };

  const previousMode = client.workspaceMode;

  // If promoting to LIVE_ACTIVE without validated payment/connection:
  if (mode === "LIVE_ACTIVE") {
    const readiness = await resolveTenantReadiness(clientId);
    if (!readiness.hasActiveConnection || !readiness.hasActiveSubscription) {
      if (!options?.breakGlass) {
        return {
          ok: false,
          mode: previousMode,
          message: "Tenant does not meet prerequisites for LIVE_ACTIVE (active connection and subscription required). Provide breakGlass: true with justification to override.",
        };
      }
      if (!options.reason || options.reason.trim().length < 8) {
        return {
          ok: false,
          mode: previousMode,
          message: "Break-glass override to LIVE_ACTIVE requires a detailed justification reason (minimum 8 characters).",
        };
      }
    }
  }

  await db.client.update({
    where: { id: clientId },
    data: {
      workspaceMode: mode,
      ...(mode === "LIVE_ACTIVE" ? { planRequired: true } : {}),
    },
  });

  // Record audit trail in PaymentEvent
  if (options?.actorUserId || options?.adminUserId || options?.breakGlass) {
    const actor = options.adminEmail || options.actorEmail || options.adminUserId || options.actorUserId || "super_admin";
    const bgPrefix = options.breakGlass ? "[SUPER_ADMIN_BREAK_GLASS] " : "";
    await db.paymentEvent.create({
      data: {
        clientId,
        source: "admin_override",
        status: "AUDIT",
        note: `${bgPrefix}[WORKSPACE_MODE_CHANGE] ${previousMode} -> ${mode} by ${actor}. Enterprise emergency reason: ${options.reason || "Administrative update"}`,
        raw: {
          actorUserId: options.adminUserId || options.actorUserId,
          actorEmail: options.adminEmail || options.actorEmail,
          previousMode,
          newMode: mode,
          reason: options.reason,
          correlationId: options.correlationId,
          breakGlass: Boolean(options.breakGlass),
          timestamp: new Date().toISOString(),
        },
      },
    }).catch((err) => console.error("[tenant-activation] Failed to record audit log:", err));
  }

  return {
    ok: true,
    mode,
    message: `Tenant ${client.name} workspace mode updated from ${previousMode} to ${mode}.`,
  };
}
