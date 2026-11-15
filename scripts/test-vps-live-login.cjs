const { execSync } = require('child_process');

const nodeScript = `
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function main() {
  const email = 'Rathandeep@candbindia.com'.trim().toLowerCase();
  const password = '12345678';
  const user = await p.user.findUnique({ where: { email } });
  if (!user) {
    console.log(JSON.stringify({ success: false, reason: 'user_not_found' }));
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  console.log(JSON.stringify({
    success: ok,
    user: ok ? { id: user.id, email: user.email, name: user.name, role: user.role, access: user.access, clientId: user.clientId } : null
  }));
}

main().catch(e => console.error(e)).finally(() => p.$disconnect());
`;

const base64Script = Buffer.from(nodeScript).toString('base64');
const cmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "cd /srv/thabaal/current && echo '${base64Script}' | base64 -d | node"`;
console.log('Running test on LIVE Hostinger VPS (/srv/thabaal/current)...');
const out = execSync(cmd, { encoding: 'utf8' });
console.log('LIVE Hostinger VPS result:', out);
