import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Usage: npx tsx --env-file=.env prisma/import-thenan.ts [--apply]
// Without --apply it only reports what it would do.
const apply = process.argv.includes("--apply");
const TAG = "thenan-oils";
const CLIENT = "Thenan Oils";
const read = (f: string) => JSON.parse(readFileSync(new URL(`./data/${f}`, import.meta.url), "utf8"));

const customers: { name: string; phone: string }[] = read("thenan-customers.json");
const pending: Record<string, string | null>[] = read("thenan-missing-phone.json");

const db = new PrismaClient();

async function main() {
  const { id: clientId } = await db.client.upsert({ where: { name: CLIENT }, update: {}, create: { name: CLIENT } });
  const existing = await db.customer.findMany({
    where: { clientId, phone: { in: customers.map((c) => c.phone) } },
    select: { phone: true, tags: true },
  });
  const have = new Map(existing.map((c) => [c.phone, c.tags]));
  const toCreate = customers.filter((c) => !have.has(c.phone));
  const toTag = existing.filter((c) => !c.tags.includes(TAG));

  console.log(`${CLIENT} customers in DB now: ${await db.customer.count({ where: { clientId } })}`);
  console.log(`file: ${customers.length} | new: ${toCreate.length} | already in DB: ${existing.length} (to tag: ${toTag.length})`);
  console.log(`pending (no phone) rows: ${pending.length}`);
  if (!apply) return console.log("dry run - nothing written (add --apply)");

  await db.customer.createMany({ data: toCreate.map((c) => ({ ...c, clientId, tags: [TAG] })), skipDuplicates: true });
  for (const c of toTag) await db.customer.update({ where: { clientId_phone: { clientId, phone: c.phone } }, data: { tags: { push: TAG } } });
  if ((await db.pendingCustomer.count({ where: { clientId } })) === 0)
    await db.pendingCustomer.createMany({ data: pending.map((p) => ({ ...p, clientId })) as never });
  console.log("done. customers now:", await db.customer.count({ where: { clientId } }), "| pending:", await db.pendingCustomer.count({ where: { clientId } }));
}

main().finally(() => db.$disconnect());
