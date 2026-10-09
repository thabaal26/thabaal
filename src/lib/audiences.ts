import "server-only";
import type { Prisma } from "@prisma/client";
import { AUDIENCE_PREFIX, decodeTags } from "./audience-tags";
import { db } from "./db";

// Saved audiences: a named filter over a client's customers that campaigns can send to.
// Campaigns store it as audienceTag "aud:<id>"; tags work too (see src/lib/audience-tags.ts).

export type AudienceFilter = {
  /** Customer must have every one of these tags. */
  tags?: string[];
  /** And none of these. */
  excludeTags?: string[];
  region?: string;
  /** Area as written on the customer, e.g. "Sellur". */
  area?: string;
  /** Text found in what they buy or in any of their orders, e.g. "ghee". */
  bought?: string;
  /** Ordered within the last N days. */
  orderedWithinDays?: number;
  /** Has ordered before, but not in the last N days. */
  noOrderForDays?: number;
  neverOrdered?: boolean;
};

const DAY = 86_400_000;
export { AUDIENCE_PREFIX };

export function cleanFilter(f: AudienceFilter): AudienceFilter {
  const tags = (xs?: string[]) => [...new Set((xs ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const days = (n?: number) => (n && n > 0 && n <= 3650 ? Math.round(n) : undefined);
  return {
    ...(tags(f.tags).length && { tags: tags(f.tags) }),
    ...(tags(f.excludeTags).length && { excludeTags: tags(f.excludeTags) }),
    ...(f.region?.trim() && { region: f.region.trim() }),
    ...(f.area?.trim() && { area: f.area.trim() }),
    ...(f.bought?.trim() && { bought: f.bought.trim().slice(0, 60) }),
    ...(days(f.orderedWithinDays) && { orderedWithinDays: days(f.orderedWithinDays) }),
    ...(days(f.noOrderForDays) && { noOrderForDays: days(f.noOrderForDays) }),
    ...(f.neverOrdered && { neverOrdered: true }),
  };
}

/** Customers matching the filter: always opted in and reachable, like any campaign audience. */
export async function audienceWhere(clientId: string, raw: AudienceFilter, now = new Date()): Promise<Prisma.CustomerWhereInput> {
  const f = cleanFilter(raw);
  const and: Prisma.CustomerWhereInput[] = [{ clientId, optedOut: false, unreachable: false }];
  if (f.tags) and.push({ tags: { hasEvery: f.tags } });
  if (f.excludeTags) and.push({ NOT: { tags: { hasSome: f.excludeTags } } });
  if (f.region) and.push({ region: { equals: f.region, mode: "insensitive" } });
  if (f.area) and.push({ location: { contains: f.area, mode: "insensitive" } });
  if (f.bought) {
    // Order items are JSON; search their text so "ghee" finds "Ghee 500 ml".
    const rows = await db.$queryRaw<{ customerId: string }[]>`
      SELECT DISTINCT "customerId" FROM "Order" WHERE "clientId" = ${clientId} AND status <> 'CANCELLED' AND items::text ILIKE ${`%${f.bought}%`}`;
    and.push({ OR: [{ purchases: { contains: f.bought, mode: "insensitive" } }, { id: { in: rows.map((r) => r.customerId) } }] });
  }
  const live = { status: { not: "CANCELLED" as const } };
  if (f.orderedWithinDays) and.push({ orders: { some: { ...live, createdAt: { gte: new Date(now.getTime() - f.orderedWithinDays * DAY) } } } });
  if (f.noOrderForDays) {
    and.push({ orders: { some: live } });
    and.push({ orders: { none: { ...live, createdAt: { gte: new Date(now.getTime() - f.noOrderForDays * DAY) } } } });
  }
  if (f.neverOrdered) and.push({ orders: { none: live } });
  return { AND: and };
}

/** Plain-language summary, e.g. "tagged ghee · in Sellur · no order for 30 days". */
export function describeFilter(raw: AudienceFilter) {
  const f = cleanFilter(raw);
  const parts = [
    f.tags && `tagged ${f.tags.join(" + ")}`,
    f.excludeTags && `not tagged ${f.excludeTags.join(", ")}`,
    f.region && f.region,
    f.area && `in ${f.area}`,
    f.bought && `bought “${f.bought}”`,
    f.orderedWithinDays && `ordered in the last ${f.orderedWithinDays} days`,
    f.noOrderForDays && `no order for ${f.noOrderForDays}+ days`,
    f.neverOrdered && "never ordered",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "all opted-in customers";
}

/** The customer filter for a campaign's audienceTag: a saved audience, one or more tags, or everyone. */
export async function campaignAudienceWhere(clientId: string, audienceTag: string | null): Promise<Prisma.CustomerWhereInput> {
  const base = { clientId, optedOut: false, unreachable: false };
  if (!audienceTag) return base;
  if (audienceTag.startsWith(AUDIENCE_PREFIX)) {
    const a = await db.audience.findFirst({ where: { id: audienceTag.slice(AUDIENCE_PREFIX.length), clientId } });
    // A deleted audience must not fall back to "everyone".
    if (!a) return { id: { in: [] } };
    return audienceWhere(clientId, a.filter as AudienceFilter);
  }
  const pick = decodeTags(audienceTag);
  // A tag list that can't be read must not fall back to "everyone" either.
  if (!pick?.tags.length) return { id: { in: [] } };
  if (pick.tags.length === 1) return { ...base, tags: { has: pick.tags[0] } };
  return { ...base, tags: pick.match === "all" ? { hasEvery: pick.tags } : { hasSome: pick.tags } };
}
