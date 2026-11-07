// Whether a business may use thabaal right now (see accessState in subscription-core.ts for the rules).
// Read on every request for client logins (lib/session.ts getScope), so it is one small query per request.

import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { db } from "./db";
import { accessState, type AccessInfo } from "./subscription-core";

export type ClientAccess = AccessInfo & {
  planRequired: boolean;
  /** A payment reference waiting to be checked. Shown to the owner; it never unlocks anything. */
  pending: { plan: string; cycle: string; utr: string | null; createdAt: Date } | null;
};

const ROW = { id: true, plan: true, cycle: true, status: true, startsAt: true, endsAt: true, createdAt: true, utr: true } as const;

/** What clientAccess reads, as a nested select on Client: getScope reads it with the login in one query. */
export const ACCESS_SELECT = { planRequired: true, planPurchases: { where: { status: { in: ["VERIFIED", "PENDING"] } }, select: ROW } } satisfies Prisma.ClientSelect;

type AccessRows = { planRequired: boolean; planPurchases: Prisma.PlanPurchaseGetPayload<{ select: typeof ROW }>[] };

/** clientAccess on rows already read (ACCESS_SELECT). */
export function accessFrom(client: AccessRows | null, now = new Date()): ClientAccess {
  const rows = client?.planPurchases ?? [];
  const planRequired = client?.planRequired ?? false;
  const pending = rows.find((r) => r.status === "PENDING") ?? null;
  return {
    ...accessState(rows, planRequired, now),
    planRequired,
    pending: pending ? { plan: pending.plan, cycle: pending.cycle, utr: pending.utr, createdAt: pending.createdAt } : null,
  };
}

export async function clientAccess(clientId: string, now = new Date()): Promise<ClientAccess> {
  const [client, rows] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { planRequired: true } }),
    db.planPurchase.findMany({ where: { clientId, status: { in: ["VERIFIED", "PENDING"] } }, select: ROW }),
  ]);
  return accessFrom(client ? { planRequired: client.planRequired, planPurchases: rows } : { planRequired: false, planPurchases: rows }, now);
}

// This request's access already worked out from rows getScope read with the login (one Map per request).
const seeded = cache(() => new Map<string, ClientAccess>());
const readAccess = cache((clientId: string) => clientAccess(clientId));

/** Keeps this request's access for a business, so clientAccessNow doesn't read it again. */
export function seedAccess(clientId: string, access: ClientAccess) {
  seeded().set(clientId, access);
}

/** clientAccess for this request: getScope and the dashboard layout both need it, so it is read once per page. */
export const clientAccessNow = (clientId: string): Promise<ClientAccess> => {
  const known = seeded().get(clientId);
  return known ? Promise.resolve(known) : readAccess(clientId);
};

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
