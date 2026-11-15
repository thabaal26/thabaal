const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function testLogin(inputEmail, inputPassword) {
  const email = String(inputEmail ?? '').trim().toLowerCase();
  const password = String(inputPassword ?? '');

  const user = await p.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: false, error: 'User not found in DB' };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { ok: false, error: 'Password does not match' };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      access: user.access,
      clientId: user.clientId
    }
  };
}

async function main() {
  console.log('Testing with "Rathandeep@candbindia.com" / "12345678":');
  const res1 = await testLogin('Rathandeep@candbindia.com', '12345678');
  console.log('Result 1 (Mixed case):', res1);

  console.log('Testing with "rathandeep@candbindia.com" / "12345678":');
  const res2 = await testLogin('rathandeep@candbindia.com', '12345678');
  console.log('Result 2 (Lowercase):', res2);
}

main().catch(console.error).finally(() => p.$disconnect());
