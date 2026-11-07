// Speed pass of 7 Nov 2026: reads merged into fewer queries must give the same answers as before. Meta's limit counts
// (all numbers and each number, 1/7/30 days, open service windows skipped), the plan state read with the login, the
// staff-typing quiet time and one person's other numbers. Meta is never called: fetch is a fake that fails.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { inPool } from "../../src/lib/dispatcher";
import { chatAutomation } from "../../src/lib/engine/conversation";
import { allowance, estimateTier, numberHealth, numberHealthAndTier } from "../../src/lib/limits";
import { withSamePerson } from "../../src/lib/linked-numbers";
import { accessFrom, ACCESS_SELECT, clientAccess, clientAccessNow } from "../../src/lib/plan-access";

const realFetch = globalThis.fetch;
const H = 3_600_000;
const D = 24 * H;
let clientId = "";
let capped = "";
let open = "";
const people: string[] = [];

describe("speed: merged reads give the same answers", () => {
  before(async () => {
    globalThis.fetch = (async () => {
      throw new Error("Meta must not be called");
    }) as typeof fetch;
    const stamp = String(Date.now()).slice(-7);
    const c = await db.client.create({ data: { name: `Speed Reads ${stamp}`, staffPauseMinutes: 120 } });
    clientId = c.id;
    const now = new Date();
    capped = (await db.whatsAppNumber.create({ data: { clientId, label: "Capped", phoneNumberId: `speed-a-${stamp}`, businessAccountId: "speed-waba", isDefault: true, dailyCap: 5, messagingTier: "TIER_2K", qualityRating: "GREEN", statusCheckedAt: now } })).id;
    open = (await db.whatsAppNumber.create({ data: { clientId, label: "Open", phoneNumberId: `speed-b-${stamp}`, businessAccountId: "speed-waba", messagingTier: "TIER_2K", qualityRating: "GREEN", statusCheckedAt: now } })).id;
    for (let k = 0; k < 5; k++) people.push((await db.customer.create({ data: { clientId, name: `Speed ${k}`, phone: `9193${stamp}${k}` } })).id);
    const [c0, c1, c2, c3, c4] = people;
    const ago = (ms: number) => new Date(Date.now() - ms);
    // c4 wrote 2 hours before our message: an open service window, never counted.
    await db.reply.create({ data: { customerId: c4, text: "Hi", kind: "text", receivedAt: ago(3 * H) } });
    await db.message.createMany({
      data: [
        { customerId: c0, templateName: "t", status: "SENT", senderId: capped, sentAt: ago(H) },
        { customerId: c1, templateName: "t", status: "DELIVERED", senderId: open, sentAt: ago(2 * H) },
        { customerId: c2, templateName: "t", status: "DELIVERED", senderId: open, sentAt: ago(3 * D) },
        { customerId: c3, templateName: "t", status: "READ", senderId: capped, sentAt: ago(20 * D) },
        { customerId: c4, templateName: "t", status: "DELIVERED", senderId: open, sentAt: ago(H) },
        { customerId: c3, templateName: "t", status: "FAILED", senderId: open, sentAt: ago(H) },
        { customerId: c2, templateName: "t", status: "READ", senderId: open, sentAt: ago(40 * D) },
      ],
    });
  });
  after(async () => {
    globalThis.fetch = realFetch;
    await db.client.delete({ where: { id: clientId } }).catch(() => {});
  });

  test("1. each number's 24-hour count: the capped one counts its own sends, the other the whole business's", async () => {
    const health = await numberHealth(clientId);
    const a = health.find((h) => h.id === capped)!;
    const b = health.find((h) => h.id === open)!;
    assert.equal(health[0].id, capped, "the default number first");
    assert.equal(a.used, 1);
    assert.equal(a.limit, 5);
    assert.equal(a.left, 4);
    assert.equal(b.used, 2, "c0 and c1; c4 wrote first, c3's failed send doesn't count");
    assert.equal(b.limit, 2_000);
    assert.equal(b.left, 1_998);
    assert.equal("client" in a, false, "no token-bearing client row in the result");
  });

  test("2. the next tier's counts: delivered or read in 7 and 30 days", async () => {
    const e = await estimateTier(clientId);
    assert.equal(e?.week, 2, "c1 and c2");
    assert.equal(e?.month, 3, "c1, c2 and c3");
    assert.equal(e?.tier, "TIER_2K");
    const both = await numberHealthAndTier(clientId);
    assert.deepEqual(both.est, e);
    assert.deepEqual(both.health.map((h) => [h.id, h.used, h.left]), (await numberHealth(clientId)).map((h) => [h.id, h.used, h.left]));
  });

  test("3. allowance: one query, same figures; Meta's limit never holds sends back", async () => {
    const n = await db.whatsAppNumber.findUniqueOrThrow({ where: { id: capped } });
    assert.deepEqual(await allowance(n), { left: 4, clientUsed: 2, numberUsed: 1, unlimited: false });
    const o = await db.whatsAppNumber.findUniqueOrThrow({ where: { id: open } });
    assert.deepEqual(await allowance(o), { left: Infinity, clientUsed: 2, numberUsed: 0, unlimited: true });
  });

  test("4. plan state read with the login matches the separate read", async () => {
    await db.planPurchase.createMany({
      data: [
        { clientId, plan: "starter", cycle: "m", amountPaise: 100, status: "VERIFIED", startsAt: new Date(Date.now() - 5 * D), endsAt: new Date(Date.now() + 25 * D) },
        { clientId, plan: "growth", cycle: "q", amountPaise: 200, status: "PENDING", utr: "123456789012" },
        { clientId, plan: "growth", cycle: "q", amountPaise: 200, status: "REJECTED" },
      ],
    });
    const joined = await db.client.findUniqueOrThrow({ where: { id: clientId }, select: ACCESS_SELECT });
    const now = new Date();
    assert.deepEqual(accessFrom(joined, now), await clientAccess(clientId, now));
    assert.equal((await clientAccessNow(clientId)).pending?.utr, "123456789012");
  });

  test("5. staff typing: quiet for the business's minutes after their newest message, and resume ends it", async () => {
    const c = people[0];
    assert.equal((await chatAutomation(c)).paused, false);
    await db.message.create({ data: { customerId: c, templateName: "Typed reply", status: "SENT", createdAt: new Date(Date.now() - 3 * H) } });
    assert.equal((await chatAutomation(c)).paused, false, "older than 2 hours");
    const typed = await db.message.create({ data: { customerId: c, templateName: "Media reply", status: "SENT", createdAt: new Date(Date.now() - 10 * 60_000) } });
    const quiet = await chatAutomation(c);
    assert.equal(quiet.reason, "staff-typing");
    assert.equal(quiet.until?.getTime(), typed.createdAt.getTime() + 120 * 60_000);
    await db.conversation.create({ data: { clientId, customerId: c, resumedAt: new Date() } });
    assert.equal((await chatAutomation(c)).paused, false, "resumed after the typed message");
    await db.conversation.update({ where: { customerId: c }, data: { pausedUntil: new Date(Date.now() + H), pausedBy: "Staff" } });
    assert.equal((await chatAutomation(c)).reason, "paused");
  });

  test("7. campaign sends: up to N at once, a new one starts as soon as one ends, a stop ends the batch", async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let running = 0;
    let most = 0;
    const done: number[] = [];
    // One slow item must not hold the others back: the 9 quick ones finish while it runs.
    await inPool([200, 5, 5, 5, 5, 5, 5, 5, 5, 5], 3, async (ms) => {
      running++;
      most = Math.max(most, running);
      await wait(ms);
      done.push(ms);
      running--;
    });
    assert.equal(most, 3, "never more than 3 at once");
    assert.equal(done.length, 10, "every item once");
    assert.equal(done.at(-1), 200, "the slow one ends last; the others didn't wait for it");
    const started: number[] = [];
    await inPool([1, 2, 3, 4, 5, 6, 7, 8], 2, async (n) => {
      started.push(n);
      await wait(2);
      return n === 3 ? false : undefined;
    });
    assert.ok(!started.includes(6) && !started.includes(7) && !started.includes(8), `nothing new after a stop (started ${started})`);
    let calls = 0;
    await inPool([], 10, async () => void calls++);
    assert.equal(calls, 0);
  });

  test("6. one person's other numbers in one query", async () => {
    const [a, b, c] = people;
    assert.deepEqual(await withSamePerson(clientId, []), []);
    assert.deepEqual(await withSamePerson(clientId, [a, a]), [a]);
    await db.customer.updateMany({ where: { id: { in: [a, b] } }, data: { personId: `speed-person-${a}` } });
    assert.deepEqual((await withSamePerson(clientId, [a])).sort(), [a, b].sort());
    assert.deepEqual((await withSamePerson(clientId, [a, c])).sort(), [a, b, c].sort());
  });
});
