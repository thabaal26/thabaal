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
  const cust = await rzpGet('/customers/cust_U0LAyQ5bq36sYl');
  console.log('--- CUSTOMER ---');
  console.log(JSON.stringify(cust, null, 2));

  const custTokens = await rzpGet('/customers/cust_U0LAyQ5bq36sYl/tokens');
  console.log('--- CUSTOMER TOKENS ---');
  console.log(JSON.stringify(custTokens, null, 2));

  const token1 = await rzpGet('/tokens/token_U0Sfk5ZWzAF92g');
  console.log('--- TOKEN token_U0Sfk5ZWzAF92g ---');
  console.log(JSON.stringify(token1, null, 2));
})();
`;

fs.writeFileSync('temp_token_check.js', remoteScript);
try {
  execSync('scp -i ~/.ssh/thabaal_vps temp_token_check.js root@189.72.145.225:/tmp/temp_token_check.js');
  const res = execSync('ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "node /tmp/temp_token_check.js"', { encoding: 'utf8' });
  console.log(res);
} finally {
  if (fs.existsSync('temp_token_check.js')) fs.unlinkSync('temp_token_check.js');
}
