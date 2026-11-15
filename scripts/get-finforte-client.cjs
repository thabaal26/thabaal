const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const c = await p.client.findUnique({
    where: { id: 'c_finforte_001' }
  });
  console.log('Client c_finforte_001:', JSON.stringify(c, null, 2));
}
main().catch(console.error).finally(() => p.$disconnect());
