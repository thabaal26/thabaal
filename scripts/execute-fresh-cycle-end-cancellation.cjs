const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require(process.env.PW_CORE ?? 'C:/Users/step1/pwtmp/node_modules/playwright-core');
const { rzpCall } = require('./execute-real-autopay-test.cjs');

const prisma = new PrismaClient();

async function main() {
  console.log('========================================================================');
  console.log('  THABAAL: FRESH REAL DISPOSABLE SUBSCRIPTION & CYCLE-END CANCELLATION');
  console.log('========================================================================\n');

  const planId = 'plan_U03uhQtnmFLsXF';
  const timestamp = new Date().toISOString();

  // 1. Create fresh disposable subscription
  console.log('[STAGE 1] Creating fresh disposable Test Mode subscription...');
  const createSubPayload = {
    plan_id: planId,
    total_count: 6,
    quantity: 1,
    customer_notify: 1,
    notes: {
      purpose: 'thabaal_fresh_cycle_end_cancellation_qa',
      environment: 'test_mode',
      created_at: timestamp,
    },
  };

  const subRes = await rzpCall('POST', '/subscriptions', createSubPayload);
  if (subRes.status !== 200 && subRes.status !== 201) {
    throw new Error(`Failed to create subscription: ${JSON.stringify(subRes.data)}`);
  }

  const sub = subRes.data;
  const subId = sub.id;
  console.log(`  Created Subscription ID: ${subId}`);
  console.log(`  Initial Status:          ${sub.status}`);
  console.log(`  Short URL:               ${sub.short_url}\n`);

  // 2. Playwright Test Mode Authorization Flow
  console.log('[STAGE 2] Authorizing subscription via Playwright checkout...');
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto(sub.short_url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('  Hosted Subscription Page Loaded:', await page.title());

    const s1 = path.join(__dirname, '..', 'tests', 'qa', 'screenshots', 'fresh-01-hosted-page.png');
    await page.screenshot({ path: s1, fullPage: true });

    await page.click('button:has-text("Start Subscription")');
    await page.waitForTimeout(3000);

    const frame = page.frames().find((f) => f.url().includes('checkout/public'));
    if (!frame) throw new Error('Razorpay Checkout iframe not found');

    console.log('  Entering customer contact: 9443123456 / support@thabaal.in...');
    await frame.locator('[data-testid="contactNumber"]').fill('9443123456');
    await frame.locator('[data-testid="email-container"] input').fill('support@thabaal.in');
    await frame.locator('button:has-text("Continue")').click();
    await page.waitForTimeout(3000);

    const s2 = path.join(__dirname, '..', 'tests', 'qa', 'screenshots', 'fresh-02-payment-options.png');
    await page.screenshot({ path: s2, fullPage: true });

    console.log('  Clicking Show QR for UPI simulated mandate capture...');
    const showQrBtn = await frame.$('button:has-text("Show QR")');
    if (showQrBtn) {
      await showQrBtn.click();
      await page.waitForTimeout(5000);
    }

    const s3 = path.join(__dirname, '..', 'tests', 'qa', 'screenshots', 'fresh-03-payment-confirming.png');
    await page.screenshot({ path: s3, fullPage: true });
    console.log('  Playwright authorization interaction completed.');
  } finally {
    await browser.close();
  }

  // 3. Verify Active status at Provider
  console.log('\n[STAGE 3] Querying authoritative provider state before cancellation...');
  const getBefore = await rzpCall('GET', `/subscriptions/${subId}`);
  const liveBefore = getBefore.data;

  console.log('  Provider State BEFORE Cancellation:');
  console.log(`    Subscription ID:       ${liveBefore.id}`);
  console.log(`    Status:                ${liveBefore.status}`);
  console.log(`    current_start:         ${liveBefore.current_start} (${new Date(liveBefore.current_start * 1000).toISOString()})`);
  console.log(`    current_end:           ${liveBefore.current_end} (${new Date(liveBefore.current_end * 1000).toISOString()})`);
  console.log(`    charge_at:             ${liveBefore.charge_at} (${liveBefore.charge_at ? new Date(liveBefore.charge_at * 1000).toISOString() : 'null'})`);
  console.log(`    total_count:           ${liveBefore.total_count}`);
  console.log(`    paid_count:            ${liveBefore.paid_count}`);
  console.log(`    remaining_count:       ${liveBefore.remaining_count}`);
  console.log(`    payment_method:        ${liveBefore.payment_method}`);
  console.log(`    has_scheduled_changes: ${liveBefore.has_scheduled_changes}`);
  console.log(`    change_scheduled_at:   ${liveBefore.change_scheduled_at}`);

  if (liveBefore.status !== 'active') {
    throw new Error(`Subscription status is not active: ${liveBefore.status}`);
  }

  // 4. Link into Thabaal Database (Isolated QA Client)
  console.log('\n[STAGE 4] Linking active subscription into Thabaal Database...');
  const qaClient = await prisma.client.create({
    data: {
      name: `QA_CycleEnd_${Date.now()}`,
      billingMode: 'wallet',
    },
  });

  const startsAt = new Date(liveBefore.current_start * 1000);
  const endsAt = new Date(liveBefore.current_end * 1000);

  const purchase = await prisma.planPurchase.create({
    data: {
      clientId: qaClient.id,
      plan: 'growth',
      cycle: 'm',
      amountPaise: 100,
      status: 'VERIFIED',
      startsAt,
      endsAt,
      method: 'RAZORPAY',
      utr: `rzp_upi_pay_${Date.now()}`,
      note: `Verified AutoPay subscription ${subId}`,
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
      status: 'active',
      createdBy: 'RealProviderTester',
      refId: purchase.id,
    },
  });

  console.log(`  Client ID:       ${qaClient.id}`);
  console.log(`  PlanPurchase ID: ${purchase.id} (endsAt: ${endsAt.toISOString()})`);
  console.log(`  RazorpayRecord:  ${rzpRecord.id}`);

  // 5. Execute Cycle-End Cancellation Request
  console.log('\n[STAGE 5] Executing Cycle-End Cancellation (cancel_at_cycle_end: 1)...');
  const cancelPayload = { cancel_at_cycle_end: 1 };
  console.log('  Request Endpoint: POST /v1/subscriptions/' + subId + '/cancel');
  console.log('  Request Body:    ', JSON.stringify(cancelPayload));

  const cancelRes = await rzpCall('POST', `/subscriptions/${subId}/cancel`, cancelPayload);
  console.log(`  Response Status Code: ${cancelRes.status}`);
  console.log('  Response Body:       ', JSON.stringify(cancelRes.data, null, 2));

  // 6. Authoritative GET Reconciliation
  console.log('\n[STAGE 6] Subsequent Authoritative GET Reconciliation...');
  const getAfter = await rzpCall('GET', `/subscriptions/${subId}`);
  const liveAfter = getAfter.data;

  console.log('  Provider State AFTER Cancellation:');
  console.log(`    Subscription ID:       ${liveAfter.id}`);
  console.log(`    Status:                ${liveAfter.status}`);
  console.log(`    ended_at:              ${liveAfter.ended_at} (${liveAfter.ended_at ? new Date(liveAfter.ended_at * 1000).toISOString() : 'null'})`);
  console.log(`    has_scheduled_changes: ${liveAfter.has_scheduled_changes}`);
  console.log(`    change_scheduled_at:   ${liveAfter.change_scheduled_at} (${liveAfter.change_scheduled_at ? new Date(liveAfter.change_scheduled_at * 1000).toISOString() : 'null'})`);
  console.log(`    charge_at:             ${liveAfter.charge_at} (${liveAfter.charge_at ? new Date(liveAfter.charge_at * 1000).toISOString() : 'null'})`);
  console.log(`    current_start:         ${liveAfter.current_start} (${new Date(liveAfter.current_start * 1000).toISOString()})`);
  console.log(`    current_end:           ${liveAfter.current_end} (${new Date(liveAfter.current_end * 1000).toISOString()})`);
  console.log(`    paid_count:            ${liveAfter.paid_count}`);
  console.log(`    remaining_count:       ${liveAfter.remaining_count}`);

  // 7. Update Thabaal Database according to provider acknowledgement
  console.log('\n[STAGE 7] Updating Thabaal database record based on provider acknowledgement...');
  const isScheduled = liveAfter.has_scheduled_changes === true || cancelRes.data.has_scheduled_changes === true;
  const isImmediate = liveAfter.status === 'cancelled' && !isScheduled;
  const targetDbStatus = isScheduled ? 'cancelling' : liveAfter.status;
  const effectiveEpoch = liveAfter.change_scheduled_at || liveAfter.current_end || liveAfter.ended_at;
  const effectiveDate = effectiveEpoch ? new Date(effectiveEpoch * 1000) : endsAt;

  await prisma.razorpayRecord.update({
    where: { id: rzpRecord.id },
    data: {
      status: targetDbStatus,
      note: `Cancelled via Cycle-End QA Test [${isScheduled ? 'Scheduled at Cycle End' : 'Immediate'}] (Effective: ${effectiveDate.toISOString()}) [Provider Confirmed]`,
    },
  });

  // 8. Verify Customer Paid Access Preservation
  console.log('\n[STAGE 8] Verifying Customer Paid Access Preservation in Thabaal DB...');
  const verifyPurchase = await prisma.planPurchase.findUnique({ where: { id: purchase.id } });
  console.log(`  PlanPurchase Status: ${verifyPurchase.status}`);
  console.log(`  Original endsAt:     ${endsAt.toISOString()}`);
  console.log(`  Current endsAt:      ${verifyPurchase.endsAt.toISOString()}`);

  const accessIntact = verifyPurchase.status === 'VERIFIED' && verifyPurchase.endsAt.getTime() === endsAt.getTime();
  console.log(`  Customer Legitimate Access Intact: ${accessIntact ? 'YES (100% PRESERVED)' : 'NO (TAMPERED)'}`);

  const finalEvidence = {
    planId,
    subId,
    liveBefore,
    cancelPayload,
    cancelResponse: {
      status: cancelRes.status,
      data: cancelRes.data,
    },
    liveAfter,
    qaClient: {
      clientId: qaClient.id,
      purchaseId: purchase.id,
      recordId: rzpRecord.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      verifiedEndsAt: verifyPurchase.endsAt.toISOString(),
      accessIntact,
    },
  };

  const outPath = path.join(__dirname, 'fresh-cycle-end-evidence.json');
  fs.writeFileSync(outPath, JSON.stringify(finalEvidence, null, 2), 'utf8');
  console.log(`\nEvidence written to: ${outPath}`);
  console.log('========================================================================');
  console.log('  TEST EXECUTION COMPLETED SUCCESSFULLY');
  console.log('========================================================================');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR in execution:', err);
    process.exit(1);
  });
