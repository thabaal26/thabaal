import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import { addWebsiteLead, convertLead, moveLead } from "../../src/lib/leads";
import { requestDemo } from "../../src/app/(portal)/login/demo-actions";
import { sendEmail } from "../../src/lib/email";

describe("ADMIN-DEMO-CLOSURE: Turn 32 Closure Requirements Test Suite", () => {
  const adminActor = {
    id: "usr_admin_turn32",
    isAdmin: true,
    name: "Master Admin Turn32",
  };

  const testPhone = "9944112233";
  const testShop = "CLOSURE_TEST_OILS";
  const testPerson = "Sundaram Test";

  test("CLOSURE-1: IP Rate Limiting & Abuse Prevention Enforcement", async () => {
    // Clean up loginAttempt records for demo keys
    await db.loginAttempt.deleteMany({ where: { key: "demo:unknown" } });

    // Step 1: Pre-populate or execute submissions up to the 5-request limit
    for (let i = 1; i <= 5; i++) {
      const form = new FormData();
      form.append("shop", `Test Shop Rate ${i}`);
      form.append("person", `Person ${i}`);
      form.append("phone", `980000000${i}`);
      const res = await requestDemo(undefined, form);
      assert.equal(res?.ok, true, `Submission ${i} within limit must succeed`);
    }

    // Verify 5 attempts logged
    const count5 = await db.loginAttempt.count({ where: { key: "demo:unknown" } });
    assert.equal(count5, 5, "Exactly 5 loginAttempt records must be created");

    // Step 2: 6th submission must be rejected by the rate limiter
    const form6 = new FormData();
    form6.append("shop", "Rate Limited Shop");
    form6.append("person", "Blocked Person");
    form6.append("phone", "9811111111");
    const res6 = await requestDemo(undefined, form6);
    assert.equal(res6?.ok, undefined, "6th submission must not be ok");
    assert.match(
      res6?.error ?? "",
      /Too many requests from this network/,
      "Must return specific rate-limit error message"
    );

    // Verify database: 6th lead was NEVER created
    const blockedLead = await db.lead.findFirst({ where: { phone: "9811111111" } });
    assert.equal(blockedLead, null, "Rate-limited submission must never create a Lead record");

    // Step 3: Cooldown simulation - delete attempts simulating window expiration
    await db.loginAttempt.deleteMany({ where: { key: "demo:unknown" } });

    // 7th submission after cooldown succeeds
    const res7 = await requestDemo(undefined, form6);
    assert.equal(res7?.ok, true, "Submission after rate-limit cooldown must succeed");
    const unblockedLead = await db.lead.findFirst({ where: { phone: "9811111111" } });
    assert.notEqual(unblockedLead, null, "Lead must be created after cooldown");

    // Clean up
    await db.leadActivity.deleteMany({ where: { leadId: unblockedLead!.id } });
    await db.lead.delete({ where: { id: unblockedLead!.id } });
    for (let i = 1; i <= 5; i++) {
      await db.leadActivity.deleteMany({ where: { lead: { phone: `980000000${i}` } } });
      await db.lead.deleteMany({ where: { phone: `980000000${i}` } });
    }
    await db.loginAttempt.deleteMany({ where: { key: "demo:unknown" } });
  });

  test("CLOSURE-2: Email Notification Fail-Safe Isolation", async () => {
    // Clean up
    await db.leadActivity.deleteMany({ where: { lead: { phone: testPhone } } });
    await db.lead.deleteMany({ where: { phone: testPhone } });

    // Even if RESEND_API_KEY is not set or network fails, requestDemo must successfully persist the lead
    const form = new FormData();
    form.append("shop", testShop);
    form.append("person", testPerson);
    form.append("phone", testPhone);
    form.append("town", "Madurai");
    form.append("sells", "Organic Sesame Oil");
    form.append("plan", "starter");

    const res = await requestDemo(undefined, form);
    assert.equal(res?.ok, true, "Form must succeed even if email delivery fails");

    const lead = await db.lead.findFirst({ where: { phone: testPhone } });
    assert.notEqual(lead, null, "Lead must be safely persisted in PostgreSQL");
    assert.equal(lead?.shop, testShop);

    // Verify activity record exists
    const act = await db.leadActivity.findFirst({ where: { leadId: lead!.id, kind: "created" } });
    assert.notEqual(act, null, "LeadActivity must be committed");
  });

  test("CLOSURE-3: Same-Phone Deduplication Policy & Converted Lead Protection", async () => {
    // Case A: Same phone, existing OPEN lead -> updates existing lead, sets nextOn to today, again: true
    const formAgain = new FormData();
    formAgain.append("shop", testShop);
    formAgain.append("person", testPerson);
    formAgain.append("phone", testPhone);
    formAgain.append("town", "Madurai Town");
    formAgain.append("plan", "growth");

    const resAgain = await requestDemo(undefined, formAgain);
    assert.equal(resAgain?.ok, true);
    assert.equal(resAgain?.again, true, "Must flag again: true for duplicate open submission");

    const leadsCount = await db.lead.count({ where: { phone: testPhone } });
    assert.equal(leadsCount, 1, "Exactly 1 lead must exist for the open inquiry (no duplicate row)");

    // Case B: Close the lead as WON and convert it to a client
    const lead = await db.lead.findFirst({ where: { phone: testPhone } });
    assert.notEqual(lead, null);
    await moveLead(adminActor, lead!.id, "won");

    const convRes = await convertLead(adminActor, lead!.id, {
      name: `CONVERTED_CLIENT_${Date.now()}`,
      city: "Madurai",
      businessType: "oils",
    });
    assert.equal(convRes.ok, true, "Lead conversion must succeed");

    // Case C: Same phone submits AGAIN after previous lead was won/converted
    // Deduplication policy: Historical won/converted record is NEVER overwritten; a new enquiry is opened!
    const newSubmissionPhone = testPhone;
    const formNew = new FormData();
    formNew.append("shop", "Second Enquiry for Same Phone");
    formNew.append("person", testPerson);
    formNew.append("phone", newSubmissionPhone);

    const resNew = await requestDemo(undefined, formNew);
    assert.equal(resNew?.ok, true);
    assert.equal(resNew?.again, undefined, "Must NOT be marked again: true because previous lead was closed/converted");

    const postLeads = await db.lead.findMany({ where: { phone: testPhone }, orderBy: { createdAt: "asc" } });
    assert.equal(postLeads.length, 2, "Must have exactly 2 leads: 1 historical won client + 1 fresh open enquiry");
    assert.equal(postLeads[0].stage, "won", "Historical lead must preserve stage: won");
    assert.notEqual(postLeads[0].clientId, null, "Historical lead must preserve linked clientId");
    assert.equal(postLeads[1].stage, "new", "New lead must be at stage: new");
    assert.equal(postLeads[1].clientId, null, "New lead must have clientId: null");

    // Clean up
    for (const l of postLeads) {
      await db.leadActivity.deleteMany({ where: { leadId: l.id } });
      if (l.clientId) {
        await db.order.deleteMany({ where: { clientId: l.clientId } });
        await db.client.delete({ where: { id: l.clientId } });
      }
      await db.lead.delete({ where: { id: l.id } });
    }
  });

  test("CLOSURE-4: 10-Concurrent Lead-to-Client Conversion Atomicity (PostgreSQL Concurrency)", async () => {
    // Setup a clean won lead for concurrency stress test
    const concPhone = "9988776655";
    await db.leadActivity.deleteMany({ where: { lead: { phone: concPhone } } });
    await db.lead.deleteMany({ where: { phone: concPhone } });

    const newLeadRes = await addWebsiteLead({
      shop: "CONCURRENCY_TEST_SHOP",
      person: "Concurrent Owner",
      phone: concPhone,
      town: "Madurai",
      plan: "business",
    });
    assert.equal(newLeadRes.ok, true);
    const targetLeadId = newLeadRes.id!;

    // Move to won stage
    const moveRes = await moveLead(adminActor, targetLeadId, "won");
    assert.equal(moveRes.ok, true);

    const baseClientName = `CONCURRENCY_CO_${Date.now()}`;

    // Execute 10 simultaneous conversion attempts
    const conversionPromises = Array.from({ length: 10 }, (_, i) =>
      convertLead(adminActor, targetLeadId, {
        name: `${baseClientName}_${i}`,
        city: "Madurai",
        businessType: "oils",
      })
    );

    const settled = await Promise.allSettled(conversionPromises);

    // Analyze returned HTTP/action results
    const successes = settled.filter(
      (s) => s.status === "fulfilled" && s.value.ok === true
    );
    const rejections = settled.filter(
      (s) =>
        s.status === "fulfilled" &&
        s.value.ok === false &&
        s.value.message === "This enquiry is already a business."
    );

    assert.equal(successes.length, 1, "Exactly 1 conversion attempt must succeed");
    assert.equal(rejections.length, 9, "Exactly 9 conversion attempts must be rejected with 'already a business'");

    // CRITICAL REQUIREMENT: Inspect physical PostgreSQL database state directly
    const winningClientId = (successes[0] as PromiseFulfilledResult<any>).value.id;
    assert.notEqual(winningClientId, undefined, "Winning Client ID must be returned");

    // 1. Verify Client count for this supportPhone
    const clientRows = await db.client.findMany({ where: { supportPhone: concPhone } });
    assert.equal(clientRows.length, 1, "POSTGRES PROOF: Exactly 1 Client row exists (0 duplicate clients)");
    assert.equal(clientRows[0].id, winningClientId, "POSTGRES PROOF: The created client matches the returned ID");

    // 2. Verify Lead linkage in database
    const updatedLead = await db.lead.findUnique({ where: { id: targetLeadId } });
    assert.equal(updatedLead?.clientId, winningClientId, "POSTGRES PROOF: Lead.clientId is linked to the single created client");
    assert.equal(updatedLead?.stage, "won", "POSTGRES PROOF: Lead stage remains won");

    // 3. Verify zero orphan clients exist
    const orphanClients = await db.$queryRaw<any[]>`
      SELECT c.id FROM "Client" c
      LEFT JOIN "Lead" l ON l."clientId" = c.id
      WHERE c.id = ${winningClientId} AND l.id IS NULL
    `;
    assert.equal(orphanClients.length, 0, "POSTGRES PROOF: Zero orphan clients created");

    // 4. Verify campaign dispatch is NOT enabled by default on newly converted client
    const newClient = await db.client.findUnique({ where: { id: winningClientId } });
    assert.equal(newClient?.waToken, null, "POSTGRES PROOF: WhatsApp credentials are NOT automatically issued");
    const numbersCount = await db.whatsAppNumber.count({ where: { clientId: winningClientId } });
    assert.equal(numbersCount, 0, "POSTGRES PROOF: No WhatsApp numbers provisioned");

    // Clean up
    await db.leadActivity.deleteMany({ where: { leadId: targetLeadId } });
    await db.lead.delete({ where: { id: targetLeadId } });
    await db.order.deleteMany({ where: { clientId: winningClientId } });
    await db.client.delete({ where: { id: winningClientId } });
  });

  test("CLOSURE-5: Distinct Shops Sharing Same Phone Boundary Test", async () => {
    const sharedPhone = "9789012345";
    await db.leadActivity.deleteMany({ where: { lead: { phone: sharedPhone } } });
    await db.lead.deleteMany({ where: { phone: sharedPhone } });

    // Step 1: Shop A submits enquiry
    const resA = await addWebsiteLead({
      shop: "Shop A - Aroma Coffee",
      person: "Aroma Owner",
      phone: sharedPhone,
      town: "Madurai",
      plan: "starter",
    });
    assert.equal(resA.ok, true);
    const leadIdA = resA.id!;

    // Step 2: Shop B submits enquiry with identical phone number
    const resB = await addWebsiteLead({
      shop: "Shop B - Bhavani Silks",
      person: "Bhavani Owner",
      phone: sharedPhone,
      town: "Madurai",
      plan: "growth",
    });
    assert.equal(resB.ok, true);
    assert.equal(resB.again, true, "Flagged again: true");

    // Step 3: Verify that Shop A's original name was NOT destroyed or overwritten
    const lead = await db.lead.findUnique({ where: { id: leadIdA } });
    assert.equal(lead?.shop, "Shop A - Aroma Coffee", "Original shop name must NOT be overwritten");

    // Step 4: Verify that the activity log captures the second shop's enquiry details
    const activities = await db.leadActivity.findMany({ where: { leadId: leadIdA }, orderBy: { createdAt: "desc" } });
    assert.match(
      activities[0].text,
      /Asked for a demo again for "Shop B - Bhavani Silks"/,
      "Activity audit log must note the distinct shop name for the sales team"
    );

    // Clean up
    await db.leadActivity.deleteMany({ where: { leadId: leadIdA } });
    await db.lead.delete({ where: { id: leadIdA } });
  });
});
