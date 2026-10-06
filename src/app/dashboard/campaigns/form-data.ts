import "server-only";
import { db } from "@/lib/db";

/** One client's templates and audience sizes, for the campaign form. */
export async function campaignFormData(clientId: string) {
  const [templates, all, tags] = await Promise.all([
    db.template.findMany({
      where: { clientId, category: { not: "AUTHENTICATION" } },
      select: { id: true, name: true, category: true, status: true },
      orderBy: { name: "asc" },
    }),
    db.customer.count({ where: { clientId, optedOut: false } }),
    db.$queryRaw<{ tag: string; n: bigint }[]>`
      SELECT unnest(tags) AS tag, count(*) AS n FROM "Customer" WHERE "optedOut" = false AND "clientId" = ${clientId} GROUP BY 1 ORDER BY 1`,
  ]);
  return { templates, audience: { all, tags: tags.map((t) => ({ tag: t.tag, n: Number(t.n) })) } };
}
