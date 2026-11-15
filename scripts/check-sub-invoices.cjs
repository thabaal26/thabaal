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
  // Check subscription preferences / checkout preferences
  const sub = await rzpGet('/subscriptions/sub_U0QQEGJ2wknuGJ');
  console.log('--- SUB OFFER / DETAILS ---');
  console.log({
    id: sub.id,
    status: sub.status,
    total_count: sub.total_count,
    paid_count: sub.paid_count,
    auth_attempts: sub.auth_attempts,
    short_url: sub.short_url,
    notes: sub.notes
  });

  // Check invoice
  const inv = await rzpGet('/invoices?subscription_id=sub_U0QQEGJ2wknuGJ');
  console.log('--- INVOICES FOR SUB ---');
  console.log(JSON.stringify(inv, null, 2));

  // Check the payments for this invoice
  if (inv.items && inv.items.length > 0) {
    const invId = inv.items[0].id;
    const invPayments = await rzpGet('/invoices/' + invId + '/payments');
    console.log('--- PAYMENTS FOR INVOICE ---');
    console.log(JSON.stringify(invPayments, null, 2));
  }
})();
`;

fs.writeFileSync('temp_check_sub_inv.js', remoteScript);
try {
  execSync('scp -i ~/.ssh/thabaal_vps temp_check_sub_inv.js root@189.72.145.225:/tmp/temp_check_sub_inv.js');
  const res = execSync('ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "node /tmp/temp_check_sub_inv.js"', { encoding: 'utf8' });
  console.log(res);
} finally {
  if (fs.existsSync('temp_check_sub_inv.js')) fs.unlinkSync('temp_check_sub_inv.js');
}
