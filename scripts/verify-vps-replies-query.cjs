const { execSync } = require('child_process');

const testCode = `
const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

async function main() {
  const replies = await p.reply.findMany({
    take: 5,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          purchases: true,
          deletedAt: true
        }
      }
    }
  });
  console.log('Successfully queried replies with customer.deletedAt! Count:', replies.length);
}

main().catch(err => {
  console.error('ERROR in test query:', err);
  process.exit(1);
}).finally(() => p.$disconnect());
`;

const b64 = Buffer.from(testCode).toString('base64');
const cmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "cd /srv/thabaal/releases/20261114083500-consentgate && echo '${b64}' | base64 -d | node"`;
console.log('Running verification script on live VPS...');
const out = execSync(cmd, { encoding: 'utf8' });
console.log(out);
