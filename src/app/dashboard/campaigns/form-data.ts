import "server-only";
import { db } from "@/lib/db";
import { clientNumbers, numberLabel } from "@/lib/senders";

/** One client's templates and audience sizes, for the campaign form. */
export async function campaignFormData(clientId: string) {
  const [templates, all, tags, numbers] = await Promise.all([
    db.template.findMany({
      where: { clientId, category: { not: "AUTHENTICATION" } },
      select: { id: true, name: true, category: true, status: true, businessAccountId: true },
      orderBy: { name: "asc" },
    }),
    db.customer.count({ where: { clientId, optedOut: false } }),
    db.$queryRaw<{ tag: string; n: bigint }[]>`
      SELECT unnest(tags) AS tag, count(*) AS n FROM "Customer" WHERE "optedOut" = false AND "clientId" = ${clientId} GROUP BY 1 ORDER BY 1`,
    clientNumbers(clientId),
  ]);
  return {
    templates,
    audience: { all, tags: tags.map((t) => ({ tag: t.tag, n: Number(t.n) })) },
    numbers: numbers.map((n) => ({ id: n.id, label: numberLabel(n), businessAccountId: n.businessAccountId, isDefault: n.isDefault })),
  };
}
