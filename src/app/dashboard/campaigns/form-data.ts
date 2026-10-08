import "server-only";
import { db } from "@/lib/db";
import { clientNumbers, numberLabel } from "@/lib/senders";
import { tierLimit } from "@/lib/limits";
import { AUDIENCE_PREFIX, audienceWhere, describeFilter, type AudienceFilter } from "@/lib/audiences";

/** One client's templates and audience sizes, for the campaign form. */
export async function campaignFormData(clientId: string) {
  const [templates, all, tags, numbers, saved] = await Promise.all([
    db.template.findMany({
      where: { clientId, category: { not: "AUTHENTICATION" } },
      select: { id: true, name: true, category: true, status: true, businessAccountId: true },
      orderBy: { name: "asc" },
    }),
    db.customer.count({ where: { clientId, optedOut: false } }),
    db.$queryRaw<{ tag: string; n: bigint }[]>`
      SELECT unnest(tags) AS tag, count(*) AS n FROM "Customer" WHERE "optedOut" = false AND "clientId" = ${clientId} GROUP BY 1 ORDER BY 1`,
    clientNumbers(clientId),
    db.audience.findMany({ where: { clientId }, orderBy: { name: "asc" } }),
  ]);
  // Saved audiences first, with live counts; then plain tags.
  const savedCounts = await Promise.all(saved.map(async (a) => db.customer.count({ where: await audienceWhere(clientId, a.filter as AudienceFilter) })));
  const audiences = saved.map((a, k) => ({ tag: `${AUDIENCE_PREFIX}${a.id}`, label: `★ ${a.name}`, hint: describeFilter(a.filter as AudienceFilter), n: savedCounts[k] }));
  return {
    templates,
    audience: { all, tags: [...audiences, ...tags.map((t) => ({ tag: t.tag, label: t.tag, hint: undefined as string | undefined, n: Number(t.n) }))] },
    numbers: numbers.map((n) => {
      const meta = tierLimit(n.messagingTier);
      const dailyLimit = n.dailyCap != null ? Math.min(n.dailyCap, meta ?? Infinity) : meta;
      return { id: n.id, label: numberLabel(n), businessAccountId: n.businessAccountId, isDefault: n.isDefault, dailyLimit, quality: n.qualityRating };
    }),
  };
}
