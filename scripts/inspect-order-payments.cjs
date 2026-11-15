const { execSync } = require('child_process');
const fs = require('fs');

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
      headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const ord = await rzpGet('/orders/order_U0QQF3h1toq4eF/payments');
  console.log('--- PAYMENTS FOR order_U0QQF3h1toq4eF ---');
  console.log(JSON.stringify(ord, null, 2));
})();
`;

fs.writeFileSync('temp_ord_pay.js', remoteScript);
try {
  execSync('scp -i ~/.ssh/thabaal_vps temp_ord_pay.js root@189.72.145.225:/tmp/temp_ord_pay.js');
  const res = execSync('ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "node /tmp/temp_ord_pay.js"', { encoding: 'utf8' });
  console.log(res);
} finally {
  if (fs.existsSync('temp_ord_pay.js')) fs.unlinkSync('temp_ord_pay.js');
}
