const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.$executeRawUnsafe('ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;');
  console.log('connectionId column added successfully!');
}

run()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });
