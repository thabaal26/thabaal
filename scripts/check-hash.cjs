const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const u = await p.user.findFirst({
    where: { clientId: 'cmuwjyb250000e09sx8q748cl' },
    select: { passwordHash: true }
  });
  console.log('Sample passwordHash length:', u?.passwordHash?.length);
}
main().catch(console.error).finally(() => p.$disconnect());
