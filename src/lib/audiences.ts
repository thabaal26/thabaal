import "server-only";
import type { Prisma } from "@prisma/client";
import { AUDIENCE_PREFIX, decodeTags } from "./audience-tags";
import { db } from "./db";
import { catalogFor, customersWithProducts } from "./product-scope";
import { normKey } from "./catalog-match";
import { INACTIVE_TAG } from "./schedule";
import { SKIP_CODES, SKIP_DAYS } from "./held";
import { withSamePerson } from "./linked-numbers";
import { cleanSegments, segmentCustomerIds } from "./engagement-segments";

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
    // Catalogue products whose name has the words typed ("ghee" finds "Ghee 100ml"), and who bought them.
    const catalog = await catalogFor(clientId);
    const want = normKey(f.bought);
    const names = catalog.products.filter((p) => normKey(p.name).includes(want)).map((p) => p.name);
    const exact = catalog.item({ name: f.bought });
    if (exact) names.push(exact.name);
    and.push({ id: { in: names.length ? await customersWithProducts(clientId, names) : [] } });
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

/** People added to or left out of a campaign by hand (Campaign.includeIds / excludeIds), and its engagement segments. */
export type CampaignPeople = { includeIds?: readonly string[]; excludeIds?: readonly string[]; segments?: readonly string[] };

/**
 * The customer filter for a campaign: its audienceTag (a saved audience, one or more tags, or everyone), plus the
 * people added by hand, minus the people left out (each with all their numbers). With segments (Engaged, Seen, Reached, Dormant,
 * Inactive, Not reached yet; lib/engagement-segments.ts), "Send to" keeps only customers in one of them, worked out
 * from the business's whole campaign history at that moment. Opted-out and unreachable customers are never in it; Inactive
 * ones (INACTIVE_TAG) only when the campaign picks that tag or adds them by hand.
 */
export async function campaignAudienceWhere(clientId: string, audienceTag: string | null, people: CampaignPeople = {}): Promise<Prisma.CustomerWhereInput> {
  const picked = await sendToWhere(clientId, audienceTag);
  const segments = cleanSegments(people.segments);
  const kept = decodeTags(audienceTag)?.tags.includes(INACTIVE_TAG) ? picked : { AND: [picked, { NOT: { tags: { has: INACTIVE_TAG } } }] };
  const send: Prisma.CustomerWhereInput = segments.length ? { AND: [kept, { id: { in: await segmentCustomerIds(clientId, segments) } }] } : kept;
  // A person with several numbers is added or left out as a whole (lib/linked-numbers.ts).
  const include = await withSamePerson(clientId, people.includeIds ?? []);
  const exclude = await withSamePerson(clientId, people.excludeIds ?? []);
  if (!include.length && !exclude.length) return send;
  return {
    AND: [
      include.length ? { OR: [send, { id: { in: include }, clientId, optedOut: false, unreachable: false }] } : send,
      ...(exclude.length ? [{ id: { notIn: exclude } }] : []),
    ],
  };
}

/**
 * Customers a campaign starting at `at` would skip at send time (lib/dispatcher.ts): they got an offer within the
 * business's gap between offers, or Meta held one back from them lately (lib/held.ts).
 */
export function offerSkipWhere(gapHours: number, at: Date): Prisma.CustomerWhereInput {
  const recent: Prisma.MessageWhereInput[] = [{ status: "FAILED", errorCode: { in: SKIP_CODES }, failedAt: { gt: new Date(at.getTime() - SKIP_DAYS * DAY) } }];
  if (gapHours > 0) recent.push({ status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: new Date(at.getTime() - gapHours * 3_600_000) }, template: { category: "MARKETING" } });
  return { messages: { some: { OR: recent } } };
}

/** A one-time campaign sent again within this many days is the same send carried on (see alreadyReachedWhere). */
export const RESUME_WITHIN_DAYS = 7;

/**
 * Customers this campaign already reached lately (Meta accepted its message in the last RESUME_WITHIN_DAYS). A
 * one-time campaign sent again soon, say after it was stopped, goes only to the rest: nobody gets the same offer
 * twice. Reused later (a new date next month), it goes to everyone again.
 */
export function alreadyReachedWhere(campaignId: string, now = new Date()): Prisma.CustomerWhereInput {
  const since = new Date(now.getTime() - RESUME_WITHIN_DAYS * DAY);
  return { messages: { some: { status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: since }, run: { campaignId } } } };
}

/** The customer filter for a campaign's audienceTag alone. */
async function sendToWhere(clientId: string, audienceTag: string | null): Promise<Prisma.CustomerWhereInput> {
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
