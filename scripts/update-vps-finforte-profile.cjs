const { execSync } = require('child_process');

const remoteScript = `
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findUnique({ where: { id: 'c_finforte_001' } });
  if (!client) {
    console.error('Client c_finforte_001 not found');
    return;
  }
  const app = client.appearance && typeof client.appearance === 'object' && !Array.isArray(client.appearance)
    ? client.appearance
    : {};

  const updatedAppearance = {
    ...app,
    billingProfile: {
      shopName: "Finforte",
      legalName: "Finforte Private Limited",
      contactPerson: "Rathandeep",
      email: "rathandeep@candbindia.com",
      mobile: "7339366693",
      address: "Anna Nagar",
      area: "Anna Nagar",
      city: "Chennai",
      state: "Tamil Nadu",
      pinCode: "600040",
      businessType: "Private Limited Company"
    }
  };

  const updated = await prisma.client.update({
    where: { id: 'c_finforte_001' },
    data: {
      supportPhone: '7339366693',
      appearance: updatedAppearance
    }
  });

  console.log('Client updated successfully:');
  console.log('ID:', updated.id);
  console.log('Name:', updated.name);
  console.log('supportPhone:', updated.supportPhone);
  console.log('billingProfile:', updated.appearance.billingProfile);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "cd /srv/thabaal/current && echo '${b64}' | base64 -d | node --env-file=/srv/thabaal/shared/.env"`, { encoding: 'utf8' });
console.log(out);
