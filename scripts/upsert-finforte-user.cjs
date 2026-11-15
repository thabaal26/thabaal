const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function main() {
  const email = 'rathandeep@candbindia.com'.toLowerCase().trim();
  const existing = await p.user.findFirst({
    where: {
      OR: [
        { email: { equals: email, mode: 'insensitive' } },
        { clientId: 'c_finforte_001' }
      ]
    }
  });

  const defaultHash = await bcrypt.hash('Finforte@2026!', 12);

  if (existing) {
    console.log('Existing user found:', existing.id, existing.email);
    const updated = await p.user.update({
      where: { id: existing.id },
      data: {
        email,
        name: 'Rathandeep',
        role: 'CLIENT',
        access: 'MANAGER',
        clientId: 'c_finforte_001',
      }
    });
    console.log('Updated user:', updated);
  } else {
    console.log('Creating new official manager user for Finforte...');
    const created = await p.user.create({
      data: {
        email,
        name: 'Rathandeep',
        role: 'CLIENT',
        access: 'MANAGER',
        clientId: 'c_finforte_001',
        passwordHash: defaultHash,
      }
    });
    console.log('Created user:', created);
  }

  // Also ensure client appearance / paySettings explicitly records the official email for fast lookup and UI display
  const client = await p.client.findUnique({ where: { id: 'c_finforte_001' } });
  if (client) {
    const existingPaySettings = (client.paySettings && typeof client.paySettings === 'object' && !Array.isArray(client.paySettings))
      ? client.paySettings
      : {};
    await p.client.update({
      where: { id: 'c_finforte_001' },
      data: {
        paySettings: {
          ...existingPaySettings,
          officialEmail: email,
          paymentNotificationEmail: email,
        }
      }
    });
    console.log('Updated client c_finforte_001 paySettings with official email.');
  }
}

main().catch(console.error).finally(() => p.$disconnect());
