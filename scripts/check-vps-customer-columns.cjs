const { execSync } = require('child_process');

function queryVps(sql) {
  const b64 = Buffer.from(sql).toString('base64');
  return execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | sudo -u postgres psql -d thabaal"`, { encoding: 'utf8' });
}

console.log('--- Columns of Customer on live VPS ---');
console.log(queryVps(`SELECT column_name FROM information_schema.columns WHERE table_name = 'Customer' ORDER BY column_name;`));
