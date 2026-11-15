const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function main() {
  const users = await p.user.findMany();
  for (const u of users) {
    const is12345678 = await bcrypt.compare('12345678', u.passwordHash);
    if (is12345678) {
      console.log(`User ${u.email} has password: '12345678'`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
