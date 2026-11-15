const { execSync } = require('child_process');

function runSql(sql) {
  const b64 = Buffer.from(sql).toString('base64');
  return execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | sudo -u postgres psql -d thabaal"`, { encoding: 'utf8' });
}

console.log('--- Updating Client disabledSections ---');
console.log(runSql(`UPDATE "Client" SET "disabledSections" = ARRAY['catalogue'] WHERE id = 'c_finforte_001' OR name ILIKE '%finforte%';`));
console.log(runSql(`SELECT id, name, "disabledSections" FROM "Client" WHERE id = 'c_finforte_001';`));
