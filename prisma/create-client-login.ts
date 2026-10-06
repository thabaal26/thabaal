import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// Creates (or resets) a read-only login for one client.
// Usage: npx tsx prisma/create-client-login.ts "<Client name>" <email> <password> ["Display name"]
const [clientName, rawEmail, password, displayName] = process.argv.slice(2);
const db = new PrismaClient();

async function main() {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (!clientName || !email || !password || password.length < 8) {
    throw new Error('Usage: npx tsx prisma/create-client-login.ts "<Client name>" <email> <password (8+ chars)> ["Display name"]');
  }
  const client = await db.client.findUniqueOrThrow({ where: { name: clientName } });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.role === "ADMIN") throw new Error(`${email} is an admin login; pick another email.`);
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    update: { passwordHash, role: "CLIENT", clientId: client.id },
    create: { email, name: displayName ?? client.name, passwordHash, role: "CLIENT", clientId: client.id },
  });
  console.log(`✓ ${email} can sign in and see only ${client.name}.`);
}

main().finally(() => db.$disconnect());
