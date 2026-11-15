const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const users = await p.user.findMany({
    select: { id: true, email: true, name: true, role: true, access: true, clientId: true }
  });
  console.log('Total users in DB:', users.length);
  users.forEach(u => console.log(JSON.stringify(u)));
}
main().catch(console.error).finally(() => p.$disconnect());
