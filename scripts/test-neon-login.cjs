const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Test logic identical to src/app/login/actions.ts:
async function simulateLogin(emailInput, passwordInput) {
  const p = new PrismaClient();
  try {
    const email = String(emailInput ?? "").trim().toLowerCase();
    const password = String(passwordInput ?? "");

    const user = await p.user.findUnique({ where: { email } });
    if (!user) return { success: false, reason: "user_not_found" };

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return { success: false, reason: "invalid_password" };

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        access: user.access,
        clientId: user.clientId
      }
    };
  } finally {
    await p.$disconnect();
  }
}

simulateLogin("Rathandeep@candbindia.com", "12345678")
  .then(res => console.log('Local/Neon Login Simulation:', res))
  .catch(console.error);
