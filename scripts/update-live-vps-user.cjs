const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

async function main() {
  const email = 'rathandeep@candbindia.com';
  const hash = await bcrypt.hash('12345678', 12);
  console.log('Generated hash for 12345678:', hash);

  // SQL statements to run on the live VPS PostgreSQL
  const sqlCommands = [
    `UPDATE "User" SET email = '${email}', name = 'Rathandeep', "passwordHash" = '${hash}', "sessionVersion" = 0 WHERE id = 'u_finforte_001' OR email = 'finforte@gmail.com';`,
    `UPDATE "Client" SET "paySettings" = jsonb_set(COALESCE("paySettings", '{}'::jsonb), '{officialEmail}', '"${email}"') WHERE id = 'c_finforte_001';`,
    `UPDATE "Client" SET "paySettings" = jsonb_set(COALESCE("paySettings", '{}'::jsonb), '{paymentNotificationEmail}', '"${email}"') WHERE id = 'c_finforte_001';`,
    `DELETE FROM "LoginAttempt" WHERE key LIKE '%candbindia.com%' OR key LIKE '%finforte%';`,
    `SELECT id, email, name, role, access, "clientId" FROM "User" WHERE id = 'u_finforte_001';`
  ];

  const fullSql = sqlCommands.join(' ');
  const base64Sql = Buffer.from(fullSql).toString('base64');

  // Pipe SQL via base64 decoding on VPS to avoid escaping issues
  const remoteCmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${base64Sql}' | base64 -d | sudo -u postgres psql -d thabaal"`;
  console.log('Executing live database update on VPS...');
  const out = execSync(remoteCmd, { encoding: 'utf8' });
  console.log('VPS SQL Output:\n', out);

  // Now verify password hash on live VPS
  const verifySql = `SELECT "passwordHash" FROM "User" WHERE id = 'u_finforte_001';`;
  const b64Verify = Buffer.from(verifySql).toString('base64');
  const checkCmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64Verify}' | base64 -d | sudo -u postgres psql -d thabaal -t"`;
  const storedHash = execSync(checkCmd, { encoding: 'utf8' }).trim();
  console.log('Stored hash on live VPS:\n', storedHash);

  const match = await bcrypt.compare('12345678', storedHash);
  console.log('Verification: Does "12345678" match stored hash on live VPS? ->', match);
}

main().catch(console.error);
