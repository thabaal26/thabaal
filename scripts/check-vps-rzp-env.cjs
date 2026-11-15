const { execSync } = require('child_process');

const remoteScript = `
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const env = process.env;
  console.log('RZP Key ID exists:', !!(env.RAZORPAY_KEY_ID || env.NEXT_PUBLIC_RAZORPAY_KEY_ID));
  console.log('RZP Key Secret exists:', !!env.RAZORPAY_KEY_SECRET);
  console.log('RZP Key ID prefix:', (env.RAZORPAY_KEY_ID || env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '').slice(0, 8));
}
check();
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "cd /srv/thabaal/current && echo '${b64}' | base64 -d | node"`, { encoding: 'utf8' });
console.log(out);
