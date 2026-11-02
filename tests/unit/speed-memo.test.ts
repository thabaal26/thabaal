// Speed part 2: an incoming WhatsApp message reads the settings, its number and the shop's details once
// (lib/request-memo.ts), and its 24-hour window is read again after the reply is saved; the WhatsApp spend card
// (spendSummary) reads everything in one round and still works out the same balance. Meta is never called.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { SYNC_NOTE_PREFIX } from "../../src/lib/meta-balance";
import { replyContext } from "../../src/lib/payments";
import { recordReply } from "../../src/lib/replies";
import { forget, memo, withMemo } from "../../src/lib/request-memo";
import { INDIA_GST_RATE, RATES, spendSummary } from "../../src/lib/spend";

describe("request memo", () => {
  test("1. outside a scope every call reads; inside, each key is read once and scopes don't share", async () => {
    let reads = 0;
    const load = async () => ++reads;
    await memo("k", load);
    await memo("k", load);
    assert.equal(reads, 2);
    await withMemo(async () => {
      assert.deepEqual(await Promise.all([memo("k", load), memo("k", load), memo("k", load)]), [3, 3, 3]);
      assert.equal(await memo("other", load), 4);
      forget("k");
      assert.equal(await memo("k", load), 5);
    });
    await withMemo(async () => assert.equal(await memo("k", load), 6));
  });

  test("2. a failed read isn't kept: the next caller asks again", async () => {
    let tries = 0;
    await withMemo(async () => {
      await assert.rejects(memo("x", async () => (++tries, Promise.reject(new Error("down")))));
      assert.equal(await memo("x", async () => ++tries), 2);
    });
  });
});

describe("one incoming message, its reply window and the spend card", () => {
  let clientId: string;
  let customerId: string;
  const PNID = `qa-memo-${Date.now()}`;
  const phone = `9199911${String(Date.now()).slice(-5)}`;

  before(async () => {
    const client = await db.client.create({ data: { name: `QA Memo Shop ${Date.now()}`, orderPrefix: "QM" } });
    clientId = client.id;
    await db.whatsAppNumber.create({ data: { clientId, label: "Main", phoneNumberId: PNID, businessAccountId: "qa-memo-waba", isDefault: true } });
    const c = await db.customer.create({ data: { clientId, phone, name: "Memo Meena" } });
    customerId = c.id;
    // Their last message was two days ago: the 24-hour window is closed.
    await db.reply.create({ data: { customerId, text: "old", kind: "text", receivedAt: new Date(Date.now() - 48 * 3600_000) } });
  });

  after(async () => {
    await db.message.deleteMany({ where: { customerId } });
    await db.reply.deleteMany({ where: { customerId } });
    await db.customer.deleteMany({ where: { clientId } });
    await db.topUp.deleteMany({ where: { clientId } });
    await db.whatsAppNumber.deleteMany({ where: { clientId } });
    await db.client.delete({ where: { id: clientId } });
  });

  test("3. a reply saved while a message is answered opens the window for the rest of it", async () => {
    await withMemo(async () => {
      assert.equal((await replyContext({ id: customerId, clientId })).open, false);
      assert.equal((await replyContext({ id: customerId, clientId })).open, false);
      const saved = await recordReply({ phone, text: "Hi", kind: "text", phoneNumberId: PNID });
      assert.equal(saved?.id, customerId);
      const ctx = await replyContext({ id: customerId, clientId });
      assert.equal(ctx.open, true);
      assert.equal(ctx.number?.phoneNumberId, PNID);
    });
  });

  test("4. the balance: Billing Hub figure + top-ups since − charges since (with GST), all read in one go", async () => {
    const hourAgo = new Date(Date.now() - 3600_000);
    await db.topUp.create({ data: { clientId, amount: 500, note: `${SYNC_NOTE_PREFIX} Balance synced for WABA qa-memo-waba`, addedBy: "test", createdAt: hourAgo } });
    await db.topUp.create({ data: { clientId, amount: 100, note: "Added by hand", addedBy: "test" } });
    // One delivered marketing message after the sync, one before it (already in the Billing Hub figure).
    for (const at of [new Date(), new Date(hourAgo.getTime() - 60_000)])
      await db.message.create({ data: { customerId, templateName: "offer", body: "x", status: "DELIVERED", pricingCategory: "marketing", billable: true, createdAt: at } });
    const s = await spendSummary(clientId);
    const spentWithGst = Math.round(RATES.marketing * (1 + INDIA_GST_RATE) * 100) / 100;
    assert.equal(s.metaAccount.liveBalance, 500);
    assert.equal(s.prepaidFunds, 600);
    assert.deepEqual(s.balanceFrom && { synced: s.balanceFrom.synced, added: s.balanceFrom.added, spentWithGst: s.balanceFrom.spentWithGst, fromMeta: s.balanceFrom.fromMeta }, { synced: 500, added: 100, spentWithGst, fromMeta: false });
    assert.equal(s.remainingBalance, Math.round((600 - spentWithGst) * 100) / 100);
    assert.equal(s.serviceQuota.phoneCount, 1);
  });

  test("5. never synced: no balance worked out, this month's spend still counted", async () => {
    await db.topUp.deleteMany({ where: { clientId } });
    const s = await spendSummary(clientId);
    assert.equal(s.balanceFrom, null);
    assert.equal(s.remainingBalance, 0);
    assert.ok(s.totalMonthSpent >= RATES.marketing);
  });
});
