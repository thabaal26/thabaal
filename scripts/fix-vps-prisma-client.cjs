const fs = require('fs');
const { execSync } = require('child_process');

async function main() {
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
  console.log('Local schema size:', schema.length);
  const b64 = Buffer.from(schema).toString('base64');

  const destPath = '/srv/thabaal/releases/20261114083500-consentgate/prisma/schema.prisma';
  const cmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d > ${destPath} && chown thabaal:thabaal ${destPath}"`;
  console.log('Uploading schema.prisma to VPS...');
  execSync(cmd);
  console.log('Schema uploaded successfully.');

  console.log('Running prisma generate on VPS...');
  const genCmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "cd /srv/thabaal/releases/20261114083500-consentgate && npx --yes prisma@6.19.3 generate --schema=${destPath}"`;
  const out = execSync(genCmd, { encoding: 'utf8' });
  console.log('Prisma generate output:\n', out);

  console.log('Checking if generated client on VPS now has deletedAt...');
  const checkCmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "grep -n deletedAt /srv/thabaal/releases/20261114083500-consentgate/node_modules/.prisma/client/schema.prisma"`;
  const checkOut = execSync(checkCmd, { encoding: 'utf8' });
  console.log('Grep deletedAt output:\n', checkOut);

  console.log('Reloading PM2 thabaal process...');
  const reloadCmd = `ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "sudo -u thabaal pm2 reload thabaal"`;
  const reloadOut = execSync(reloadCmd, { encoding: 'utf8' });
  console.log('PM2 reload output:\n', reloadOut);
}

main().catch(console.error);
