// One person, several WhatsApp numbers (lib/phone.ts readPhones, lib/linked-numbers.ts): every number written for a
// person is read, saved as its own customer and linked; a campaign sends to each number; adding or leaving out one
// number in a campaign does the same to the person's other numbers. Meta is a fake.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { campaignAudienceWhere } from "../../src/lib/audiences";
import { db } from "../../src/lib/db";
import { runDueCampaigns } from "../../src/lib/dispatcher";
import { linkCustomers, numbersNote, otherNumbers, setOtherNumbers, unlinkCustomer, withSamePerson } from "../../src/lib/linked-numbers";
import { formatPhone, readPhones } from "../../src/lib/phone";

const FAR = new Date("2099-04-01T04:30:00Z");

describe("linked numbers: reading what was written", () => {
  test("1. two numbers however they're written; repeats once; unreadable parts reported", () => {
    const both = ["919865310945", "919080553061"];
    for (const raw of [
      "9865310945 / 9080553061",
      "98653 10945 / 90805 53061",
      "9865310945, 9080553061",
      "9865310945 or 9080553061",
      "9865310945\n9080553061",
      "+91 98653 10945; 090805 53061",
      "9865310945 9080553061",
      "98653109459080553061",
      "919865310945919080553061",
      "9865310945 / 9865310945 / 9080553061",
    ])
      assert.deepEqual(readPhones(raw), { phones: both, bad: [] }, raw);
    assert.deepEqual(readPhones("9865310945"), { phones: ["919865310945"], bad: [] });
    assert.deepEqual(readPhones("98653 / 9080553061"), { phones: ["919080553061"], bad: ["98653"] });
    assert.deepEqual(readPhones(""), { phones: [], bad: [] });
    assert.deepEqual(readPhones(null), { phones: [], bad: [] });
  });
});

describe("linked numbers: saving and campaigns", () => {
  let clientId: string;
  let templateId: string;
  const realFetch = globalThis.fetch;
  const sentTo: string[] = [];
  const P = `9166${String(Date.now()).slice(-6)}`;
  const ids: Record<string, string> = {};

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (String(url).endsWith("/messages") && body.to) sentTo.push(body.to);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.linked${sentTo.length}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    clientId = (await db.client.create({ data: { name: `QA Linked ${Date.now()}`, orderPrefix: "QL", quietFrom: null, quietTo: null, marketingGapHours: 0 } })).id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: `qa-linked-${Date.now()}`, businessAccountId: "qa-linked-waba", token: "qa-fake-token", isDefault: true, messagingTier: "TIER_1K" } });
    for (const [k, i] of [["jeeva", 1], ["kala", 2], ["mani", 3]] as const)
      ids[k] = (await db.customer.create({ data: { clientId, phone: `${P}${i}`, name: k, location: "Ring Road", region: "Madurai city", purchases: "Gingelly oil", tags: ["ghee", "loyalty-bonus:50"], optInSource: "Bought from us" } })).id;
    templateId = (await db.template.create({ data: { clientId, businessAccountId: "qa-linked-waba", name: "qa_linked_offer", category: "MARKETING", status: "APPROVED", language: "en", body: "Offer" } })).id;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.message.deleteMany({ where: { customer: { clientId } } });
    await db.campaignRun.deleteMany({ where: { campaign: { clientId } } });
    await db.campaign.deleteMany({ where: { clientId } });
    await db.template.deleteMany({ where: { clientId } });
    await db.customer.deleteMany({ where: { clientId } });
    await db.whatsAppNumber.deleteMany({ where: { clientId } });
    await db.client.delete({ where: { id: clientId } });
  });

  const person = (id: string) => db.customer.findUniqueOrThrow({ where: { id } });

  test("2. a new other number is saved with the person's details (not their points) and linked; an old one is linked as it is", async () => {
    const r = await setOtherNumbers(clientId, ids.jeeva, [`${P}4`, `${P}2`, `${P}1`]);
    assert.deepEqual(r.added, [`${P}4`]);
    assert.deepEqual(r.joined, [{ name: "kala", phone: `${P}2` }], "kala's number was already saved: linked, name kept");
    assert.deepEqual(r.removed, []);
    const fresh = await db.customer.findUniqueOrThrow({ where: { clientId_phone: { clientId, phone: `${P}4` } } });
    ids.second = fresh.id;
    assert.equal(fresh.name, "jeeva");
    assert.equal(fresh.location, "Ring Road");
    assert.equal(fresh.purchases, "Gingelly oil");
    assert.deepEqual(fresh.tags, ["ghee"], "groups carry over, earned points don't");
    assert.equal(fresh.optInSource, "Bought from us");
    const j = await person(ids.jeeva);
    assert.ok(j.personId);
    assert.equal(fresh.personId, j.personId);
    assert.equal((await person(ids.kala)).personId, j.personId);
    assert.equal((await person(ids.kala)).name, "kala");
    assert.deepEqual((await otherNumbers(clientId, j)).map((o) => o.phone).sort(), [`${P}2`, `${P}4`]);
    assert.match(numbersNote(r, formatPhone), /added \+\d+.*linked \+\d+ \(saved as kala\)/);
    // Saving the same list again changes nothing.
    const again = await setOtherNumbers(clientId, ids.jeeva, [`${P}4`, `${P}2`]);
    assert.deepEqual(again, { added: [], joined: [], removed: [] });
    assert.equal(numbersNote(again, formatPhone), "");
  });

  test("3. a number taken off the list is unlinked but kept; a person left with one number is single again", async () => {
    const r = await setOtherNumbers(clientId, ids.jeeva, [`${P}4`]);
    assert.deepEqual(r.removed, [`${P}2`]);
    assert.equal((await person(ids.kala)).personId, null);
    assert.ok(await db.customer.findUnique({ where: { id: ids.kala } }), "kala's row stays");
    await unlinkCustomer(clientId, ids.second);
    assert.equal((await person(ids.jeeva)).personId, null, "only jeeva's own number is left: single again");
    assert.equal((await person(ids.second)).personId, null);
  });

  test("4. linking joins whole people: two linked pairs become one person", async () => {
    await linkCustomers(clientId, [ids.jeeva, ids.second]);
    await linkCustomers(clientId, [ids.kala, ids.mani]);
    await linkCustomers(clientId, [ids.second, ids.mani]);
    const all = await db.customer.findMany({ where: { id: { in: [ids.jeeva, ids.second, ids.kala, ids.mani] } }, select: { personId: true } });
    assert.equal(new Set(all.map((c) => c.personId)).size, 1);
    assert.deepEqual((await withSamePerson(clientId, [ids.jeeva])).sort(), [ids.jeeva, ids.second, ids.kala, ids.mani].sort());
    assert.equal(await linkCustomers(clientId, [ids.jeeva]), null, "one row alone is not linked");
    // Back to the person of tests 5–6: jeeva with two numbers; kala and mani single.
    await unlinkCustomer(clientId, ids.kala);
    await unlinkCustomer(clientId, ids.mani);
  });

  test("5. adding or leaving out one number in a campaign does it for every number of that person", async () => {
    const reach = async (tag: string | null, people = {}) =>
      (await db.customer.findMany({ where: await campaignAudienceWhere(clientId, tag, people), select: { id: true } })).map((c) => c.id).sort();
    assert.deepEqual(await reach("nobody-has-this", { includeIds: [ids.jeeva] }), [ids.jeeva, ids.second].sort());
    assert.deepEqual(await reach(null, { excludeIds: [ids.second] }), [ids.kala, ids.mani].sort());
    assert.deepEqual(await reach(null, { excludeIds: [ids.kala] }), [ids.jeeva, ids.second, ids.mani].sort(), "a single number leaves alone");
  });

  test("6. a campaign sends to each of the person's numbers; one number that can't receive doesn't stop the other", async () => {
    await db.customer.update({ where: { id: ids.mani }, data: { unreachable: true } });
    const c = await db.campaign.create({ data: { clientId, name: "linked", templateId, scheduleType: "ONCE", runAt: FAR, nextRunAt: FAR, active: true, batchSize: 50, intervalMinutes: 10 } });
    await runDueCampaigns(new Date(FAR.getTime() + 60_000), undefined, [clientId]);
    const msgs = await db.message.findMany({ where: { run: { campaignId: c.id } }, select: { customerId: true, status: true } });
    const sent = new Set(msgs.filter((m) => m.status === "SENT").map((m) => m.customerId));
    assert.ok(sent.has(ids.jeeva) && sent.has(ids.second), "both of jeeva's numbers got the offer");
    assert.ok(sentTo.includes(`${P}1`) && sentTo.includes(`${P}4`));
    assert.ok(!sentTo.includes(`${P}3`), "the unreachable number is never sent");
  });
});
