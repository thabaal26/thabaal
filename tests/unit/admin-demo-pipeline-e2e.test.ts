import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import { addWebsiteLead, convertLead, loadLead, loadLeads, logCall, moveLead } from "../../src/lib/leads";
import { requestDemo } from "../../src/app/login/demo-actions";

describe("ADMIN-DEMO-PIPELINE: Master 'Book a Demo' & Lead-to-Client End-to-End Test Suite", () => {
  const adminActor = {
    id: "usr_admin_qa_123",
    isAdmin: true,
    name: "Master Admin QA",
  };

  const nonAdminActor = {
    id: "usr_staff_qa_456",
    isAdmin: false,
    name: "Unauthorized Staff",
  };

  const testPhone = "9876543210";
  const testShop = "THABAAL_QA_ORGANIC_OILS";
  const testPerson = "Ramanathan QA";

  test("Phase A1: Honeypot Protection — Robot submission with hidden 'website' field is silently discarded", async () => {
    const formData = new FormData();
    formData.append("shop", "Spam Bot Shop");
    formData.append("person", "Spam Bot");
    formData.append("phone", "9112345678");
    formData.append("website", "https://spam-phishing-trap.com"); // Honeypot trap!

    const res = await requestDemo(undefined, formData);
    assert.equal(res?.ok, true, "Honeypot returns benign ok to fool spammer");

    // Assert that no lead was actually created in database
    const spamLead = await db.lead.findFirst({ where: { phone: "9112345678" } });
    assert.equal(spamLead, null, "Honeypot submission must never create a Lead in database");
  });

  test("Phase A2: Form Validation — Missing or invalid phone number is rejected", async () => {
    const formData = new FormData();
    formData.append("shop", "Invalid Shop");
    formData.append("person", "Test Person");
    formData.append("phone", "123"); // Invalid < 10 digits

    const res = await requestDemo(undefined, formData);
    assert.match(res?.error ?? "", /WhatsApp number/);
  });

  test("Phase B: Database Persistence — Valid submission creates exactly 1 Lead record", async () => {
    // Clean up any pre-existing test lead
    await db.leadActivity.deleteMany({ where: { lead: { phone: testPhone } } });
    await db.lead.deleteMany({ where: { phone: testPhone } });

    const formData = new FormData();
    formData.append("shop", testShop);
    formData.append("person", testPerson);
    formData.append("phone", testPhone);
    formData.append("town", "Madurai");
    formData.append("sells", "Cold-Pressed Sesame & Groundnut Oil");
    formData.append("plan", "starter");

    const res = await requestDemo(undefined, formData);
    assert.equal(res?.ok, true);

    const lead = await db.lead.findFirst({
      where: { phone: testPhone },
      include: { activity: true },
    });

    assert.ok(lead, "Lead must exist in PostgreSQL database");
    assert.equal(lead.shop, testShop);
    assert.equal(lead.person, testPerson);
    assert.equal(lead.phone, testPhone);
    assert.equal(lead.stage, "new");
    assert.equal(lead.source, "Home page form");
    assert.equal(lead.plan, "starter");
    assert.equal(lead.town, "Madurai");
    assert.equal(lead.clientId, null, "Newly submitted lead has no linked client");
    assert.ok(lead.activity.length >= 1, "Creation activity must be recorded");
  });

  test("Phase B2: Re-submission Idempotency — Asking again updates existing lead without duplicate creation", async () => {
    const formData = new FormData();
    formData.append("shop", testShop);
    formData.append("person", testPerson);
    formData.append("phone", testPhone);
    formData.append("town", "Madurai City");

    const res = await requestDemo(undefined, formData);
    assert.equal(res?.again, true, "Subsequent submission must recognize existing open enquiry");

    const allLeadsForPhone = await db.lead.findMany({ where: { phone: testPhone } });
    assert.equal(allLeadsForPhone.length, 1, "Exactly one lead record must exist (no duplicates)");
  });

  test("Phase C: Admin Enquiry Reflection — Lead is visible in Admin Enquiries listing & detail", async () => {
    const { leads } = await loadLeads();
    const found = leads.find((l) => l.phone === testPhone);
    assert.ok(found, "Newly submitted lead must appear in loadLeads() Admin query");
    assert.equal(found.shop, testShop);
    assert.equal(found.stage, "new");

    const fullDetail = await loadLead(found.id);
    assert.ok(fullDetail, "Full lead detail must be retrievable by ID");
    assert.equal(fullDetail.id, found.id);
    assert.ok(fullDetail.activity.length >= 1, "Activities timeline must load");
  });

  test("Phase E: Pipeline Stage Progression — Stage transitions & call logs", async () => {
    const lead = await db.lead.findFirst({ where: { phone: testPhone } });
    assert.ok(lead);

    // 1. Move to Contacted ("contact")
    const move1 = await moveLead(adminActor, lead.id, "contact");
    assert.equal(move1.ok, true, `Move to contact failed: ${move1.message}`);
    let updated = await db.lead.findUnique({ where: { id: lead.id } });
    assert.equal(updated?.stage, "contact");

    // 2. Log a Call
    const callRes = await logCall(adminActor, lead.id, { text: "Spoke with shop owner. Very interested in WhatsApp catalogue." });
    assert.equal(callRes.ok, true);

    // 3. Move to Demo Booked ("demo")
    const move2 = await moveLead(adminActor, lead.id, "demo");
    assert.equal(move2.ok, true);

    // 4. Move to Price Sent ("quote")
    const move3 = await moveLead(adminActor, lead.id, "quote");
    assert.equal(move3.ok, true);

    // 5. Move to Won ("won")
    const move4 = await moveLead(adminActor, lead.id, "won");
    assert.equal(move4.ok, true);
    updated = await db.lead.findUnique({ where: { id: lead.id } });
    assert.equal(updated?.stage, "won");

    // Non-admin cannot move lead
    const unauthorizedMove = await moveLead(nonAdminActor, lead.id, "lost");
    assert.equal(unauthorizedMove.ok, false);
  });

  test("Phase F: Lead-to-Client Conversion — Atomic tenant creation & duplicate prevention", async () => {
    const lead = await db.lead.findFirst({ where: { phone: testPhone, stage: "won" } });
    assert.ok(lead);

    const clientName = `THABAAL_TENANT_TEST_${Date.now()}`;

    // Clean up if duplicate exists
    await db.client.deleteMany({ where: { name: clientName } });

    // 1. Convert Lead to Client
    const convertRes = await convertLead(adminActor, lead.id, {
      name: clientName,
      city: "Madurai",
      businessType: "retail",
    });

    assert.equal(convertRes.ok, true, `Conversion must succeed: ${convertRes.message}`);
    assert.ok(convertRes.id, "Returned client ID must be valid");

    // 2. Verify Client record in PostgreSQL
    const client = await db.client.findUnique({ where: { id: convertRes.id } });
    assert.ok(client, "Created Client record must exist in PostgreSQL");
    assert.equal(client.name, clientName);
    assert.equal(client.homeCity, "Madurai");
    assert.equal(client.supportPhone, testPhone);

    // 3. Verify Lead is marked as converted and linked to Client
    const updatedLead = await db.lead.findUnique({ where: { id: lead.id } });
    assert.equal(updatedLead?.clientId, client.id, "Lead must be linked to newly created Client ID");

    // 4. Duplicate Conversion Prevention: Calling convertLead again on same lead fails safely
    const duplicateConvert = await convertLead(adminActor, lead.id, {
      name: `${clientName}_2`,
      city: "Madurai",
    });
    assert.equal(duplicateConvert.ok, false, "Second conversion must be strictly rejected");
    assert.match(duplicateConvert.message, /already a business/);

    // 5. Cleanup test records
    await db.client.delete({ where: { id: client.id } });
    await db.leadActivity.deleteMany({ where: { leadId: lead.id } });
    await db.lead.delete({ where: { id: lead.id } });
  });
});
