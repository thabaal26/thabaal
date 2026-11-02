import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

// Who isn't opening offers: their last few campaign messages reached the phone (delivered) but none was read. Meta
// weighs how people react to a business's marketing, and keeps offering to people who never open them hurts the
// number's quality. Some people turn read receipts off, so their messages never show as read: this is a
// recommendation the business switches on per campaign (Campaign.skipUnread), never a rule.

/** How many recent offers count, and how far back. */
export const UNREAD_OFFERS = 3;
export const UNREAD_WITHIN_DAYS = 60;

/**
 * Of these customers (or every customer of the client), the ones whose last UNREAD_OFFERS campaign messages in the
 * last UNREAD_WITHIN_DAYS days were all delivered and none read.
 */
export async function notOpeningOffers(clientId: string, customerIds?: string[], now = new Date()): Promise<Set<string>> {
  if (customerIds && !customerIds.length) return new Set();
  const since = new Date(now.getTime() - UNREAD_WITHIN_DAYS * 86_400_000);
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT x."customerId" AS id FROM (
      SELECT m."customerId", m.status,
        row_number() OVER (PARTITION BY m."customerId" ORDER BY m."sentAt" DESC) AS n
      FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
      WHERE c."clientId" = ${clientId} AND m."runId" IS NOT NULL AND m."sentAt" >= ${since}
        AND m.status IN ('DELIVERED', 'READ')
        ${customerIds ? Prisma.sql`AND m."customerId" IN (${Prisma.join(customerIds)})` : Prisma.empty}
    ) x
    WHERE x.n <= ${UNREAD_OFFERS}
    GROUP BY x."customerId"
    HAVING count(*) = ${UNREAD_OFFERS} AND count(*) FILTER (WHERE x.status = 'READ') = 0`;
  return new Set(rows.map((r) => r.id));
}
