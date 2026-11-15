const { execSync } = require('child_process');

const remoteScript = `
const https = require('https');
const fs = require('fs');

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
  console.log('--- TOKEN token_U0Qv9f0UVTwH1Q ---');
  // Tokens are usually accessed via customers/:customerId/tokens/:tokenId
  const t1 = await rzpGet('/customers/cust_U0LAyQ5bq36sYl/tokens/token_U0Qv9f0UVTwH1Q');
  console.log('Token 1:', JSON.stringify(t1, null, 2));

  console.log('--- PAYMENT pay_U0Qv99t03NVJl8 ---');
  const p1 = await rzpGet('/payments/pay_U0Qv99t03NVJl8');
  console.log('Payment 1:', JSON.stringify(p1, null, 2));

  console.log('--- INVOICE inv_U0QQEwHNsGuOuC ---');
  const inv = await rzpGet('/invoices/inv_U0QQEwHNsGuOuC');
  console.log('Invoice:', JSON.stringify(inv, null, 2));

  console.log('--- CHECK METHODS CONFIGURATION / ACCOUNT CONFIGURATION ---');
  const methods = await rzpGet('/methods');
  console.log('Methods:', JSON.stringify(methods, null, 2));
}

main().catch(console.error);
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | node"`, { encoding: 'utf8' });
console.log(out);
