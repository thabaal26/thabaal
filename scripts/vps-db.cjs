const { execSync } = require('child_process');

function runPsql(sql) {
  const cmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "sudo -u postgres psql -d thabaal -c '${sql}'"`;
  return execSync(cmd, { encoding: 'utf8' });
}

try {
  console.log('--- USERS ON LIVE VPS ---');
  console.log(runPsql('SELECT id, email, name, role, \\"clientId\\" FROM \\"User\\";'));
  console.log('--- CLIENTS ON LIVE VPS ---');
  console.log(runPsql('SELECT id, name, \\"workspaceMode\\" FROM \\"Client\\";'));
} catch (e) {
  console.error(e.message);
  if (e.stdout) console.log('stdout:', e.stdout);
  if (e.stderr) console.error('stderr:', e.stderr);
}
