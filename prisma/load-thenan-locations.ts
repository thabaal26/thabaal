import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Loads cleaned locations (prisma/data/thenan-locations.json, built from the order sheets)
// onto Thenan Oils customers. Usage: npx tsx prisma/load-thenan-locations.ts
const data: Record<string, { raw: string; location: string; region: string }> = JSON.parse(
  readFileSync(new URL("./data/thenan-locations.json", import.meta.url), "utf8"),
);
const db = new PrismaClient();

async function main() {
  const { id: clientId } = await db.client.findUniqueOrThrow({ where: { name: "Thenan Oils" } });
  const entries = Object.entries(data);
  let n = 0;
  // Small parallel chunks: fast, without opening hundreds of connections at once.
  for (let i = 0; i < entries.length; i += 25) {
    const res = await Promise.all(
      entries.slice(i, i + 25).map(([phone, l]) =>
        db.customer.updateMany({ where: { clientId, phone }, data: { location: l.location, region: l.region, locationRaw: l.raw } }),
      ),
    );
    n += res.reduce((a, r) => a + r.count, 0);
  }
  const regions = await db.customer.groupBy({ by: ["region"], where: { clientId }, _count: true });
  console.log("updated", n, "customers", Object.fromEntries(regions.map((r) => [r.region ?? "no location", r._count])));
}

main().finally(() => db.$disconnect());
