import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { SKIP_CODES, SKIP_DAYS } from "./held";
import { INACTIVE_TAG } from "./schedule";

// Engagement segments: how each customer has responded to a business's campaigns, worked out live from that
// business's own records every time they are read (messages and their Meta statuses, taps and replies, orders), over
// all its campaigns, never only the latest. A new tap or reply moves a customer at once; nothing is stored.
//
//   super    – Super active: tapped a button, replied or ordered within the business's engagementDays (default 90).
//   active   – Active: an offer reached them (delivered or read), no recent tap/reply/order, and not Inactive.
//   inactive – Inactive (low engagement): their last inactiveAfterOffers (default 3) delivered offers in a row got
//              no tap, reply or order after them, and nothing within engagementDays.
//   new      – Not reached yet: no offer has reached them and they never tapped, replied or ordered.
//
// Kept apart from it, never mixed into one status (a Super active customer can still be unreachable today):
//   delivery  – what happened to their latest offer (delivered / read / failed with Meta's code),
//   suppressed – opted out, can't receive WhatsApp, or moved to Inactive by the business (the "inactive" tag),
//   paused    – Meta is holding offers back for now (131049/130472, lib/held.ts): temporary, retried by its own rules.
// A failed send never counts as an offer that reached them, so a temporary Meta error can't make anyone Inactive.
// One person with several numbers (lib/linked-numbers.ts) is one customer here: every number gets the person's segment.

export const SEGMENTS = ["super", "active", "inactive", "new"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABEL: Record<Segment, { en: string; ta: string; hint: string; hintTa: string }> = {
  super: { en: "Super active", ta: "மிக ஆர்வமானவர்கள்", hint: "Tapped a button, replied or ordered lately", hintTa: "சமீபத்தில் பட்டனை அழுத்தினார், பதில் அனுப்பினார் அல்லது ஆர்டர் செய்தார்" },
  active: { en: "Active", ta: "செயலில் உள்ளவர்கள்", hint: "Offers reach them; no tap or reply lately", hintTa: "சலுகைகள் சென்றடைகின்றன; சமீபத்தில் பதில் இல்லை" },
  inactive: { en: "Inactive", ta: "ஆர்வம் குறைந்தவர்கள்", hint: "Several offers in a row with no response", hintTa: "தொடர்ந்து பல சலுகைகளுக்கு பதில் இல்லை" },
  new: { en: "Not reached yet", ta: "இன்னும் சென்றடையாதவர்கள்", hint: "No offer has reached them yet", hintTa: "இன்னும் எந்தச் சலுகையும் சென்றடையவில்லை" },
};

export const isSegment = (s: string): s is Segment => (SEGMENTS as readonly string[]).includes(s);
export const cleanSegments = (xs: readonly string[] | null | undefined) => [...new Set((xs ?? []).filter(isSegment))];

/** A tap or reply counts for the campaign message it answers (Meta's context.id), else for one sent this recently. */
export const ATTRIBUTION_DAYS = 3;

export type EngagementRow = {
  id: string;
  segment: Segment;
  lastInteractionAt: Date | null;
  buttons: number;
  replies: number;
  orders: number;
  /** Campaign offers that reached them (delivered or read), and how many of those were read. */
  delivered: number;
  read: number;
  /** Delivered offers since their last tap, reply or order (all of them when there was none). */
  sinceInteraction: number;
  lastOffer: { status: string; at: Date | null; errorCode: number | null } | null;
  suppressed: "opted-out" | "unreachable" | "moved-inactive" | null;
  pausedUntil: Date | null;
};

type Raw = {
  id: string;
  last_interaction: Date | null;
  buttons: number;
  replies: number;
  orders: number;
  delivered: number;
  read: number;
  since: number;
  last_status: string | null;
  last_at: Date | null;
  last_code: number | null;
  optedOut: boolean;
  unreachable: boolean;
  moved: boolean;
  paused_at: Date | null;
};

/** The business's thresholds (Client.engagementDays / inactiveAfterOffers), within sane bounds. */
export async function engagementRules(clientId: string) {
  const c = await db.client.findUnique({ where: { id: clientId }, select: { engagementDays: true, inactiveAfterOffers: true } });
  return { days: Math.min(730, Math.max(7, c?.engagementDays ?? 90)), offers: Math.min(20, Math.max(1, c?.inactiveAfterOffers ?? 3)) };
}

/** The segment from a customer's figures (the one rule; the SQL only gathers the figures). */
export function segmentOf(r: { lastInteractionAt: Date | null; delivered: number; sinceInteraction: number }, rules: { days: number; offers: number }, now = new Date()): Segment {
  if (r.lastInteractionAt && r.lastInteractionAt.getTime() >= now.getTime() - rules.days * 86_400_000) return "super";
  if (r.delivered === 0 && !r.lastInteractionAt) return "new";
  if (r.sinceInteraction >= rules.offers) return "inactive";
  // Reached before, or answered long ago and not offered enough since to call them Inactive.
  return r.delivered === 0 ? "new" : "active";
}

/**
 * Every customer of one business (or only these) with their segment and figures. One query; everything is scoped to
 * clientId in SQL, so nothing of another business is ever read.
 */
export async function engagementRows(clientId: string, opts: { customerIds?: string[]; now?: Date } = {}): Promise<EngagementRow[]> {
  if (opts.customerIds && !opts.customerIds.length) return [];
  const now = opts.now ?? new Date();
  const rules = await engagementRules(clientId);
  const pausedSince = new Date(now.getTime() - SKIP_DAYS * 86_400_000);
  // People: linked numbers share COALESCE(personId, id). Figures are per person, then given to each number.
  const rows = await db.$queryRaw<Raw[]>`
    WITH p AS (
      SELECT c.id, COALESCE(c."personId", c.id) AS pk, c."optedOut", c.unreachable, (${INACTIVE_TAG} = ANY(c.tags)) AS moved
      FROM "Customer" c WHERE c."clientId" = ${clientId}
    ),
    taps AS (
      SELECT p.pk, max(r."receivedAt") AS at,
        count(*) FILTER (WHERE r.kind = 'button')::int AS buttons,
        count(*) FILTER (WHERE r.kind IN ('text', 'media'))::int AS replies
      FROM "Reply" r JOIN p ON p.id = r."customerId" GROUP BY p.pk
    ),
    buys AS (
      SELECT p.pk, max(o."createdAt") AS at, count(*)::int AS orders
      FROM "Order" o JOIN p ON p.id = o."customerId" WHERE o."clientId" = ${clientId} AND o.status <> 'CANCELLED' GROUP BY p.pk
    ),
    inter AS (
      SELECT p.pk, GREATEST(t.at, b.at) AS at, COALESCE(t.buttons, 0) AS buttons, COALESCE(t.replies, 0) AS replies, COALESCE(b.orders, 0) AS orders
      FROM (SELECT DISTINCT pk FROM p) p LEFT JOIN taps t ON t.pk = p.pk LEFT JOIN buys b ON b.pk = p.pk
    ),
    offers AS (
      SELECT p.pk,
        count(*) FILTER (WHERE m.status IN ('DELIVERED', 'READ'))::int AS delivered,
        count(*) FILTER (WHERE m.status = 'READ')::int AS read,
        count(*) FILTER (WHERE m.status IN ('DELIVERED', 'READ') AND (i.at IS NULL OR m."sentAt" > i.at))::int AS since
      FROM "Message" m JOIN p ON p.id = m."customerId" LEFT JOIN inter i ON i.pk = p.pk
      WHERE m."runId" IS NOT NULL GROUP BY p.pk
    ),
    latest AS (
      SELECT DISTINCT ON (m."customerId") m."customerId" AS id, m.status::text AS status, COALESCE(m."readAt", m."deliveredAt", m."failedAt", m."sentAt", m."createdAt") AS at, m."errorCode" AS code
      FROM "Message" m JOIN p ON p.id = m."customerId"
      WHERE m."runId" IS NOT NULL AND m.status NOT IN ('QUEUED', 'SKIPPED')
      ORDER BY m."customerId", m."createdAt" DESC
    ),
    held AS (
      SELECT m."customerId" AS id, max(m."failedAt") AS at FROM "Message" m JOIN p ON p.id = m."customerId"
      WHERE m.status = 'FAILED' AND m."errorCode" IN (${Prisma.join(SKIP_CODES)}) AND m."failedAt" > ${pausedSince}
      GROUP BY m."customerId"
    )
    SELECT p.id, i.at AS last_interaction, i.buttons, i.replies, i.orders,
      COALESCE(o.delivered, 0) AS delivered, COALESCE(o.read, 0) AS read, COALESCE(o.since, 0) AS since,
      l.status AS last_status, l.at AS last_at, l.code AS last_code,
      p."optedOut" AS "optedOut", p.unreachable, p.moved, h.at AS paused_at
    FROM p LEFT JOIN inter i ON i.pk = p.pk LEFT JOIN offers o ON o.pk = p.pk LEFT JOIN latest l ON l.id = p.id LEFT JOIN held h ON h.id = p.id
    ${opts.customerIds ? Prisma.sql`WHERE p.id IN (${Prisma.join(opts.customerIds)})` : Prisma.empty}`;
  return rows.map((r) => {
    const base = { lastInteractionAt: r.last_interaction, delivered: Number(r.delivered), sinceInteraction: Number(r.since) };
    return {
      id: r.id,
      segment: segmentOf(base, rules, now),
      ...base,
      buttons: Number(r.buttons ?? 0),
      replies: Number(r.replies ?? 0),
      orders: Number(r.orders ?? 0),
      read: Number(r.read),
      lastOffer: r.last_status ? { status: r.last_status, at: r.last_at, errorCode: r.last_code } : null,
      suppressed: r.optedOut ? "opted-out" : r.unreachable ? "unreachable" : r.moved ? "moved-inactive" : null,
      pausedUntil: r.paused_at ? new Date(r.paused_at.getTime() + SKIP_DAYS * 86_400_000) : null,
    };
  });
}

/** Has this business sent a campaign that Meta accepted? Before that there is no history to group customers by. */
export async function hasCampaignHistory(clientId: string) {
  const m = await db.message.findFirst({ where: { runId: { not: null }, status: { in: ["SENT", "DELIVERED", "READ"] }, customer: { clientId } }, select: { id: true } });
  return Boolean(m);
}

export type SegmentSummary = {
  history: boolean;
  rules: { days: number; offers: number };
  /** Per segment: customers a campaign can reach now, and those in it who can't (suppressed or paused by Meta). */
  segments: Record<Segment, { eligible: number; excluded: number }>;
  /** Active, split: read at least one offer vs. only delivered. */
  activeRead: number;
  totals: { customers: number; eligible: number; optedOut: number; unreachable: number; movedInactive: number; paused: number; invalidNumber: number };
};

const eligibleRow = (r: EngagementRow) => !r.suppressed && !r.pausedUntil;

/** Live counts for the campaign form and the customer list. */
export async function segmentSummary(clientId: string, now = new Date()): Promise<SegmentSummary> {
  const [rows, history, rules, bad] = await Promise.all([
    engagementRows(clientId, { now }),
    hasCampaignHistory(clientId),
    engagementRules(clientId),
    db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Customer" WHERE "clientId" = ${clientId} AND length(regexp_replace(phone, '\\D', '', 'g')) < 10`,
  ]);
  const segments = Object.fromEntries(SEGMENTS.map((s) => [s, { eligible: 0, excluded: 0 }])) as SegmentSummary["segments"];
  let activeRead = 0;
  for (const r of rows) {
    segments[r.segment][eligibleRow(r) ? "eligible" : "excluded"]++;
    if (r.segment === "active" && r.read > 0 && eligibleRow(r)) activeRead++;
  }
  return {
    history,
    rules,
    segments,
    activeRead,
    totals: {
      customers: rows.length,
      eligible: rows.filter(eligibleRow).length,
      optedOut: rows.filter((r) => r.suppressed === "opted-out").length,
      unreachable: rows.filter((r) => r.suppressed === "unreachable").length,
      movedInactive: rows.filter((r) => r.suppressed === "moved-inactive").length,
      paused: rows.filter((r) => !r.suppressed && r.pausedUntil).length,
      invalidNumber: bad[0]?.n ?? 0,
    },
  };
}

/**
 * Customers of these segments (any number of them) a campaign can reach now, for its audience: not suppressed, and not
 * held back by Meta at the moment (those go through the retry on the campaign page, lib/held.ts). The counts on the
 * form (segmentSummary "eligible") are the same customers.
 */
export async function segmentCustomerIds(clientId: string, segments: readonly string[], now = new Date()): Promise<string[]> {
  const want = cleanSegments(segments);
  if (!want.length) return [];
  return (await engagementRows(clientId, { now })).filter((r) => want.includes(r.segment) && eligibleRow(r)).map((r) => r.id);
}

export type CampaignInteractions = { buttons: number; replies: number; orders: number; interacted: number };

/**
 * Taps and replies to a campaign's messages: the ones that answer a message of these runs (Meta's context.id), and,
 * for replies without one (older records), those within ATTRIBUTION_DAYS after a message of the run reached them.
 * Orders: placed within the same window. Each customer counts once in `interacted`.
 */
export async function campaignInteractions(clientId: string, runIds: string[]): Promise<CampaignInteractions> {
  if (!runIds.length) return { buttons: 0, replies: 0, orders: 0, interacted: 0 };
  const rows = await db.$queryRaw<{ buttons: number; replies: number; orders: number; interacted: number }[]>`
    WITH sent AS (
      SELECT m."customerId", m."waMessageId", m."sentAt" FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
      WHERE c."clientId" = ${clientId} AND m."runId" IN (${Prisma.join(runIds)}) AND m.status IN ('SENT', 'DELIVERED', 'READ') AND m."sentAt" IS NOT NULL
    ),
    taps AS (
      SELECT DISTINCT r.id, r."customerId", r.kind FROM "Reply" r JOIN sent s ON s."customerId" = r."customerId"
      WHERE (r."contextId" IS NOT NULL AND r."contextId" = s."waMessageId")
         OR (r."contextId" IS NULL AND r."receivedAt" BETWEEN s."sentAt" AND s."sentAt" + make_interval(days => ${ATTRIBUTION_DAYS}::int))
    ),
    buys AS (
      SELECT DISTINCT o.id, o."customerId" FROM "Order" o JOIN sent s ON s."customerId" = o."customerId"
      WHERE o."clientId" = ${clientId} AND o.status <> 'CANCELLED' AND o."createdAt" BETWEEN s."sentAt" AND s."sentAt" + make_interval(days => ${ATTRIBUTION_DAYS}::int)
    )
    SELECT (SELECT count(*) FROM taps WHERE kind = 'button')::int AS buttons,
      (SELECT count(*) FROM taps WHERE kind IN ('text', 'media'))::int AS replies,
      (SELECT count(*) FROM buys)::int AS orders,
      (SELECT count(DISTINCT x) FROM (SELECT "customerId" AS x FROM taps UNION SELECT "customerId" FROM buys) u)::int AS interacted`;
  const r = rows[0];
  return { buttons: Number(r?.buttons ?? 0), replies: Number(r?.replies ?? 0), orders: Number(r?.orders ?? 0), interacted: Number(r?.interacted ?? 0) };
}

export type HistoryItem = { at: Date; kind: "offer" | "delivered" | "read" | "failed" | "button" | "reply" | "order"; text: string; campaign?: string | null };

/** One customer's campaign story, newest first: offers and what Meta said, their taps, replies and orders. */
export async function customerEngagementHistory(clientId: string, customerId: string, limit = 30): Promise<HistoryItem[]> {
  const [msgs, replies, orders] = await Promise.all([
    db.message.findMany({
      where: { customerId, runId: { not: null }, customer: { clientId }, status: { notIn: ["QUEUED", "SKIPPED"] } },
      select: { templateName: true, status: true, sentAt: true, createdAt: true, deliveredAt: true, readAt: true, failedAt: true, error: true, run: { select: { campaign: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.reply.findMany({ where: { customerId, customer: { clientId } }, select: { kind: true, text: true, receivedAt: true }, orderBy: { receivedAt: "desc" }, take: limit }),
    db.order.findMany({ where: { customerId, clientId, status: { not: "CANCELLED" } }, select: { total: true, createdAt: true, ref: true }, orderBy: { createdAt: "desc" }, take: limit }),
  ]);
  const out: HistoryItem[] = [];
  for (const m of msgs) {
    const campaign = m.run?.campaign.name ?? null;
    out.push({ at: m.sentAt ?? m.createdAt, kind: "offer", text: m.templateName, campaign });
    if (m.deliveredAt) out.push({ at: m.deliveredAt, kind: "delivered", text: m.templateName, campaign });
    if (m.readAt) out.push({ at: m.readAt, kind: "read", text: m.templateName, campaign });
    if (m.status === "FAILED") out.push({ at: m.failedAt ?? m.createdAt, kind: "failed", text: m.error ?? "Not delivered", campaign });
  }
  for (const r of replies) if (r.kind !== "order") out.push({ at: r.receivedAt, kind: r.kind === "button" ? "button" : "reply", text: r.text.slice(0, 120) });
  for (const o of orders) out.push({ at: o.createdAt, kind: "order", text: `${o.ref ?? "Order"} · ₹${o.total.toLocaleString("en-IN")}` });
  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
