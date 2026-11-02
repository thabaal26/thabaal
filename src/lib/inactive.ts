import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { codesOf } from "./meta-errors";
import { HELD_CODES } from "./held";
import { INACTIVE_TAG } from "./schedule";

// Inactive customers: a campaign failed for them for a reason that resending won't fix (Meta 131026: no WhatsApp,
// an old app or they blocked you; 130472: in Meta's test without offers), or Meta held the offer back twice. The
// campaign page suggests moving them to Inactive and the business decides; the tag INACTIVE_TAG then keeps them
// out of campaigns (lib/audiences.ts). Taking the tag off brings them back.

export const INACTIVE_GROUPS = ["unreachable", "experiment", "heldTwice"] as const;
export type InactiveGroup = (typeof INACTIVE_GROUPS)[number];

const GROUP_CODES: Record<Exclude<InactiveGroup, "heldTwice">, number[]> = {
  unreachable: codesOf(["unreachable"]),
  experiment: codesOf(["experiment"]),
};

/** For these runs, the customers each suggestion would move to Inactive (not already there). */
export async function inactiveCandidates(runIds: string[]): Promise<Record<InactiveGroup, string[]>> {
  const out: Record<InactiveGroup, string[]> = { unreachable: [], experiment: [], heldTwice: [] };
  if (!runIds.length) return out;
  const rows = await db.$queryRaw<{ customerId: string; errorCode: number; n: bigint }[]>`
    SELECT m."customerId", m."errorCode", count(*) AS n
    FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
    WHERE m."runId" IN (${Prisma.join(runIds)}) AND m.status = 'FAILED' AND m."errorCode" IS NOT NULL
      AND NOT (${INACTIVE_TAG} = ANY(c.tags))
    GROUP BY m."customerId", m."errorCode"`;
  const seen = { unreachable: new Set<string>(), experiment: new Set<string>(), heldTwice: new Set<string>() };
  for (const r of rows) {
    if (GROUP_CODES.unreachable.includes(r.errorCode)) seen.unreachable.add(r.customerId);
    else if (GROUP_CODES.experiment.includes(r.errorCode)) seen.experiment.add(r.customerId);
    else if (HELD_CODES.includes(r.errorCode) && Number(r.n) >= 2) seen.heldTwice.add(r.customerId);
  }
  for (const g of INACTIVE_GROUPS) out[g] = [...seen[g]];
  return out;
}

/** Tags these customers of the client Inactive; returns how many were moved. */
export async function moveToInactive(clientId: string, customerIds: string[]) {
  if (!customerIds.length) return 0;
  const r = await db.customer.updateMany({
    where: { clientId, id: { in: customerIds }, NOT: { tags: { has: INACTIVE_TAG } } },
    data: { tags: { push: INACTIVE_TAG } },
  });
  return r.count;
}
