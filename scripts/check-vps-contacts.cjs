const { execSync } = require('child_process');

function queryVps(sql) {
  const b64 = Buffer.from(sql).toString('base64');
  return execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | sudo -u postgres psql -d thabaal"`, { encoding: 'utf8' });
}

console.log('--- Search 8778613372 in User ---');
console.log(queryVps(`SELECT id, email, name, role, "clientId" FROM "User" WHERE email LIKE '%8778613372%' OR name LIKE '%8778613372%';`));

console.log('--- Search 8778613372 in Customer ---');
console.log(queryVps(`SELECT id, name, phone, "clientId" FROM "Customer" WHERE phone LIKE '%8778613372%';`));

console.log('--- Search step17326552 in User ---');
console.log(queryVps(`SELECT id, email, name, role, "clientId" FROM "User" WHERE email LIKE '%step17326552%' OR name LIKE '%step17326552%';`));

console.log('--- Search step17326552 in RazorpayRecord ---');
console.log(queryVps(`SELECT id, "rzpId", "paymentId", purpose, "clientId", plan, note, "createdBy" FROM "RazorpayRecord" WHERE note LIKE '%step17326552%' OR note LIKE '%8778613372%' OR "createdBy" LIKE '%step17326552%';`));

console.log('--- Recent RazorpayRecord on live VPS ---');
console.log(queryVps(`SELECT id, kind, "rzpId", "paymentId", purpose, "clientId", plan, cycle, "amountPaise", status, "createdAt" FROM "RazorpayRecord" ORDER BY "createdAt" DESC LIMIT 10;`));
