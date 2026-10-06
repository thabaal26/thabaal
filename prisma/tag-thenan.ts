import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Adds catalogue product tags + purchases text to Thenan Oils customers.
// Usage: npx tsx prisma/tag-thenan.ts
const data: Record<string, { products: string[]; purchases: string | null }> = JSON.parse(
  readFileSync(new URL("./data/thenan-purchases.json", import.meta.url), "utf8"),
);
const db = new PrismaClient();

async function main() {
  const { id: clientId } = await db.client.findUniqueOrThrow({ where: { name: "Thenan Oils" } });
  let n = 0;
  for (const [phone, { products, purchases }] of Object.entries(data)) {
    const where = { clientId_phone: { clientId, phone } };
    const c = await db.customer.findUnique({ where, select: { tags: true } });
    if (!c) continue;
    const tags = Array.from(new Set([...c.tags, ...products]));
    await db.customer.update({ where, data: { tags, purchases } });
    n++;
  }
  console.log("updated", n, "customers");
}

main().finally(() => db.$disconnect());
