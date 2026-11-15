const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.customer.findMany({
    where: { clientId: 'c_finforte_001' },
    select: {
      id: true,
      name: true,
      phone: true,
      location: true,
      region: true,
      locationRaw: true,
      deliveryAddress: true,
      extra: true
    },
    take: 3
  });
  console.log("Finforte customers in DB:", JSON.stringify(customers, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
