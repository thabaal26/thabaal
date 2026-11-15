const { execSync } = require('child_process');

const sql = `SELECT id, name, "supportPhone", appearance FROM "Client" WHERE id = 'c_finforte_001';`;
const b64 = Buffer.from(sql).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | sudo -u postgres psql -d thabaal"`, { encoding: 'utf8' });
console.log(out);
