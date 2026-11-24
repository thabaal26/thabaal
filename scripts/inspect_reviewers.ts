import { db as prisma } from '../src/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: ['meta.reviewer.a@thabaal.in', 'meta.reviewer.b@thabaal.in'] } },
    select: { id: true, email: true, role: true, access: true, clientId: true }
  });
  console.log('Reviewer users in DB:', JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
