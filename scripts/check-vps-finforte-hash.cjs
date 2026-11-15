const { execSync } = require('child_process');

function runPsql(sql) {
  const cmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "sudo -u postgres psql -d thabaal -c '${sql}'"`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log(runPsql('SELECT id, email, \\"passwordHash\\" FROM \\"User\\" WHERE id = \\\'u_finforte_001\\\';'));
