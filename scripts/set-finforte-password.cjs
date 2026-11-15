const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function main() {
  const email = 'rathandeep@candbindia.com';
  const newHash = await bcrypt.hash('12345678', 12);

  // Update password for rathandeep@candbindia.com to 12345678
  const updatedUser = await p.user.update({
    where: { email },
    data: {
      passwordHash: newHash,
      sessionVersion: 0,
    }
  });
  console.log('Updated password to 12345678 for user:', updatedUser.email, updatedUser.id);

  // Clear any rate-limiting failures in loginAttempt
  const deletedAttempts = await p.loginAttempt.deleteMany({
    where: {
      key: {
        in: [`email:${email}`, `email:${email.toLowerCase()}`, `email:Rathandeep@candbindia.com`]
      }
    }
  });
  console.log('Cleared login failure attempts:', deletedAttempts.count);

  // Also check if finforte@gmail.com exists
  const oldFinforte = await p.user.findUnique({ where: { email: 'finforte@gmail.com' } });
  console.log('finforte@gmail.com exists?:', !!oldFinforte);

  // Test compare
  const ok = await bcrypt.compare('12345678', updatedUser.passwordHash);
  console.log('Verification: bcrypt.compare("12345678") ->', ok);
}

main().catch(console.error).finally(() => p.$disconnect());
