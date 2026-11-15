const { SignJWT } = require('jose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const env = {
  ...dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8') || ''),
  ...dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8') || ''),
};

async function test() {
  const user = await prisma.user.findFirst({ where: { email: { startsWith: 'qa_owner_' } }, orderBy: { createdAt: 'desc' } });
  if (!user) { console.log('No QA user'); return; }
  console.log('Testing for user:', user.email, 'clientId:', user.clientId);

  const secretBytes = new TextEncoder().encode(env.AUTH_SECRET);
  const token = await new SignJWT({ sub: user.id, sv: 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretBytes);

  const res = await fetch('http://localhost:3000/dashboard/billing', {
    headers: { Cookie: 'wp_session=' + token },
  });
  console.log('HTTP Status:', res.status);
  const text = await res.text();
  console.log('HTML size:', text.length);
  console.log('Has Cancel subscription:', text.includes('Cancel subscription'));
  console.log('Has Auto-pay:', text.includes('Auto-pay') || text.includes('auto-pay') || text.includes('Auto-Pay'));
  if (res.status !== 200) {
    console.log('Error page snippet:', text.slice(0, 1000));
  }
}

test()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
  });
