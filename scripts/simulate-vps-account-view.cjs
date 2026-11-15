const { execSync } = require('child_process');

const remoteScript = `
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function simulate() {
  const clientId = 'c_finforte_001';
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, appearance: true, supportPhone: true, homeCity: true, planRequired: true }
  });
  const user = await prisma.user.findFirst({
    where: { clientId, role: 'CLIENT' },
    select: { email: true, name: true, role: true }
  });

  const appearance = client?.appearance && typeof client.appearance === 'object' && !Array.isArray(client.appearance)
    ? client.appearance
    : {};
  const billingProfile = appearance.billingProfile ?? {
    shopName: client?.name ?? '',
    legalName: '',
    contactPerson: user?.role === 'CLIENT' ? (user.name ?? '') : '',
    mobile: client?.supportPhone ?? '',
    email: user?.role === 'CLIENT' ? user.email : '',
  };

  console.log('--- SIMULATED ACCOUNT VIEW PROPS FOR FINFORTE ---');
  console.log('Client name:', client?.name);
  console.log('Support phone:', client?.supportPhone);
  console.log('User email:', user?.email);
  console.log('User name:', user?.name);
  console.log('Resolved billingProfile for Razorpay checkout:');
  console.log(JSON.stringify(billingProfile, null, 2));
}

simulate().catch(console.error).finally(() => prisma.$disconnect());
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "cd /srv/thabaal/current && echo '${b64}' | base64 -d | node --env-file=/srv/thabaal/shared/.env"`, { encoding: 'utf8' });
console.log(out);
