// Enquiries (lib/leads.ts, lib/lead-stages.ts): only admins change them, the stages and follow-ups follow the rules,
// every change is in the history, and a won enquiry becomes exactly one business.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { db } from "../../src/lib/db";
import { cleanPhone, daysTo, furthest, leadFunnel } from "../../src/lib/lead-stages";
import { addLead, convertLead, logCall, moveLead, setNextFollowUp, updateLead, type LeadActor } from "../../src/lib/leads";

const NOW = fromZonedTime("2026-11-02T10:00:00", "Asia/Kolkata");
let seq = 0;
const phone = () => `9${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
let admin: LeadActor;
const shop: LeadActor = { isAdmin: false, id: "x", name: "Shop owner" };

async function newAdmin(name: string) {
  const u = await db.user.create({ data: { email: `lead-admin-${Date.now()}-${++seq}@example.test`, name, passwordHash: "x", role: "ADMIN" } });
  return { isAdmin: true, id: u.id, name };
}
async function lead(extra: Partial<Parameters<typeof addLead>[1]> = {}) {
  admin ??= await newAdmin("Madhumita G");
  const r = await addLead(admin, { shop: `Lead shop ${Date.now()} ${++seq}`, phone: phone(), source: "Walk-in", plan: "growth", ownerId: admin.id, town: "Madurai", ...extra }, NOW);
  assert.equal(r.ok, true, r.message);
  return db.lead.findUniqueOrThrow({ where: { id: r.id! }, include: { activity: true } });
}

describe("enquiry rules", () => {
  test("1. phone numbers, days and the funnel", () => {
    assert.equal(cleanPhone("+91 98420 11223"), "9842011223");
    assert.equal(cleanPhone("09842011223"), "9842011223");
    assert.equal(cleanPhone("12345"), null);
    assert.equal(cleanPhone("5842011223"), null, "Indian mobiles start 6-9");
    assert.equal(daysTo("2026-11-01", "2026-11-02"), -1);
    assert.equal(daysTo("2026-11-02", "2026-11-02"), 0);
    assert.equal(daysTo(null, "2026-11-02"), null);
    assert.equal(furthest("demo", "lost"), "demo", "lost keeps how far it got");
    assert.equal(furthest("demo", "contact"), "demo");
    assert.equal(furthest("contact", "quote"), "quote");
    const f = leadFunnel([{ reached: "new" }, { reached: "contact" }, { reached: "demo" }, { reached: "won" }]);
    assert.deepEqual(f.steps.map((s) => s[1]), [4, 3, 2, 1, 1]);
    assert.deepEqual(f.widest, ["reaching them", 1]);
  });
});

describe("enquiries in the database", () => {
  test("2. only an admin adds one; it waits in New enquiry for a call today; one open enquiry per number", async () => {
    assert.equal((await addLead(shop, { shop: "X", phone: phone(), source: "Walk-in" }, NOW)).ok, false);
    const l = await lead();
    assert.equal(l.stage, "new");
    assert.equal(l.nextOn?.toISOString().slice(0, 10), "2026-11-02");
    assert.equal(l.activity.length, 1);
    assert.equal((await addLead(admin, { shop: "Bad", phone: "123", source: "Walk-in" }, NOW)).ok, false, "bad phone");
    assert.equal((await addLead(admin, { shop: "Bad", phone: phone(), source: "Billboard" }, NOW)).ok, false, "unknown source");
    const again = await addLead(admin, { shop: "Same number", phone: `+91 ${l.phone}`, source: "Referral" }, NOW);
    assert.equal(again.ok, false);
    assert.match(again.message, /already has an open enquiry/);
  });

  test("3. only an admin can follow up an enquiry", async () => {
    const c = await db.client.create({ data: { name: `Lead owner shop ${Date.now()}` } });
    const staff = await db.user.create({ data: { email: `lead-staff-${Date.now()}@example.test`, name: "Shop staff", passwordHash: "x", role: "CLIENT", clientId: c.id } });
    const l = await lead();
    const r = await updateLead(admin, l.id, { shop: l.shop, phone: l.phone, source: l.source, ownerId: staff.id });
    assert.equal(r.ok, false);
    const other = await newAdmin("Nishok");
    const ok = await updateLead(admin, l.id, { shop: l.shop, phone: l.phone, source: l.source, plan: "business", ownerId: other.id });
    assert.equal(ok.ok, true, ok.message);
    const after = await db.lead.findUniqueOrThrow({ where: { id: l.id }, include: { activity: { orderBy: { createdAt: "desc" } } } });
    assert.equal(after.ownerId, other.id);
    assert.equal(after.plan, "business");
    assert.match(after.activity[0].text, /Nishok follows up/);
  });

  test("4. a call moves New to Contacted; follow-ups must be today or later; closed enquiries have none", async () => {
    const l = await lead();
    assert.equal((await logCall(admin, l.id, { text: "" }, NOW)).ok, false);
    assert.equal((await logCall(admin, l.id, { text: "Called", nextOn: "2026-11-01" }, NOW)).ok, false, "past day");
    const r = await logCall(admin, l.id, { text: "Wants a demo on Friday", nextOn: "2026-11-06" }, NOW);
    assert.equal(r.ok, true, r.message);
    let row = await db.lead.findUniqueOrThrow({ where: { id: l.id }, include: { activity: true } });
    assert.equal(row.stage, "contact");
    assert.equal(row.reached, "contact");
    assert.equal(row.nextOn?.toISOString().slice(0, 10), "2026-11-06");
    assert.deepEqual(row.activity.map((a) => a.kind).sort(), ["call", "created", "next", "stage"]);

    assert.equal((await moveLead(admin, l.id, "demo", NOW)).ok, true);
    assert.equal((await moveLead(admin, l.id, "lost", NOW)).ok, true);
    row = await db.lead.findUniqueOrThrow({ where: { id: l.id }, include: { activity: true } });
    assert.equal(row.stage, "lost");
    assert.equal(row.reached, "demo", "the funnel still counts the demo");
    assert.equal(row.nextOn, null);
    assert.ok(row.closedAt);
    assert.equal((await setNextFollowUp(admin, l.id, "2026-11-10", NOW)).ok, false, "closed");
    assert.equal((await moveLead(admin, l.id, "contact", NOW)).ok, true, "re-opened");
    row = await db.lead.findUniqueOrThrow({ where: { id: l.id }, include: { activity: true } });
    assert.equal(row.nextOn?.toISOString().slice(0, 10), "2026-11-02", "re-opened: follow up today");
    assert.equal(row.closedAt, null);
  });

  test("5. a won enquiry becomes exactly one business, with its phone; then it stays won", async () => {
    const l = await lead({ town: "Sivakasi" });
    assert.equal((await convertLead(admin, l.id, { name: l.shop, city: "Sivakasi" }, NOW)).ok, false, "not won yet");
    assert.equal((await moveLead(admin, l.id, "won", NOW)).ok, true);
    assert.equal((await convertLead(shop, l.id, { name: l.shop, city: "Sivakasi" }, NOW)).ok, false, "not an admin");
    assert.equal((await convertLead(admin, l.id, { name: l.shop, city: "123" }, NOW)).ok, false, "bad city");
    const r = await convertLead(admin, l.id, { name: l.shop, city: "Sivakasi", businessType: "retail" }, NOW);
    assert.equal(r.ok, true, r.message);
    const c = await db.client.findUniqueOrThrow({ where: { id: r.id! } });
    assert.equal(c.name, l.shop);
    assert.equal(c.homeCity, "Sivakasi");
    assert.equal(c.supportPhone, l.phone);
    assert.equal(c.planRequired, true);
    assert.equal(c.businessType, "retail");
    const row = await db.lead.findUniqueOrThrow({ where: { id: l.id }, include: { activity: true } });
    assert.equal(row.clientId, c.id);
    assert.ok(row.activity.some((a) => a.kind === "converted"));
    const twice = await convertLead(admin, l.id, { name: `${l.shop} 2`, city: "Sivakasi" }, NOW);
    assert.equal(twice.ok, false);
    assert.equal(await db.client.count({ where: { name: { startsWith: l.shop } } }), 1);
    assert.equal((await moveLead(admin, l.id, "lost", NOW)).ok, false, "a business stays won");

    const other = await lead();
    await moveLead(admin, other.id, "won", NOW);
    assert.equal((await convertLead(admin, other.id, { name: l.shop, city: "Madurai" }, NOW)).ok, false, "name taken");
  });
});
