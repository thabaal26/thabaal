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
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json'
      }
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

async function main() {
  const pays = await rzpGet('/payments?count=20');
  const items = pays.items || [];
  console.log('Total payments fetched:', items.length);

  const report = [];
  for (const p of items) {
    if (p.status !== 'captured' && p.amount === 299900) {
      let orderInfo = null;
      if (p.order_id) {
        orderInfo = await rzpGet('/orders/' + p.order_id);
      }
      report.push({
        payment_id: p.id,
        order_id: p.order_id,
        invoice_id: p.invoice_id,
        customer_id: p.customer_id,
        token_id: p.token_id,
        amount: p.amount,
        status: p.status,
        method: p.method,
        contact: p.contact,
        email: p.email,
        error_code: p.error_code,
        error_description: p.error_description,
        error_source: p.error_source,
        error_step: p.error_step,
        error_reason: p.error_reason,
        acquirer_data: p.acquirer_data,
        upi: p.upi,
        created_at: new Date(p.created_at * 1000).toISOString(),
        order_attempts: orderInfo ? orderInfo.attempts : null,
        order_status: orderInfo ? orderInfo.status : null
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const out = execSync(`ssh -i ~/.ssh/thabaal_vps root@189.72.145.225 "echo '${b64}' | base64 -d | node"`, { encoding: 'utf8' });
console.log(out);
