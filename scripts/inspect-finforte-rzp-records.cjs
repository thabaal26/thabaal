const { execSync } = require('child_process');

const sql = `SELECT id, "rzpId", purpose, "clientId", plan, cycle, "amountPaise", status, note, "createdBy", "createdAt" FROM "RazorpayRecord" WHERE "clientId" = 'c_finforte_001' ORDER BY "createdAt" DESC LIMIT 5;`;
const b64 = Buffer.from(sql).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | sudo -u postgres psql -d thabaal"`, { encoding: 'utf8' });
console.log(out);
