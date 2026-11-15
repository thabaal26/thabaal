const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const users = await p.user.findMany({
    where: {
      OR: [
        { email: { contains: 'finforte', mode: 'insensitive' } },
        { email: { contains: 'candb', mode: 'insensitive' } },
        { email: { contains: 'rathandeep', mode: 'insensitive' } },
        { email: { contains: 'shevest', mode: 'insensitive' } },
        { clientId: 'c_finforte_001' }
      ]
    }
  });
  console.log('Matching users found:', users.length, JSON.stringify(users, null, 2));
}
main().catch(console.error).finally(() => p.$disconnect());
