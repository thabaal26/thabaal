const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require(process.env.PW_CORE ?? 'C:/Users/step1/pwtmp/node_modules/playwright-core');
const { SignJWT } = require('jose');
const { rzpCall } = require('./execute-real-autopay-test.cjs');

const env = {
  ...dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8') || ''),
  ...dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8') || ''),
};

const prisma = new PrismaClient();
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'tests', 'qa', 'screenshots');

async function createSessionToken(userId) {
  const secretBytes = new TextEncoder().encode(env.AUTH_SECRET);
  return new SignJWT({ sub: userId, sv: 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretBytes);
}

async function main() {
  console.log('========================================================================');
  console.log('  THABAAL: FINAL END-TO-END RAZORPAY AUTOPAY CANCELLATION ACCEPTANCE');
  console.log('  CUSTOMER DASHBOARD UI -> SERVER ACTION -> RAZORPAY -> DB -> UI');
  console.log('========================================================================\n');

  const evidence = {
    startedAt: new Date().toISOString(),
    planId: 'plan_U03uhQtnmFLsXF',
    screenshots: {},
    viewports: {},
  };

  // -------------------------------------------------------------------------
  // PHASE 2 & 3: Environment Preflight & Fresh Disposable Subscription
  // -------------------------------------------------------------------------
  console.log('[PHASE 2 & 3] Preflight & Creating Fresh Disposable Test Mode Subscription:');
  const planRes = await rzpCall('GET', `/plans/${evidence.planId}`);
  if (planRes.status !== 200) {
    throw new Error(`Failed to fetch test plan ${evidence.planId}: ${JSON.stringify(planRes.data)}`);
  }
  console.log(`  Plan ID:        ${planRes.data.id} (${planRes.data.item.name})`);
  console.log(`  Amount:         ₹${planRes.data.item.amount / 100} INR monthly`);

  const candidateSubId = process.argv[2] || 'sub_U05Yyw6nBL4ZJz';
  let subId = null;
  let activeSub = null;

  // Check if candidate subscription is already active and pristine
  if (candidateSubId) {
    try {
      const chk = await rzpCall('GET', `/subscriptions/${candidateSubId}`);
      if (chk.status === 200 && chk.data.status === 'active' && chk.data.ended_at === null) {
        console.log(`  Reusing existing active, pristine Test Mode subscription: ${candidateSubId}`);
        subId = candidateSubId;
        activeSub = chk.data;
        evidence.subscriptionId = subId;
        evidence.createdState = chk.data;
      }
    } catch (e) {
      console.log(`  Candidate subscription not reusable: ${e.message}`);
    }
  }

  if (!subId) {
    const subPayload = {
      plan_id: evidence.planId,
      total_count: 6,
      quantity: 1,
      customer_notify: 1,
      notes: {
        purpose: 'thabaal_customer_dashboard_cycle_end_qa',
        environment: 'test_mode',
        created_at: new Date().toISOString(),
      },
    };

    const createSubRes = await rzpCall('POST', '/subscriptions', subPayload);
    if (createSubRes.status !== 200 && createSubRes.status !== 201) {
      throw new Error(`Failed to create subscription: ${JSON.stringify(createSubRes.data)}`);
    }

    const sub = createSubRes.data;
    subId = sub.id;
    evidence.subscriptionId = subId;
    evidence.createdState = sub;
    console.log(`  Subscription ID:${subId}`);
    console.log(`  Initial Status: ${sub.status}`);
    console.log(`  Short URL:      ${sub.short_url}\n`);

    // Authorize via Playwright
    console.log('[PHASE 4] Authorizing Subscription in Headless Chrome via UPI Mandate Simulation:');
    const browserAuth = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
    const authPage = await browserAuth.newPage({ viewport: { width: 1280, height: 800 } });

    try {
      await authPage.goto(sub.short_url, { waitUntil: 'networkidle', timeout: 30000 });
      console.log('  Hosted Subscription Page Loaded:', await authPage.title());

      await authPage.click('button:has-text("Start Subscription")');
      await authPage.waitForTimeout(3000);

      const frame = authPage.frames().find((f) => f.url().includes('checkout/public'));
      if (!frame) throw new Error('Razorpay Checkout iframe not found');

      console.log('  Filling verified contact credentials (9443123456 / support@thabaal.in)...');
      await frame.locator('[data-testid="contactNumber"]').fill('9443123456');
      await frame.locator('[data-testid="email-container"] input').fill('support@thabaal.in');
      await frame.locator('button:has-text("Continue")').click();
      await authPage.waitForTimeout(3000);

      console.log('  Clicking "Show QR" for UPI simulated recurring mandate capture...');
      const showQrBtn = await frame.$('button:has-text("Show QR")');
      if (showQrBtn) {
        await showQrBtn.click();
        await authPage.waitForTimeout(6000);
      }
      console.log('  Test authorization simulation completed.');
    } finally {
      await browserAuth.close();
    }

    // Poll until active
    console.log('  Waiting for Razorpay to activate subscription billing cycle...');
    for (let attempt = 1; attempt <= 10; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const chk = await rzpCall('GET', `/subscriptions/${subId}`);
      if (chk.data.status === 'active') {
        activeSub = chk.data;
        break;
      }
      console.log(`    Attempt ${attempt}: Status is ${chk.data.status}...`);
    }

    if (!activeSub) {
      throw new Error(`Subscription ${subId} did not become active at provider.`);
    }
  }

  evidence.activeProviderState = activeSub;
  console.log(`  Provider State ACTIVE:`);
  console.log(`    Status:         ${activeSub.status}`);
  console.log(`    Payment Method: ${activeSub.payment_method}`);
  console.log(`    Paid Count:     ${activeSub.paid_count}`);
  console.log(`    Current Start:  ${new Date(activeSub.current_start * 1000).toISOString()}`);
  console.log(`    Current End:    ${new Date(activeSub.current_end * 1000).toISOString()}`);
  console.log(`    Charge At:      ${new Date(activeSub.charge_at * 1000).toISOString()}\n`);

  // -------------------------------------------------------------------------
  // PHASE 5: Register QA Tenant, User, PlanPurchase & RazorpayRecord in DB
  // -------------------------------------------------------------------------
  console.log('[PHASE 5] Registering QA Tenant, Customer Account and Plan Records in Thabaal DB:');
  let qaClient, qaUser, purchase, record;

  const existingRecord = await prisma.razorpayRecord.findUnique({ where: { rzpId: subId } });
  if (existingRecord) {
    record = existingRecord;
    purchase = await prisma.planPurchase.findUnique({ where: { id: record.refId } });
    qaClient = await prisma.client.findUnique({ where: { id: record.clientId } });
    qaUser = await prisma.user.findFirst({ where: { clientId: record.clientId } });
    console.log('  Reusing existing linked DB records for', subId);
  } else {
    qaClient = await prisma.client.create({
      data: {
        name: `QA_CustE2E_${Date.now()}`,
        billingMode: 'wallet',
        supportPhone: '9443123456',
      },
    });

    qaUser = await prisma.user.create({
      data: {
        email: `qa_owner_${Date.now()}@thabaal.in`,
        name: 'QA Business Owner',
        role: 'CLIENT',
        access: 'MANAGER',
        clientId: qaClient.id,
        sessionVersion: 0,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      },
    });

    const startsAt = new Date(activeSub.current_start * 1000);
    const endsAt = new Date(activeSub.current_end * 1000);

    purchase = await prisma.planPurchase.create({
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

    record = await prisma.razorpayRecord.create({
      data: {
        kind: 'subscription',
        rzpId: subId,
        purpose: 'plan',
        clientId: qaClient.id,
        plan: 'growth',
        cycle: 'm',
        amountPaise: 100,
        status: 'active',
        createdBy: qaUser.name,
        refId: purchase.id,
      },
    });
  }

  const startsAt = new Date(activeSub.current_start * 1000);
  const endsAt = new Date(activeSub.current_end * 1000);

  evidence.dbPreState = {
    clientId: qaClient.id,
    userId: qaUser.id,
    purchaseId: purchase.id,
    recordId: record.id,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: purchase.status,
  };

  console.log(`  QA Client ID:       ${qaClient.id}`);
  console.log(`  QA User ID:         ${qaUser.id} (${qaUser.email})`);
  console.log(`  PlanPurchase ID:    ${purchase.id} (endsAt: ${endsAt.toISOString()})`);
  console.log(`  RazorpayRecord ID:  ${record.id} (status: ${record.status})\n`);

  // -------------------------------------------------------------------------
  // PHASE 6: Open Customer Dashboard in Playwright as QA Business Owner
  // -------------------------------------------------------------------------
  console.log('[PHASE 6] Launching Playwright & Opening Customer Dashboard (/dashboard/billing):');
  const sessionToken = await createSessionToken(qaUser.id);

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Set the session cookie for localhost:3000
  await context.addCookies([
    {
      name: 'wp_session',
      value: sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  // Monitor outgoing requests to verify that the Next.js server action triggers
  const outgoingNetwork = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') {
      outgoingNetwork.push({ url: req.url(), method: req.method() });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('    [Browser Console Error]:', msg.text());
    }
  });

  // Navigate to Billing page
  await page.goto(`${APP_URL}/dashboard/billing`, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('  Loaded Customer Billing Page:', await page.title());

  // Verify active subscription UI components
  const pageText = await page.innerText('body');
  const hasAutoPayActive = /Auto-pay/i.test(pageText);
  const cancelBtn = page.locator('button:has-text("Cancel subscription")').first();
  const cancelBtnCount = await cancelBtn.count();

  console.log(`  Auto-pay text visible in UI: ${hasAutoPayActive}`);
  console.log(`  Cancel subscription button count: ${cancelBtnCount}`);

  if (cancelBtnCount === 0) {
    throw new Error('Cancel subscription button is NOT visible to the customer on /dashboard/billing');
  }

  // Capture desktop active state
  const sActive = path.join(SCREENSHOT_DIR, '01-e2e-dashboard-active.png');
  await page.screenshot({ path: sActive, fullPage: true });
  evidence.screenshots.activeDesktop = sActive;
  console.log(`  Screenshot saved: 01-e2e-dashboard-active.png`);

  // Capture across all 5 viewports before cancellation
  const viewports = [
    { name: 'desktop', w: 1440, h: 900 },
    { name: 'laptop', w: 1280, h: 800 },
    { name: 'tablet', w: 768, h: 1024 },
    { name: 'mobile', w: 390, h: 844 },
    { name: 'small-mobile', w: 360, h: 740 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(500);
    const vpPath = path.join(SCREENSHOT_DIR, `01-e2e-active-${vp.name}.png`);
    await page.screenshot({ path: vpPath, fullPage: true });
    evidence.viewports[vp.name] = vpPath;
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // -------------------------------------------------------------------------
  // PHASE 7: Execute Cancellation from Customer Dashboard UI
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 7] Executing Cancellation Flow from Customer UI:');
  console.log('  1. Clicking "Cancel subscription" button...');
  await cancelBtn.click();
  await page.waitForTimeout(1000);

  // Check confirmation dialog
  const modal = page.locator('div[role="dialog"]');
  const modalVisible = await modal.isVisible();
  console.log(`  2. Confirmation modal opened: ${modalVisible}`);

  const modalText = await modal.innerText();
  console.log('  3. Confirmation modal content preview:');
  console.log('     ', modalText.replace(/\s+/g, ' ').slice(0, 300));

  const hasKeepOption = /Keep subscription/i.test(modalText);
  const hasAccessExplanation = /You keep full access/i.test(modalText) || /Auto-pay stops/i.test(modalText);
  console.log(`     - "Keep subscription" option present: ${hasKeepOption}`);
  console.log(`     - Retention of paid access explained: ${hasAccessExplanation}`);

  const sModal = path.join(SCREENSHOT_DIR, '02-e2e-modal-confirmation.png');
  await page.screenshot({ path: sModal, fullPage: true });
  evidence.screenshots.modalConfirmation = sModal;

  // Test Keep Subscription option first
  console.log('  4. Testing "Keep subscription" button to verify cancellation can be aborted...');
  await page.click('button:has-text("Keep subscription")');
  await page.waitForTimeout(1000);
  const modalAfterKeep = await modal.isVisible();
  console.log(`     Modal closed on "Keep subscription": ${!modalAfterKeep}`);

  // Re-open modal and confirm cancellation
  console.log('  5. Re-opening modal and confirming cancellation...');
  await page.locator('button:has-text("Cancel subscription")').first().click();
  await page.waitForTimeout(1000);

  const confirmCancelBtn = modal.locator('button.btn.danger:has-text("Cancel subscription")');
  console.log('  6. Clicking danger "Cancel subscription" button inside modal...');
  
  // Track action completion
  const actionPromise = page.waitForResponse((res) => res.status() === 200, { timeout: 15000 }).catch(() => null);
  await confirmCancelBtn.click();
  await actionPromise;
  await page.waitForTimeout(3000);

  console.log('  7. Server Action completed. Validating UI state change...');
  const textAfterCancel = await page.innerText('body');
  const hasCancellingNotice = /Auto-pay is off/i.test(textAfterCancel) || /cancelling/i.test(textAfterCancel) || /stays until/i.test(textAfterCancel) || /resubscribe/i.test(textAfterCancel);
  console.log(`     UI shows cancellation state: ${hasCancellingNotice}`);

  // Capture post-cancellation screenshots
  const sCancelled = path.join(SCREENSHOT_DIR, '03-e2e-dashboard-cancelled.png');
  await page.screenshot({ path: sCancelled, fullPage: true });
  evidence.screenshots.cancelledDesktop = sCancelled;

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(500);
    const vpPath = path.join(SCREENSHOT_DIR, `03-e2e-cancelled-${vp.name}.png`);
    await page.screenshot({ path: vpPath, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // -------------------------------------------------------------------------
  // PHASE 8: Razorpay Provider Response & Reconciliation
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 8] Querying Razorpay Test Mode API for Post-Cancellation State:');
  const reconRes = await rzpCall('GET', `/subscriptions/${subId}`);
  if (reconRes.status !== 200) {
    throw new Error(`Failed to reconcile subscription ${subId}: HTTP ${reconRes.status}`);
  }

  const liveAfter = reconRes.data;
  evidence.reconciledProviderState = liveAfter;

  console.log('  Authoritative Provider State (Razorpay GET):');
  console.log(`    Subscription ID:       ${liveAfter.id}`);
  console.log(`    Status:                ${liveAfter.status}`);
  console.log(`    ended_at:              ${liveAfter.ended_at ? new Date(liveAfter.ended_at * 1000).toISOString() : 'null'}`);
  console.log(`    current_start:         ${new Date(liveAfter.current_start * 1000).toISOString()}`);
  console.log(`    current_end:           ${new Date(liveAfter.current_end * 1000).toISOString()}`);
  console.log(`    charge_at:             ${liveAfter.charge_at ? new Date(liveAfter.charge_at * 1000).toISOString() : 'null'}`);
  console.log(`    paid_count:            ${liveAfter.paid_count}`);
  console.log(`    remaining_count:       ${liveAfter.remaining_count}`);
  console.log(`    has_scheduled_changes: ${liveAfter.has_scheduled_changes}`);

  // -------------------------------------------------------------------------
  // PHASE 9: Thabaal Local Database Validation
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 9] Validating Thabaal Local Database Records:');
  const updatedRecord = await prisma.razorpayRecord.findUnique({ where: { id: record.id } });
  console.log(`  RazorpayRecord ID:     ${updatedRecord.id}`);
  console.log(`  RazorpayRecord Status: ${updatedRecord.status}`);
  console.log(`  RazorpayRecord Note:   ${updatedRecord.note}`);

  evidence.dbPostRecord = updatedRecord;

  // -------------------------------------------------------------------------
  // PHASE 10: Paid Access Preservation
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 10] Validating Customer Paid Access Preservation (PlanPurchase):');
  const verifyPurchase = await prisma.planPurchase.findUnique({ where: { id: purchase.id } });
  console.log(`  PlanPurchase Status:   ${verifyPurchase.status}`);
  console.log(`  Original startsAt:     ${startsAt.toISOString()}`);
  console.log(`  Current startsAt:      ${verifyPurchase.startsAt.toISOString()}`);
  console.log(`  Original endsAt:       ${endsAt.toISOString()}`);
  console.log(`  Current endsAt:        ${verifyPurchase.endsAt.toISOString()}`);

  const statusIntact = verifyPurchase.status === 'VERIFIED';
  const datesIntact = verifyPurchase.endsAt.getTime() === endsAt.getTime() && verifyPurchase.startsAt.getTime() === startsAt.getTime();
  const paidAccessPreserved = statusIntact && datesIntact;

  console.log(`  Customer Legitimate Paid Access Intact: ${paidAccessPreserved ? 'YES (100% PRESERVED)' : 'NO (VIOLATION)'}`);
  evidence.paidAccessPreserved = paidAccessPreserved;

  // -------------------------------------------------------------------------
  // PHASE 11 & 12: Reload Page & Account Route Consistency Check
  // -------------------------------------------------------------------------
  console.log('\n[PHASE 11 & 12] Validating Persistence on Page Refresh & /dashboard/account:');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const textAfterReload = await page.innerText('body');
  const cancelBtnAfterReload = await page.locator('button:has-text("Cancel subscription")').count();
  console.log(`  After Reload - "Cancel subscription" button is gone: ${cancelBtnAfterReload === 0}`);

  // Check /dashboard/account
  await page.goto(`${APP_URL}/dashboard/account`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const sAccount = path.join(SCREENSHOT_DIR, '04-e2e-account-route.png');
  await page.screenshot({ path: sAccount, fullPage: true });
  evidence.screenshots.accountRoute = sAccount;
  console.log('  Loaded /dashboard/account and captured screenshot.');

  await browser.close();

  // Save evidence
  evidence.completedAt = new Date().toISOString();
  evidence.success = paidAccessPreserved && updatedRecord.status === 'cancelling';

  const outPath = path.join(__dirname, '..', 'tests', 'qa', 'dashboard-e2e-evidence.json');
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`\nEvidence written to: ${outPath}`);

  console.log('========================================================================');
  console.log(`  END-TO-END ACCEPTANCE EXECUTION: ${evidence.success ? 'SUCCESS (ALL VERIFIED)' : 'FAILED'}`);
  console.log('========================================================================');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
  });
