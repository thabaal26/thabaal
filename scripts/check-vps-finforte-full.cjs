const { execSync } = require('child_process');

function queryVps(sql) {
  const b64 = Buffer.from(sql).toString('base64');
  return execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | sudo -u postgres psql -d thabaal"`, { encoding: 'utf8' });
}

console.log('--- Finforte Client ---');
console.log(queryVps('SELECT id, name, "workspaceMode", "billingMode", "planRequired" FROM "Client" WHERE id = \'c_finforte_001\';'));

console.log('--- Finforte User ---');
console.log(queryVps('SELECT id, email, name, role, access, "clientId", "sessionVersion" FROM "User" WHERE "clientId" = \'c_finforte_001\';'));
