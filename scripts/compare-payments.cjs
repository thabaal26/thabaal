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
  const p1 = await rzpGet('/payments/pay_TuCDEwd0EveLLk');
  console.log('--- pay_TuCDEwd0EveLLk (CAPTURED) ---');
  console.log(JSON.stringify(p1, null, 2));

  const p2 = await rzpGet('/payments/pay_U0SfjZKSx1ny4R');
  console.log('--- pay_U0SfjZKSx1ny4R (FAILED) ---');
  console.log(JSON.stringify(p2, null, 2));
})();
`;

fs.writeFileSync('temp_compare.js', remoteScript);
try {
  execSync('scp -i ~/.ssh/thabaal_vps temp_compare.js root@189.72.145.225:/tmp/temp_compare.js');
  const res = execSync('ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "node /tmp/temp_compare.js"', { encoding: 'utf8' });
  console.log(res);
} finally {
  if (fs.existsSync('temp_compare.js')) fs.unlinkSync('temp_compare.js');
}
