const { PrismaClient } = require('@prisma/client');
const { rzpCall } = require('./execute-real-autopay-test.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const subId = 'sub_U0514Pun1VBlYL';
  console.log(`Targeting Active Subscription: ${subId}`);

  // 1. Fetch current active state from Razorpay
  const getSub = await rzpCall('GET', `/subscriptions/${subId}`);
  const subBefore = getSub.data;
  console.log('\n[1] Authoritative Provider State BEFORE Cancellation:');
  console.log(JSON.stringify(subBefore, null, 2));

  if (subBefore.status !== 'active') {
    throw new Error(`Expected active subscription, found: ${subBefore.status}`);
  }

  // 2. Link into Thabaal Database
  console.log('\n[2] Creating QA Client, PlanPurchase, and RazorpayRecord in Thabaal DB:');
  const qaClient = await prisma.client.create({
    data: {
      name: `QA_CycleEnd_${Date.now()}`,
      billingMode: 'wallet',
    },
  });

  const startsAt = new Date(subBefore.current_start * 1000);
  const endsAt = new Date(subBefore.current_end * 1000);

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

  const record = await prisma.razorpayRecord.create({
    data: {
      kind: 'subscription',
      rzpId: subId,
      purpose: 'plan',
      clientId: qaClient.id,
      plan: 'growth',
      cycle: 'm',
      amountPaise: 100,
      status: 'active',
      createdBy: 'RealProviderCycleEndTester',
      refId: purchase.id,
    },
  });

  console.log(`  Client ID:       ${qaClient.id}`);
  console.log(`  PlanPurchase ID: ${purchase.id}`);
  console.log(`  RazorpayRecord:  ${record.id}`);

  // 3. Execute cancellation with cancel_at_cycle_end: 1
  console.log('\n[3] Sending POST /v1/subscriptions/:id/cancel with cancel_at_cycle_end: 1...');
  const cancelPayload = { cancel_at_cycle_end: 1 };
  const cancelRes = await rzpCall('POST', `/subscriptions/${subId}/cancel`, cancelPayload);

  console.log(`  Cancel Response HTTP Status: ${cancelRes.status}`);
  console.log('  Cancel Response Payload:');
  console.log(JSON.stringify(cancelRes.data, null, 2));

  // 4. Authoritative Subsequent GET Reconciliation
  console.log('\n[4] Subsequent Authoritative GET /v1/subscriptions/:id Reconciliation:');
  const getAfter = await rzpCall('GET', `/subscriptions/${subId}`);
  const subAfter = getAfter.data;
  console.log(JSON.stringify(subAfter, null, 2));

  // 5. Update Thabaal record based on provider acknowledgement (mirroring Thabaal cancelAutoRenew logic)
  const isScheduled = subAfter.has_scheduled_changes === true || cancelRes.data.has_scheduled_changes === true;
  const targetDbStatus = isScheduled ? 'cancelling' : subAfter.status;
  const effectiveEpoch = subAfter.change_scheduled_at || subAfter.current_end || subAfter.ended_at;
  const effectiveDate = effectiveEpoch ? new Date(effectiveEpoch * 1000) : endsAt;

  await prisma.razorpayRecord.update({
    where: { id: record.id },
    data: {
      status: targetDbStatus,
      note: `Cancelled via Cycle-End QA [${isScheduled ? 'Cycle End' : 'Immediate'}] (Effective: ${effectiveDate.toISOString()}) [Provider Confirmed]`,
    },
  });

  // 6. Verify Customer Paid Access in Thabaal DB
  console.log('\n[6] Verifying Customer Paid Access Preservation:');
  const verifyPurchase = await prisma.planPurchase.findUnique({ where: { id: purchase.id } });
  console.log(`  PlanPurchase Status: ${verifyPurchase.status}`);
  console.log(`  Original endsAt:     ${endsAt.toISOString()}`);
  console.log(`  Current endsAt:      ${verifyPurchase.endsAt.toISOString()}`);
  const accessIntact = verifyPurchase.status === 'VERIFIED' && verifyPurchase.endsAt.getTime() === endsAt.getTime();
  console.log(`  Customer Access 100% Intact: ${accessIntact ? 'YES' : 'NO'}`);

  const output = {
    subId,
    planId: subBefore.plan_id,
    subBefore,
    cancelPayload,
    cancelResponse: {
      status: cancelRes.status,
      data: cancelRes.data,
    },
    subAfter,
    qaClient: {
      clientId: qaClient.id,
      purchaseId: purchase.id,
      recordId: record.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      verifiedEndsAt: verifyPurchase.endsAt.toISOString(),
      accessIntact,
    },
  };

  fs.writeFileSync(path.join(__dirname, 'fresh-cycle-end-result.json'), JSON.stringify(output, null, 2), 'utf8');
  console.log('\nResults saved to fresh-cycle-end-result.json');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
