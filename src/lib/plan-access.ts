// Whether a business may use thabaal right now (see accessState in subscription-core.ts for the rules).
// Read on every request for client logins (lib/session.ts getScope), so it is one small query per request.

import { db } from "./db";
import { accessState, type AccessInfo } from "./subscription-core";

export type ClientAccess = AccessInfo & {
  planRequired: boolean;
  /** A payment reference waiting to be checked. Shown to the owner; it never unlocks anything. */
  pending: { plan: string; cycle: string; utr: string | null; createdAt: Date } | null;
};

const ROW = { id: true, plan: true, cycle: true, status: true, startsAt: true, endsAt: true, createdAt: true, utr: true } as const;

export async function clientAccess(clientId: string, now = new Date()): Promise<ClientAccess> {
  const [client, rows] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { planRequired: true } }),
    db.planPurchase.findMany({ where: { clientId, status: { in: ["VERIFIED", "PENDING"] } }, select: ROW }),
  ]);
  const planRequired = client?.planRequired ?? false;
  const pending = rows.find((r) => r.status === "PENDING") ?? null;
  return {
    ...accessState(rows, planRequired, now),
    planRequired,
    pending: pending ? { plan: pending.plan, cycle: pending.cycle, utr: pending.utr, createdAt: pending.createdAt } : null,
  };
}

/** Businesses that are locked now: their campaigns and automatic messages wait until they pay. */
export async function lockedClientIds(now = new Date()): Promise<Set<string>> {
  const [required, rows] = await Promise.all([
    db.client.findMany({ where: { planRequired: true }, select: { id: true } }),
    db.planPurchase.findMany({ where: { status: "VERIFIED" }, select: { ...ROW, clientId: true } }),
  ]);
  const ids = new Set([...required.map((c) => c.id), ...rows.map((r) => r.clientId)]);
  const requiredIds = new Set(required.map((c) => c.id));
  const locked = new Set<string>();
  for (const id of ids) {
    if (accessState(rows.filter((r) => r.clientId === id), requiredIds.has(id), now).locked) locked.add(id);
  }
  return locked;
}
