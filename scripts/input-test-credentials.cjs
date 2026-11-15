const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');

const envLocalPath = path.join(__dirname, '..', '.env.local');

function questionHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const stdin = process.openStdin();
    process.stdout.write(query);

    let input = '';
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData);
          break;
        default:
          process.stdout.write('*');
          break;
      }
    };

    process.stdin.on('data', onData);

    rl.question('', (value) => {
      process.stdout.write('\n');
      rl.close();
      resolve(value.trim());
    });
  });
}

function question(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function testApiCall(keyId, secret, accessToken) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'Thabaal-QA-Test-Harness/1.0',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      headers['Authorization'] = `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`;
    }

    const req = https.request(
      'https://api.razorpay.com/v1/plans?count=1',
      { method: 'GET', headers, timeout: 10000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: data });
        });
      }
    );

    req.on('error', (err) => resolve({ error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'Request timeout to Razorpay API' });
    });
    req.end();
  });
}

async function main() {
  console.log('================================================================');
  console.log('  THABAAL — SECURE RAZORPAY TEST MODE CREDENTIAL INGESTION');
  console.log('================================================================');
  console.log('Safety Checks:');
  console.log('1. Values will be saved only to local git-ignored .env.local');
  console.log('2. Live Mode keys (rzp_live_...) are STRICTLY REJECTED.');
  console.log('3. Typing for secret keys / tokens will be masked.');
  console.log('----------------------------------------------------------------\n');

  console.log('Select Credential Type:');
  console.log('  1) Razorpay API Key ID (rzp_test_...) & Key Secret (Recommended for Subscriptions & Checkout)');
  console.log('  2) Razorpay OAuth Access Token');
  const choice = await question('Enter choice [1 or 2]: ');

  let keyId = '';
  let keySecret = '';
  let accessToken = '';

  if (choice === '2') {
    accessToken = await questionHidden('Enter Razorpay Test Mode Access Token (typing hidden): ');
    if (!accessToken) {
      console.error('\n[ERROR] Access token cannot be empty.');
      process.exit(1);
    }
  } else {
    keyId = await question('Enter Razorpay Test Key ID (must start with rzp_test_): ');
    if (!keyId.startsWith('rzp_test_')) {
      console.error('\n[CRITICAL SAFETY BLOCK] The Key ID does NOT start with rzp_test_.');
      if (keyId.startsWith('rzp_live_')) {
        console.error('LIVE KEYS ARE STRICTLY FORBIDDEN! Aborting immediately without saving.');
      } else {
        console.error('Invalid Test Key format. Expected rzp_test_<alphanumeric>. Aborting.');
      }
      process.exit(1);
    }

    keySecret = await questionHidden('Enter Razorpay Test Key Secret (typing hidden): ');
    if (!keySecret) {
      console.error('\n[ERROR] Key Secret cannot be empty.');
      process.exit(1);
    }
  }

  console.log('\nValidating credentials with Razorpay Test Mode API (https://api.razorpay.com/v1/plans)...');
  const res = await testApiCall(keyId, keySecret, accessToken);

  if (res.error) {
    console.error(`\n[CONNECTION ERROR] Could not reach Razorpay API: ${res.error}`);
    process.exit(1);
  }

  if (res.status === 200) {
    console.log('[SUCCESS] Razorpay Test Mode authentication verified! HTTP 200 OK.');
  } else if (res.status === 401) {
    console.error(`\n[AUTHENTICATION FAILED] Razorpay returned HTTP 401 Unauthorized.`);
    console.error('Please verify that the Key ID and Key Secret (or Access Token) are active in Test Mode.');
    process.exit(1);
  } else {
    console.warn(`[WARNING] Razorpay returned HTTP ${res.status}: ${res.body?.slice(0, 200)}`);
  }

  // Update .env.local safely
  let envContent = '';
  if (fs.existsSync(envLocalPath)) {
    envContent = fs.readFileSync(envLocalPath, 'utf8');
  }

  // Remove existing Razorpay vars
  const cleanedLines = envContent
    .split('\n')
    .filter(
      (line) =>
        !line.trim().startsWith('RAZORPAY_KEY_ID') &&
        !line.trim().startsWith('RAZORPAY_KEY_SECRET') &&
        !line.trim().startsWith('RAZORPAY_ACCESS_TOKEN') &&
        !line.trim().startsWith('RAZORPAY_MODE')
    );

  const newVars = [];
  if (keyId) newVars.push(`RAZORPAY_KEY_ID="${keyId}"`);
  if (keySecret) newVars.push(`RAZORPAY_KEY_SECRET="${keySecret}"`);
  if (accessToken) newVars.push(`RAZORPAY_ACCESS_TOKEN="${accessToken}"`);
  newVars.push(`RAZORPAY_MODE="test"`);

  cleanedLines.push(...newVars);
  fs.writeFileSync(envLocalPath, cleanedLines.join('\n').trim() + '\n', 'utf8');

  console.log('\n[SAVED] Razorpay Test Mode configuration safely written to .env.local.');
  console.log('Environment is ready for ₹1 Plan & Subscription Creation.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
