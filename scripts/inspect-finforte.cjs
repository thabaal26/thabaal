const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== SEARCHING FOR FINFORTE / SHEVEST IN CLIENTS ===');
  const clients = await prisma.client.findMany({
    where: {
      OR: [
        { name: { contains: 'Finforte', mode: 'insensitive' } },
        { name: { contains: 'SheVest', mode: 'insensitive' } },
        { name: { contains: 'candb', mode: 'insensitive' } },
        { name: { contains: 'Rathan', mode: 'insensitive' } },
      ],
    },
    include: {
      users: true,
      numbers: true,
    },
  });
  console.log('Matching clients:', JSON.stringify(clients, null, 2));

  console.log('\n=== ALL CLIENTS IN DB ===');
  const allClients = await prisma.client.findMany({
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(JSON.stringify(allClients, null, 2));

  console.log('\n=== ALL USERS IN DB ===');
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, access: true, clientId: true },
  });
  console.log(JSON.stringify(allUsers, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
