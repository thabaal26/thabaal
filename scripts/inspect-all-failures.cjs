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
  const pays = await rzpGet('/payments?count=15');
  for (const p of pays.items || []) {
    console.log({
      id: p.id,
      amount: p.amount,
      status: p.status,
      method: p.method,
      bank: p.bank,
      vpa: p.vpa,
      email: p.email,
      contact: p.contact,
      error_code: p.error_code,
      error_description: p.error_description,
      error_reason: p.error_reason,
      acquirer_data: p.acquirer_data,
      created_at: new Date(p.created_at * 1000).toISOString()
    });
  }
}

main().catch(console.error);
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | node"`, { encoding: 'utf8' });
console.log(out);
