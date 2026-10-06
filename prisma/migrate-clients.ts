import { PrismaClient } from "@prisma/client";

// One-off: assigns existing rows to clients after `prisma db push --schema prisma/schema.phase1.prisma`.
//   Thenan Oils  <- customers tagged thenan-oils, and all pending (no-phone) rows
//   Cup N Saucer <- every other customer, template and campaign (the earlier test data)
// and makes every existing login an admin. Safe to run twice.
const db = new PrismaClient();

async function main() {
  const thenan = await db.client.upsert({ where: { name: "Thenan Oils" }, update: {}, create: { name: "Thenan Oils" } });
  const legacy = await db.client.upsert({ where: { name: "Cup N Saucer" }, update: {}, create: { name: "Cup N Saucer" } });

  // Runs against the phase-1 client, where clientId is still nullable.
  const unassigned = { clientId: null } as never;
  const t = await db.customer.updateMany({ where: { clientId: null, tags: { has: "thenan-oils" } } as never, data: { clientId: thenan.id } });
  const o = await db.customer.updateMany({ where: unassigned, data: { clientId: legacy.id } });
  const p = await db.pendingCustomer.updateMany({ where: unassigned, data: { clientId: thenan.id } });
  const tp = await db.template.updateMany({ where: unassigned, data: { clientId: legacy.id } });
  const c = await db.campaign.updateMany({ where: unassigned, data: { clientId: legacy.id } });

  // Logins that existed before clients did belonged to the portal owner.
  const u = await db.user.updateMany({ where: { clientId: null }, data: { role: "ADMIN" } });

  console.log({ thenanCustomers: t.count, otherCustomers: o.count, pending: p.count, templates: tp.count, campaigns: c.count, admins: u.count });
}

main().finally(() => db.$disconnect());
