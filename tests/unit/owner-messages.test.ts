// Messages to business owners (lib/owner-messages*.ts): who gets what, payment reminders never go to shops on
// auto-pay, placeholders, quiet hours, sending once, WhatsApp statuses and automatic reminders.
// Nothing reaches WhatsApp in tests (no number is set up), so sends are marked simulated. Dates are in 2034.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { db } from "../../src/lib/db";
import {
  fillFor,
  nextAllowed,
  pickAudience,
  readOwnerSettings,
  unknownPlaceholders,
  wrapped,
  DEFAULT_OWNER_SETTINGS,
  type OwnerTarget,
} from "../../src/lib/owner-messages-core";
import { applyOwnerStatus, cancelOwnerMessage, createOwnerMessage, processOwnerMessages, queueAutoReminders, saveOwnerSettings } from "../../src/lib/owner-messages";

const TZ = "Asia/Kolkata";
const ist = (s: string) => fromZonedTime(s, TZ);
const admin = { isAdmin: true, name: "Stephan" };
const shop = (o: Partial<OwnerTarget>): OwnerTarget => ({
  id: "x",
  name: "Ganesh Oils",
  owner: "Ganesan",
  phone: "919842011223",
  planName: "Growth",
  amount: 2999,
  date: "12 Mar 2034",
  state: "due",
  autoPay: "none",
  atRisk: false,
  nearLimit: false,
  quiet: false,
  ...o,
});

describe("message rules", () => {
  test("1. placeholders are filled per shop, on one line; unknown ones are caught", () => {
    const s = shop({});
    assert.equal(fillFor("Hi {owner},\n{shop} pays {amount} for {plan} by {date}.", s), "Hi Ganesan, Ganesh Oils pays ₹2,999 for Growth by 12 Mar 2034.");
    assert.equal(fillFor("{owner} {amount} {date}", shop({ owner: null, amount: 0, date: null })), "there your plan amount the end of your plan");
    assert.deepEqual(unknownPlaceholders("Hi {owner} {shopname} {}"), ["shopname", ""]);
    assert.match(wrapped("rem", "Ganesan", "Pay now."), /^Hello Ganesan, here is an update about your thabaal account\.\n\nPay now\./);
  });

  test("2. payment messages never go to a shop on auto-pay, whoever is picked; no number means left out", () => {
    const on = shop({ id: "on", autoPay: "on" });
    const off = shop({ id: "off", autoPay: "none" });
    const nophone = shop({ id: "np", phone: null });
    const r = pickAudience("rem", "all", [on, off, nophone]);
    assert.deepEqual(r.to.map((s) => s.id), ["off"]);
    assert.deepEqual(r.left.map((l) => [l.shop.id, l.why]), [["on", "on auto-pay"], ["np", "no WhatsApp number on record"]]);
    assert.deepEqual(pickAudience("over", "pick", [on, off], ["on"]).to, [], "even when picked by hand");
    const noPlan = shop({ id: "new", planName: null, amount: 0, date: null });
    assert.deepEqual(pickAudience("rem", "pick", [noPlan], ["new"]).left.map((l) => l.why), ["no plan to pay for yet"]);
    assert.deepEqual(pickAudience("news", "pick", [noPlan], ["new"]).to.map((s) => s.id), ["new"]);
    assert.deepEqual(pickAudience("news", "pick", [on, off], ["on"]).to.map((s) => s.id), ["on"], "news is fine for auto-pay shops");
  });

  test("3. 'the right shops' per kind", () => {
    const shops = [shop({ id: "due" }), shop({ id: "late", state: "overdue" }), shop({ id: "lock", state: "locked" }), shop({ id: "big", state: "ok", nearLimit: true }), shop({ id: "q", state: "ok", quiet: true })];
    const ids = (k: Parameters<typeof pickAudience>[0]) => pickAudience(k, "auto", shops).to.map((s) => s.id);
    assert.deepEqual(ids("rem"), ["due"]);
    assert.deepEqual(ids("over"), ["late", "lock"]);
    assert.deepEqual(ids("up"), ["big"]);
    assert.deepEqual(ids("win"), ["q"]);
    assert.equal(ids("news").length, 5);
  });

  test("4. quiet hours: before them waits for the start, inside goes now, after waits for tomorrow, Sundays skipped", () => {
    const s = DEFAULT_OWNER_SETTINGS; // 09:00–20:00, no Sundays
    assert.equal(nextAllowed(ist("2034-03-07T07:30:00"), s, TZ).toISOString(), ist("2034-03-07T09:00:00").toISOString());
    const inside = ist("2034-03-07T11:15:00");
    assert.equal(nextAllowed(inside, s, TZ).getTime(), inside.getTime());
    assert.equal(nextAllowed(ist("2034-03-07T21:00:00"), s, TZ).toISOString(), ist("2034-03-08T09:00:00").toISOString());
    assert.equal(nextAllowed(ist("2034-03-04T21:00:00"), s, TZ).toISOString(), ist("2034-03-06T09:00:00").toISOString(), "Saturday night → Monday");
    assert.equal(nextAllowed(ist("2034-03-05T12:00:00"), { ...s, skipSundays: false }, TZ).toISOString(), ist("2034-03-05T12:00:00").toISOString());
    assert.deepEqual(readOwnerSettings({ quietFrom: "21:00", quietTo: "08:00" }).quietFrom, "09:00", "a backwards window falls back");
  });
});

let seq = 0;
async function business(tag: string, endsAt: Date, autoPay = false) {
  const c = await db.client.create({ data: { name: `Owner msg ${tag} ${Date.now()} ${++seq}`, planRequired: true, supportPhone: `98420${String(Date.now()).slice(-4)}${seq}`.slice(0, 10) } });
  await db.user.create({ data: { email: `owner-${Date.now()}-${seq}@example.test`, name: `Owner ${tag}`, passwordHash: "x", role: "CLIENT", access: "MANAGER", clientId: c.id } });
  const start = new Date(endsAt.getTime() - 30 * 86_400_000);
  await db.planPurchase.create({ data: { clientId: c.id, plan: "growth", cycle: "m", amountPaise: 299_900, status: "VERIFIED", method: "ADMIN_RECORD", startsAt: start, endsAt, decidedAt: start, submittedBy: "test" } });
  if (autoPay)
    await db.razorpayRecord.create({ data: { kind: "subscription", rzpId: `sub_test_${Date.now()}_${seq}`, purpose: "plan", clientId: c.id, plan: "growth", cycle: "m", amountPaise: 299_900, status: "active", createdBy: "test" } });
  return c;
}

describe("sending to owners", () => {
  const NOW = ist("2034-03-07T11:00:00"); // a Tuesday, inside quiet hours

  test("5. only an admin sends; a typo'd placeholder or empty text is refused", async () => {
    const c = await business("refuse", ist("2034-03-09T00:00:00"));
    const base = { kind: "news", audience: "pick", picked: [c.id], when: "now" as const };
    assert.equal((await createOwnerMessage({ isAdmin: false, name: "Owner" }, { ...base, text: "Hi" }, NOW)).ok, false);
    assert.equal((await createOwnerMessage(admin, { ...base, text: "Hi {shopp}" }, NOW)).ok, false);
    assert.equal((await createOwnerMessage(admin, { ...base, text: "  " }, NOW)).ok, false);
  });

  test("6. a reminder goes to the shop not on auto-pay, once; the auto-pay shop is left out; statuses follow WhatsApp", async () => {
    const plain = await business("plain", ist("2034-03-09T00:00:00"));
    const auto = await business("auto", ist("2034-03-09T00:00:00"), true);
    const r = await createOwnerMessage(admin, { kind: "rem", audience: "pick", picked: [plain.id, auto.id], text: KIND_TEXT, when: "now" }, NOW);
    assert.equal(r.ok, true, r.message);
    assert.match(r.message, /1 left out \(on auto-pay\)/);
    const rows = await db.ownerMessageTo.findMany({ where: { messageId: r.id! } });
    assert.equal(rows.find((x) => x.clientId === auto.id)?.status, "skipped");
    const mine = rows.find((x) => x.clientId === plain.id)!;
    assert.equal(mine.status, "queued");
    assert.match(mine.text, /for ₹2,999/);
    assert.equal(mine.owner, "Owner plain");

    await processOwnerMessages(NOW);
    await processOwnerMessages(NOW); // a second run sends nothing again
    const sent = await db.ownerMessageTo.findUniqueOrThrow({ where: { id: mine.id } });
    assert.equal(sent.status, "sent");
    assert.equal(sent.simulated, true, "no WhatsApp number in tests: marked as a test send");
    assert.equal((await db.ownerMessage.findUniqueOrThrow({ where: { id: r.id! } })).status, "done");

    assert.equal(await applyOwnerStatus({ id: sent.waId!, status: "read" }), true);
    await applyOwnerStatus({ id: sent.waId!, status: "delivered" });
    assert.equal((await db.ownerMessageTo.findUniqueOrThrow({ where: { id: mine.id } })).status, "read", "never goes back");
    assert.equal(await applyOwnerStatus({ id: "wamid.not-ours", status: "read" }), false);
  });

  test("7. outside quiet hours it waits; a scheduled message can be cancelled before it goes", async () => {
    const c = await business("quiet", ist("2034-04-20T00:00:00"));
    const late = ist("2034-03-07T22:30:00");
    const r = await createOwnerMessage(admin, { kind: "news", audience: "pick", picked: [c.id], text: "New: loyalty points for {shop}.", when: "now" }, late);
    assert.equal(r.ok, true, r.message);
    const m = await db.ownerMessage.findUniqueOrThrow({ where: { id: r.id! } });
    assert.equal(m.sendAt.toISOString(), ist("2034-03-08T09:00:00").toISOString());
    assert.equal((await processOwnerMessages(late)).sent, 0, "nothing at night");
    assert.equal((await cancelOwnerMessage(admin, m.id)).ok, true);
    assert.equal((await db.ownerMessageTo.findFirstOrThrow({ where: { messageId: m.id } })).status, "skipped");
    assert.equal((await cancelOwnerMessage(admin, m.id)).ok, false, "already cancelled");
    assert.equal((await processOwnerMessages(ist("2034-03-08T09:30:00"))).sent, 0, "a cancelled message never goes");
  });

  test("8. automatic reminders: 3 days before for the shop not on auto-pay, once, then sent in quiet hours", async () => {
    const save = await saveOwnerSettings(admin, { ...DEFAULT_OWNER_SETTINGS, reminders: true });
    assert.equal(save.ok, true, save.message);
    try {
      const at = ist("2034-06-09T10:00:00"); // Friday; plans ending 12 Jun get the 3-days-before reminder
      const plain = await business("auto-plain", ist("2034-06-12T00:00:00"));
      const onAuto = await business("auto-on", ist("2034-06-12T00:00:00"), true);
      const other = await business("auto-other", ist("2034-06-20T00:00:00"));
      assert.equal(await queueAutoReminders(at), 1);
      assert.equal(await queueAutoReminders(at), 0, "once per shop, plan end and day");
      const rows = await db.ownerMessageTo.findMany({ where: { clientId: { in: [plain.id, onAuto.id, other.id] } } });
      assert.deepEqual(rows.map((r) => r.clientId), [plain.id]);
      assert.equal(rows[0].autoKey, `rem:${plain.id}:2034-06-12:-3`);
      await processOwnerMessages(at);
      assert.equal((await db.ownerMessageTo.findUniqueOrThrow({ where: { id: rows[0].id } })).status, "sent");
    } finally {
      await saveOwnerSettings(admin, DEFAULT_OWNER_SETTINGS);
    }
  });
});

const KIND_TEXT = "Your thabaal {plan} plan for {shop} ends on {date}. Renew it for {amount} from My account.";
