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
  const plan = await rzpGet('/plans/plan_Tu9xXyFSUUTW0i');
  console.log('--- PLAN DETAILS ---');
  console.log(JSON.stringify(plan, null, 2));

  const sub = await rzpGet('/subscriptions/sub_U0LAeWh0qHe9Zx');
  console.log('--- SUB DETAILS sub_U0LAeWh0qHe9Zx ---');
  console.log(JSON.stringify(sub, null, 2));

  const sub2 = await rzpGet('/subscriptions/sub_U0QQEGJ2wknuGJ');
  console.log('--- SUB DETAILS sub_U0QQEGJ2wknuGJ ---');
  console.log(JSON.stringify(sub2, null, 2));

  const order = await rzpGet('/orders/order_U0LAfJeHFL1QqX');
  console.log('--- ORDER DETAILS order_U0LAfJeHFL1QqX ---');
  console.log(JSON.stringify(order, null, 2));

  const methods = await rzpGet('/methods');
  console.log('--- ACCOUNT PAYMENT METHODS ---');
  console.log(JSON.stringify(methods, null, 2));
})();
`;

fs.writeFileSync('temp_check_rzp_details.js', remoteScript);
try {
  execSync('scp -i ~/.ssh/thabaal_vps temp_check_rzp_details.js root@189.72.145.225:/tmp/temp_check_rzp_details.js');
  const res = execSync('ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "node /tmp/temp_check_rzp_details.js"', { encoding: 'utf8' });
  console.log(res);
} finally {
  if (fs.existsSync('temp_check_rzp_details.js')) fs.unlinkSync('temp_check_rzp_details.js');
}
