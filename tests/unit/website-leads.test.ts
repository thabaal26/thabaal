// Enquiries that come in by themselves (lib/leads.ts): the website's free demo form and sign-ups. One open enquiry per
// number; a sign-up joins the enquiry its number already has; a sign-up is won by itself once a payment is verified;
// recent sign-ups from before this get an enquiry, a business Thabaal added does not.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { addWebsiteLead, leadFromSignup, moveLead, syncSignupLeads, todayKey } from "../../src/lib/leads";

const admin = { isAdmin: true, id: "admin", name: "Thabaal admin" };
let seq = 0;
const phone = () => `9${String(Date.now()).slice(-7)}${String(++seq).padStart(2, "0")}`.slice(0, 10);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
async function signupBusiness(minutesToLogin = 0, daysAgo = 0) {
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  const c = await db.client.create({ data: { name: `Signup ${Date.now()} ${++seq}`, planRequired: true, homeCity: "Madurai", createdAt: at } });
  await db.user.create({ data: { clientId: c.id, role: "CLIENT", access: "MANAGER", name: "Meena", email: `signup-${Date.now()}-${seq}@example.test`, passwordHash: "x", createdAt: new Date(at.getTime() + minutesToLogin * 60_000) } });
  return c;
}
const paid = (clientId: string) =>
  db.planPurchase.create({ data: { clientId, plan: "growth", cycle: "m", amountPaise: 249_900, status: "VERIFIED", method: "ADMIN_RECORD", startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000), decidedAt: new Date(), submittedBy: "test" } });

describe("enquiries from the website and sign-ups", () => {
  test("1. the demo form adds a New enquiry from the website, to call today", async () => {
    const p = phone();
    const r = await addWebsiteLead({ shop: "Meena Oils", person: "Meena", phone: `+91 ${p}`, town: "Madurai", sells: "oils", plan: "growth" });
    assert.equal(r.ok, true);
    const l = await db.lead.findUniqueOrThrow({ where: { id: r.id! }, include: { activity: true } });
    assert.equal(l.source, "Home page form");
    assert.equal(l.stage, "new");
    assert.equal(l.phone, p);
    assert.equal(l.plan, "growth");
    assert.equal(day(l.nextOn), todayKey());
    assert.equal(l.createdBy, "Website");
    assert.match(l.activity[0].text, /free demo on the website \(sells oils, asked about growth\)/);
  });

  test("2. what's needed is checked: number, shop, name; a wrong plan is just left out", async () => {
    assert.match((await addWebsiteLead({ shop: "X Shop", person: "Ravi", phone: "12345" })).message, /10-digit/);
    assert.match((await addWebsiteLead({ shop: "", person: "Ravi", phone: phone() })).message, /shop's name/);
    assert.match((await addWebsiteLead({ shop: "X Shop", person: "", phone: phone() })).message, /your name/);
    const r = await addWebsiteLead({ shop: "X Shop", person: "Ravi", phone: phone(), plan: "gold" });
    assert.equal((await db.lead.findUniqueOrThrow({ where: { id: r.id! } })).plan, null);
  });

  test("3. asking again with the same number: no second enquiry; it comes back to today with what's new", async () => {
    const p = phone();
    const first = await addWebsiteLead({ shop: "Ravi Stores", person: "Ravi", phone: p });
    await db.lead.update({ where: { id: first.id! }, data: { nextOn: new Date(Date.now() + 5 * 86_400_000) } });
    const again = await addWebsiteLead({ shop: "Ravi Stores", person: "Ravi", phone: p, sells: "rice" });
    assert.equal(again.again, true);
    assert.equal(again.id, first.id);
    assert.equal(await db.lead.count({ where: { phone: p } }), 1);
    const l = await db.lead.findUniqueOrThrow({ where: { id: first.id! } });
    assert.equal(day(l.nextOn), todayKey());
    assert.equal(l.sells, "rice");
  });

  test("4. a sign-up with the number of an open enquiry joins it; otherwise it is a new Sign-up enquiry", async () => {
    const p = phone();
    const asked = await addWebsiteLead({ shop: "Kavi Foods", person: "Kavi", phone: p });
    const c1 = await signupBusiness();
    const joined = await leadFromSignup({ clientId: c1.id, business: c1.name, person: "Kavi", phone: p, email: "kavi@example.test", town: "Madurai" });
    assert.equal(joined.id, asked.id);
    const l1 = await db.lead.findUniqueOrThrow({ where: { id: asked.id! } });
    assert.equal(l1.clientId, c1.id);
    assert.equal(l1.email, "kavi@example.test");
    assert.equal(l1.source, "Home page form", "where it first came from stays");

    const c2 = await signupBusiness();
    const fresh = await leadFromSignup({ clientId: c2.id, business: c2.name, person: "Anu", phone: phone(), email: "anu@example.test", town: "Salem" });
    const l2 = await db.lead.findUniqueOrThrow({ where: { id: fresh.id! } });
    assert.equal(l2.source, "Sign-up");
    assert.equal(l2.clientId, c2.id);
    assert.equal(l2.stage, "new");
    assert.match(l2.note ?? "", /hasn't paid yet/);
    // The same business twice: still one enquiry.
    assert.equal((await leadFromSignup({ clientId: c2.id, business: c2.name, person: "Anu", phone: phone(), email: "anu@example.test" })).id, fresh.id);
  });

  test("5. once a payment is verified the sign-up enquiry is won by itself (a lost one too: they came back)", async () => {
    const c = await signupBusiness();
    const r = await leadFromSignup({ clientId: c.id, business: c.name, person: "Bala", phone: phone(), email: "bala@example.test" });
    const c2 = await signupBusiness();
    const r2 = await leadFromSignup({ clientId: c2.id, business: c2.name, person: "Devi", phone: phone(), email: "devi@example.test" });
    assert.equal((await moveLead(admin, r2.id!, "lost")).ok, true, "an unpaid sign-up can be marked lost");
    await syncSignupLeads();
    assert.equal((await db.lead.findUniqueOrThrow({ where: { id: r.id! } })).stage, "new", "not paid: still open");
    await paid(c.id);
    await paid(c2.id);
    await syncSignupLeads();
    for (const id of [r.id!, r2.id!]) {
      const l = await db.lead.findUniqueOrThrow({ where: { id }, include: { activity: { orderBy: { createdAt: "desc" } } } });
      assert.equal(l.stage, "won");
      assert.equal(l.nextOn, null);
      assert.match(l.activity[0].text, /Paid for the growth plan: won/);
    }
    assert.match((await moveLead(admin, r.id!, "contact")).message, /stays Won/, "a paying business stays won");
  });

  test("6. recent sign-ups from before get an enquiry; a business Thabaal added, an old one or a paid one doesn't", async () => {
    const recent = await signupBusiness(0, 3);
    const added = await signupBusiness(10); // its login made 10 minutes after the business: added by Thabaal
    const old = await signupBusiness(0, 45);
    const paidOne = await signupBusiness();
    await paid(paidOne.id);
    await syncSignupLeads();
    const l = await db.lead.findUnique({ where: { clientId: recent.id } });
    assert.ok(l, "recent sign-up added");
    assert.equal(l!.source, "Sign-up");
    assert.equal(l!.phone, "");
    assert.match(l!.email ?? "", /@example.test/);
    assert.equal(l!.createdAt.toISOString().slice(0, 10), recent.createdAt.toISOString().slice(0, 10), "came in when they signed up");
    for (const c of [added, old, paidOne]) assert.equal(await db.lead.findUnique({ where: { clientId: c.id } }), null);
    await syncSignupLeads();
    assert.equal(await db.lead.count({ where: { clientId: recent.id } }), 1, "running again adds nothing");
  });
});
