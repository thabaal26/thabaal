import { db } from "./db";
import { LOYALTY_RULE_FIELDS, loyaltyRules, type LoyaltyRules } from "./loyalty";

/** A client's loyalty rules (Payments › Settings); the defaults when they can't be read. */
export async function loyaltyRulesFor(clientId: string): Promise<LoyaltyRules> {
  const c = await db.client.findUnique({ where: { id: clientId }, select: LOYALTY_RULE_FIELDS }).catch(() => null);
  return loyaltyRules(c);
}
