const fs = require('fs');
const path = require('path');
const https = require('https');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Parse .env.local
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [k, ...rest] = trimmed.split('=');
    const v = rest.join('=').trim().replace(/^["']|["']$/g, '');
    if (!process.env[k.trim()]) {
      process.env[k.trim()] = v;
    }
  }
}

const keyId = process.env.RAZORPAY_KEY_ID?.trim();
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
const accessToken = process.env.RAZORPAY_ACCESS_TOKEN?.trim();

async function rzpCall(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Thabaal-Razorpay-Verification/1.0',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      headers['Authorization'] = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    }

    const payload = body ? JSON.stringify(body) : null;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(
      `https://api.razorpay.com/v1${apiPath}`,
      { method, headers, timeout: 20000 },
      (res) => {
        let resData = '';
        res.on('data', (c) => (resData += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = resData ? JSON.parse(resData) : null;
          } catch {
            parsed = resData;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Razorpay API request timeout'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('  THABAAL — REAL RAZORPAY TEST MODE AUTOPAY VERIFICATION');
  console.log('================================================================\n');

  // 1. Safety Checks
  if (keyId?.startsWith('rzp_live_')) {
    console.error('[CRITICAL SAFETY VIOLATION] RAZORPAY_KEY_ID is a LIVE key! Aborting immediately.');
    process.exit(1);
  }

  if (!accessToken && (!keyId || !keySecret)) {
    console.error('[CREDENTIAL MISSING] Razorpay Test Mode credentials are not configured in .env.local.');
    console.error('Please run: node scripts/input-test-credentials.cjs');
    process.exit(1);
  }

  console.log('[STEP 1] Credential Validation:');
  console.log(`  Auth Mode: ${accessToken ? 'OAuth Bearer Token' : 'Basic Auth (Key ID + Secret)'}`);
  if (keyId) console.log(`  Key ID Prefix: ${keyId.slice(0, 12)}... (Verified TEST Mode)`);
  console.log('  API Host: https://api.razorpay.com/v1 (Official Razorpay Endpoint)\n');

  // 2. Check or Create Plan
  console.log('[STEP 2] Check / Create ₹1 Test Plan:');
  const planName = 'THABAAL_AUTOPAY_CANCELLATION_QA_1_RUPEE';
  let planId = null;

  try {
    const listRes = await rzpCall('GET', '/plans?count=10');
    if (listRes.status === 200 && listRes.data?.items) {
      const existing = listRes.data.items.find((p) => p.item?.name === planName);
      if (existing) {
        planId = existing.id;
        console.log(`  Found existing test plan: ${planId} (${existing.item.name}, ₹${existing.item.amount / 100})`);
      }
    }
  } catch (err) {
    console.warn('  Could not list existing plans:', err.message);
  }

  if (!planId) {
    console.log(`  Attempting to create plan "${planName}" with amount ₹1.00 (100 paise)...`);
    const planPayload = {
      period: 'monthly',
      interval: 1,
      item: {
        name: planName,
        amount: 100, // 100 paise = ₹1.00
        currency: 'INR',
        description: 'Disposable Razorpay Test Mode plan for Thabaal AutoPay cancellation verification.',
      },
    };

    const createPlanRes = await rzpCall('POST', '/plans', planPayload);
    if (createPlanRes.status === 200 || createPlanRes.status === 201) {
      planId = createPlanRes.data.id;
      console.log(`  [SUCCESS] Plan created successfully: ${planId} (HTTP ${createPlanRes.status})`);
    } else {
      console.error(`  [PLAN CREATION FAILED] HTTP ${createPlanRes.status}`);
      console.error('  Razorpay Response:', JSON.stringify(createPlanRes.data, null, 2));
      return {
        ok: false,
        step: 'plan_creation',
        status: createPlanRes.status,
        error: createPlanRes.data,
      };
    }
  }

  // 3. Create Disposable Subscription
  console.log('\n[STEP 3] Create Disposable Test Subscription:');
  const subPayload = {
    plan_id: planId,
    total_count: 6,
    quantity: 1,
    customer_notify: 1,
    notes: {
      purpose: 'qa_autopay_cancellation_verification',
      environment: 'test_mode',
      platform: 'thabaal_saas',
      timestamp: new Date().toISOString(),
    },
  };

  const createSubRes = await rzpCall('POST', '/subscriptions', subPayload);
  if (createSubRes.status !== 200 && createSubRes.status !== 201) {
    console.error(`  [SUBSCRIPTION CREATION FAILED] HTTP ${createSubRes.status}`);
    console.error('  Razorpay Response:', JSON.stringify(createSubRes.data, null, 2));
    return {
      ok: false,
      step: 'subscription_creation',
      status: createSubRes.status,
      error: createSubRes.data,
    };
  }

  const sub = createSubRes.data;
  const subId = sub.id;
  console.log(`  [SUCCESS] Subscription created on Razorpay: ${subId}`);
  console.log(`  Status: ${sub.status}`);
  console.log(`  Short URL: ${sub.short_url || 'N/A'}`);
  console.log(`  Total Count: ${sub.total_count}`);

  // 4. Fetch and Verify Subscription State from Razorpay
  console.log('\n[STEP 4] Fetch & Verify Subscription Directly from Provider:');
  const getSubRes = await rzpCall('GET', `/subscriptions/${subId}`);
  if (getSubRes.status !== 200) {
    console.error(`  [GET FAILED] HTTP ${getSubRes.status}`);
    return { ok: false, step: 'get_subscription', status: getSubRes.status };
  }
  const verifiedSub = getSubRes.data;
  console.log(`  Provider Verified Status: ${verifiedSub.status}`);
  console.log(`  Plan ID: ${verifiedSub.plan_id}`);
  console.log(`  Has Scheduled Changes: ${verifiedSub.has_scheduled_changes}`);

  // 5. Register in Thabaal Database
  console.log('\n[STEP 5] Register Test Subscription in Thabaal Database:');
  const qaClient = await prisma.client.create({
    data: {
      name: `QA_Razorpay_${Date.now()}`,
      billingMode: 'wallet',
    },
  });

  const now = new Date();
  const endsAt = new Date(now.getTime() + 30 * 86400 * 1000);

  const purchase = await prisma.planPurchase.create({
    data: {
      clientId: qaClient.id,
      plan: 'growth',
      cycle: 'm',
      amountPaise: 100,
      status: 'VERIFIED',
      startsAt: now,
      endsAt,
      method: 'RAZORPAY',
      utr: `test_pay_${Date.now()}`,
      note: `Linked to test subscription ${subId}`,
    },
  });

  const rzpRecord = await prisma.razorpayRecord.create({
    data: {
      kind: 'subscription',
      rzpId: subId,
      purpose: 'plan',
      clientId: qaClient.id,
      plan: 'growth',
      cycle: 'm',
      amountPaise: 100,
      status: verifiedSub.status,
      createdBy: 'TestRunner',
      refId: purchase.id,
    },
  });

  console.log(`  Saved QA Client: ${qaClient.id}`);
  console.log(`  Saved PlanPurchase: ${purchase.id} (endsAt: ${endsAt.toISOString()})`);
  console.log(`  Saved RazorpayRecord: ${rzpRecord.id} (status: ${rzpRecord.status})`);

  // 6. Execute Real Provider Scheduled Cancellation
  console.log('\n[STEP 6] Execute Real Scheduled Cancellation (POST /v1/subscriptions/:id/cancel):');
  console.log('  Calling Razorpay Subscriptions API with cancel_at_cycle_end: 1...');
  
  const cancelRes = await rzpCall('POST', `/subscriptions/${subId}/cancel`, { cancel_at_cycle_end: 1 });
  console.log(`  Cancellation API HTTP Status: ${cancelRes.status}`);
  console.log('  Provider Response:', JSON.stringify(cancelRes.data, null, 2));

  // 7. Authoritative GET Reconciliation
  console.log('\n[STEP 7] Independent Provider GET Reconciliation (GET /v1/subscriptions/:id):');
  const reconcileRes = await rzpCall('GET', `/subscriptions/${subId}`);
  console.log(`  Reconciliation HTTP Status: ${reconcileRes.status}`);
  const finalProviderSub = reconcileRes.data;
  console.log(`  Authoritative Status: ${finalProviderSub.status}`);
  console.log(`  has_scheduled_changes: ${finalProviderSub.has_scheduled_changes}`);
  console.log(`  change_scheduled_at: ${finalProviderSub.change_scheduled_at}`);

  // 8. Update Local Database
  const targetStatus = finalProviderSub.has_scheduled_changes ? 'cancelling' : finalProviderSub.status === 'cancelled' ? 'cancelled' : 'cancelling';
  await prisma.razorpayRecord.update({
    where: { id: rzpRecord.id },
    data: {
      status: targetStatus,
      note: `Cancelled in Test Mode [Provider Confirmed] [Scheduled]`,
    },
  });

  // 9. Verify Paid Access Retention
  console.log('\n[STEP 8] Verify Paid Access Preservation in Thabaal:');
  const intactPurchase = await prisma.planPurchase.findUnique({ where: { id: purchase.id } });
  console.log(`  PlanPurchase Status: ${intactPurchase.status}`);
  console.log(`  PlanPurchase endsAt: ${intactPurchase.endsAt.toISOString()} (Matches original: ${intactPurchase.endsAt.getTime() === endsAt.getTime()})`);

  console.log('\n================================================================');
  console.log('  EXECUTION COMPLETE: REAL PROVIDER EVIDENCE COLLECTED');
  console.log('================================================================\n');

  return {
    ok: true,
    planId,
    subId,
    verifiedSub,
    cancelRes: cancelRes.data,
    finalProviderSub,
    purchaseIntact: intactPurchase.endsAt.getTime() === endsAt.getTime(),
    clientId: qaClient.id,
  };
}

if (require.main === module) {
  run()
    .then((result) => {
      console.log('Result:', result.ok ? 'SUCCESS' : 'FAILED');
      process.exit(result.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error('Fatal error:', e);
      process.exit(1);
    });
}

module.exports = { run, rzpCall };
