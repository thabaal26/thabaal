import "server-only";
import { numberHealth } from "./limits";

export type LimitSummary = { limit: number | null; left: number | null; known: boolean; checkedAt: string | null } | null;

/**
 * Today's Meta limit for one business, for the Campaigns page. Meta sets it per business portfolio, so the default
 * number's figures stand for all its numbers. Asks Meta again when the stored value is over 10 minutes old.
 */
export async function limitSummary(clientId: string | null | undefined): Promise<LimitSummary> {
  if (!clientId) return null;
  const health = await numberHealth(clientId);
  const n = health.find((h) => h.isDefault) ?? health[0];
  if (!n) return null;
  return { limit: n.limit, left: n.left, known: n.tierKnown, checkedAt: n.statusCheckedAt?.toISOString() ?? null };
}
