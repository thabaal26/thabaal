const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const attempts = await p.loginAttempt.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  console.log('Total loginAttempt rows in last batch:', attempts.length);
  attempts.forEach(a => console.log(`- [${a.createdAt.toISOString()}] key: ${a.key}`));
}

main().catch(console.error).finally(() => p.$disconnect());
