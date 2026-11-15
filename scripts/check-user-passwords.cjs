const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const p = new PrismaClient();

async function main() {
  const users = await p.user.findMany({
    select: { id: true, email: true, name: true, role: true, passwordHash: true }
  });

  console.log('User records:');
  for (const u of users) {
    console.log(`- ${u.email} (${u.role}) hash prefix: ${u.passwordHash.substring(0, 10)}...`);
  }

  // Check if .env has ADMIN_PASSWORD
  const envContent = fs.readFileSync('.env', 'utf8');
  const adminPassLine = envContent.split('\n').find(l => l.startsWith('ADMIN_PASSWORD='));
  if (adminPassLine) {
    const pass = adminPassLine.split('=')[1].trim().replace(/^["']|["']$/g, '');
    console.log('ADMIN_PASSWORD exists in .env, length:', pass.length);
    // test against users
    for (const u of users) {
      const match = await bcrypt.compare(pass, u.passwordHash);
      if (match) {
        console.log(`  matches password of: ${u.email}`);
      }
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
