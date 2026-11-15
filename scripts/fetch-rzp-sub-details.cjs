const { execSync } = require('child_process');

const remoteScript = `
const https = require('https');
const fs = require('fs');

// Read env file
const envContent = fs.readFileSync('/srv/thabaal/shared/.env', 'utf8');
let keyId = '', keySecret = '';
for (const line of envContent.split('\\n')) {
  if (line.startsWith('RAZORPAY_KEY_ID=')) keyId = line.split('=')[1].replace(/^["']|["']$/g, '').trim();
  if (line.startsWith('RAZORPAY_KEY_SECRET=')) keySecret = line.split('=')[1].replace(/^["']|["']$/g, '').trim();
}

function rzpGet(path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(keyId + ':' + keySecret).toString('base64');
    const req = https.request({
      hostname: 'api.razorpay.com',
      port: 443,
      path: '/v1' + path,
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('--- FETCH sub_U0R1CsKYlveuZk ---');
  const sub1 = await rzpGet('/subscriptions/sub_U0R1CsKYlveuZk');
  console.log('Sub status:', sub1.status, 'plan_id:', sub1.plan_id, 'customer_id:', sub1.customer_id, 'total_count:', sub1.total_count);
  console.log('Sub notes:', sub1.notes);

  console.log('--- PAYMENTS FOR sub_U0R1CsKYlveuZk ---');
  const pays1 = await rzpGet('/subscriptions/sub_U0R1CsKYlveuZk/payments');
  console.log('Payments count:', pays1.count, 'items:', JSON.stringify(pays1.items, null, 2));

  console.log('--- FETCH sub_U0QQEGJ2wknuGJ ---');
  const pays2 = await rzpGet('/subscriptions/sub_U0QQEGJ2wknuGJ/payments');
  console.log('Payments count for sub_U0QQEGJ2wknuGJ:', pays2.count, 'items:', JSON.stringify(pays2.items, null, 2));

  console.log('--- FETCH sub_U0LAeWh0qHe9Zx ---');
  const pays3 = await rzpGet('/subscriptions/sub_U0LAeWh0qHe9Zx/payments');
  console.log('Payments count for sub_U0LAeWh0qHe9Zx:', pays3.count, 'items:', JSON.stringify(pays3.items, null, 2));
}

main().catch(console.error);
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | node"`, { encoding: 'utf8' });
console.log(out);
