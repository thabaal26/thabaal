// Automatic replies engine, phase 1 (lib/engine): button keys, one claim per Meta message, staff pause/resume, which
// template button a tap is, and the saved action per business mode (legacy / shadow / engine), with our quick-reply
// payloads only in engine mode. Two businesses; Meta is a fake, nothing leaves the machine.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { deliver, getSettings } from "../../src/lib/provider";
import { claimInbound, markProcessed, pruneInbound, STALE_MS } from "../../src/lib/engine/inbound";
import { chatAutomation, pauseChat, resumeChat } from "../../src/lib/engine/conversation";
import { handleButtonTap, resolveTap } from "../../src/lib/engine/buttons";
import { buttonKeyOf, cleanAction, fillReply, quickReplies } from "../../src/lib/engine/keys";
import { waConfig } from "../../src/lib/whatsapp";

const MIN = 60_000;

describe("engine: keys and actions", () => {
  test("1. a button's key is its label in lowercase-dashes (Tamil kept, at most 32), or its own key", () => {
    assert.equal(buttonKeyOf({ text: "View Products" }), "view-products");
    assert.equal(buttonKeyOf({ text: "  Call to Order! " }), "call-to-order");
    assert.equal(buttonKeyOf({ text: "விலை பட்டியல்" }), "விலை-பட்டியல்");
    assert.equal(buttonKeyOf({ text: "x".repeat(50) }).length, 32);
    assert.equal(buttonKeyOf({ text: "View", key: "menu" }), "menu");
    assert.deepEqual(quickReplies([{ type: "URL", text: "Site" }, { type: "QUICK_REPLY", text: "View Products" }, { type: "QUICK_REPLY", text: "Stop offers" }]), [
      { index: 1, text: "View Products", key: "view-products" },
      { index: 2, text: "Stop offers", key: "stop-offers" },
    ]);
  });

  test("2. what a business saves is checked; {name} and {shop} are filled in", () => {
    assert.equal(cleanAction({ action: "reply", value: "" }).ok, false);
    assert.equal(cleanAction({ action: "opt_out", value: "everything" }).ok, false);
    assert.equal(cleanAction({ action: "builtin", value: "dance" }).ok, false);
    assert.equal(cleanAction({ action: "tag", value: "has space ok" }).ok, true);
    assert.equal(cleanAction({ action: "tag", value: "<script>" }).ok, false);
    const ok = cleanAction({ action: "tag", value: "Interested" });
    assert.ok(ok.ok && ok.value.value === "interested");
    assert.equal(fillReply("Hi {name}, welcome to {SHOP}!", { name: "Anu", shop: "QA Shop" }), "Hi Anu, welcome to QA Shop!");
  });
});

describe("engine: one claim per Meta message", () => {
  test("3. new, then duplicate; an unfinished claim is taken over after a few minutes; a finished one never", async () => {
    const id = `wamid.claim-${Date.now()}`;
    const t0 = new Date();
    assert.equal(await claimInbound(id, null, t0), "new");
    assert.equal(await claimInbound(id, null, new Date(t0.getTime() + 1000)), "duplicate", "Meta's retry while it's being handled");
    assert.equal(await claimInbound(id, null, new Date(t0.getTime() + STALE_MS + 1000)), "new", "the first try crashed: handled again");
    await markProcessed(id);
    assert.equal(await claimInbound(id, null, new Date(t0.getTime() + 3 * STALE_MS)), "duplicate", "handled: never again");
    await db.inboundEvent.update({ where: { id }, data: { receivedAt: new Date(Date.now() - 40 * 86_400_000) } });
    assert.ok((await pruneInbound()) >= 1);
    assert.equal(await db.inboundEvent.findUnique({ where: { id } }), null);
  });
});

describe("engine: taps, pause and modes, two businesses", () => {
  const realFetch = globalThis.fetch;
  const sent: { to?: string; type?: string; text?: { body?: string }; template?: { components?: { type: string; sub_type?: string; index?: number; parameters?: { payload?: string }[] }[] } }[] = [];
  const P = `9144${String(Date.now()).slice(-6)}`;
  let A: string;
  let B: string;
  let tA: string;
  let tB: string;
  let cust: { id: string; clientId: string; phone: string; name: string; optedOut: boolean; tags: string[] };
  let other: string;
  let n = 0;
  const PNID = `qa-engine-a-${Date.now()}`;

  before(async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (String(url).endsWith("/messages")) sent.push(body);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.engine-out-${++n}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
    const mk = async (name: string, prefix: string, pnid: string) => {
      const c = await db.client.create({ data: { name: `${name} ${Date.now()}`, orderPrefix: prefix } });
      await db.whatsAppNumber.create({ data: { clientId: c.id, label: "Main", phoneNumberId: pnid, businessAccountId: `waba-${prefix}`, token: "qa-fake-token", isDefault: true } });
      const t = await db.template.create({
        data: { clientId: c.id, businessAccountId: `waba-${prefix}`, name: `qa_engine_${prefix}`, category: "MARKETING", status: "APPROVED", language: "en", body: "Offer", buttons: [{ type: "QUICK_REPLY", text: "View Products" }, { type: "QUICK_REPLY", text: "Talk to us" }, { type: "QUICK_REPLY", text: "Stop offers" }] },
      });
      return [c.id, t.id];
    };
    [A, tA] = await mk("QA Engine A", "EA", PNID);
    [B, tB] = await mk("QA Engine B", "EB", `qa-engine-b-${Date.now()}`);
    const c = await db.customer.create({ data: { clientId: A, phone: `${P}1`, name: "Anu Raj" } });
    cust = { id: c.id, clientId: A, phone: c.phone, name: c.name, optedOut: false, tags: [] };
    other = (await db.customer.create({ data: { clientId: B, phone: `${P}2`, name: "Bala" } })).id;
    // A's offer went to Anu; Anu wrote back just now (the 24 h window is open).
    await db.message.create({ data: { customerId: c.id, templateId: tA, templateName: "qa_engine_EA", status: "READ", waMessageId: "wamid.engine-offer-a", sentAt: new Date(Date.now() - 10 * MIN) } });
    await db.message.create({ data: { customerId: other, templateId: tB, templateName: "qa_engine_EB", status: "READ", waMessageId: "wamid.engine-offer-b", sentAt: new Date(Date.now() - 10 * MIN) } });
    await db.reply.create({ data: { customerId: c.id, text: "hi", kind: "text", receivedAt: new Date() } });
    await db.buttonAction.create({ data: { clientId: A, templateId: tA, buttonKey: "view-products", action: "reply", value: "Hi {name}! Here is today's list from {shop}." } });
    await db.buttonAction.create({ data: { clientId: A, templateId: tA, buttonKey: "talk-to-us", action: "handoff" } });
    await db.buttonAction.create({ data: { clientId: A, templateId: tA, buttonKey: "stop-offers", action: "opt_out", value: "offers" } });
  });

  after(async () => {
    globalThis.fetch = realFetch;
    for (const c of [A, B]) {
      await db.engineDecision.deleteMany({ where: { clientId: c } });
      await db.buttonAction.deleteMany({ where: { clientId: c } });
      await db.conversation.deleteMany({ where: { clientId: c } });
      await db.message.deleteMany({ where: { customer: { clientId: c } } });
      await db.reply.deleteMany({ where: { customer: { clientId: c } } });
      await db.template.deleteMany({ where: { clientId: c } });
      await db.customer.deleteMany({ where: { clientId: c } });
      await db.whatsAppNumber.deleteMany({ where: { clientId: c } });
      await db.client.delete({ where: { id: c } });
    }
  });

  const tap = (text: string, extra: Record<string, unknown> = {}) => ({ id: `wamid.engine-in-${++n}`, type: "button", button: { text, payload: text }, context: { id: "wamid.engine-offer-a" }, ...extra });
  const setMode = (mode: string) => db.client.update({ where: { id: A }, data: { automationMode: mode } });
  const texts = () => sent.filter((s) => s.type === "text").map((s) => s.text?.body ?? "");

  test("4. a tap is the button on the template message it answers; another business's message or an unclear label is not", async () => {
    assert.deepEqual(await resolveTap(A, tap("View Products")), { templateId: tA, key: "view-products", label: "View Products", source: "context" });
    assert.deepEqual(await resolveTap(A, tap("Talk to us", { button: { text: "Talk to us", payload: "tb:talk-to-us" } })), { templateId: tA, key: "talk-to-us", label: "Talk to us", source: "payload" });
    assert.equal(await resolveTap(B, tap("View Products")), null, "B can't claim A's message");
    assert.equal(await resolveTap(A, tap("View Products", { context: undefined })), null, "no context: today's replies handle it");
    assert.equal(await resolveTap(A, tap("Something else")), null);
  });

  test("5. legacy (default) does nothing; shadow only logs; engine runs the saved reply once", async () => {
    const legacy = tap("View Products");
    assert.equal(await handleButtonTap(cust, legacy, { inboundId: legacy.id, phoneNumberId: PNID, signed: true }), false);
    assert.equal(await db.engineDecision.count({ where: { clientId: A } }), 0);

    await setMode("shadow");
    const shadow = tap("View Products");
    assert.equal(await handleButtonTap(cust, shadow, { inboundId: shadow.id, phoneNumberId: PNID, signed: true }), false, "today's reply still answers");
    const d = await db.engineDecision.findUniqueOrThrow({ where: { inboundId: shadow.id } });
    assert.equal(d.action, "reply");
    assert.equal(d.executed, false);
    assert.equal(texts().length, 0, "nothing sent in shadow");

    await setMode("engine");
    const live = tap("View Products");
    assert.equal(await handleButtonTap(cust, live, { inboundId: live.id, phoneNumberId: PNID, signed: true }), true);
    assert.match(texts().at(-1) ?? "", /^Hi Anu! Here is today's list from QA Engine A/);
    assert.equal((await db.engineDecision.findUniqueOrThrow({ where: { inboundId: live.id } })).executed, true);
    const before = texts().length;
    assert.equal(await handleButtonTap(cust, live, { inboundId: live.id, phoneNumberId: PNID, signed: true }), true, "the same tap again");
    assert.equal(texts().length, before, "…isn't answered twice");
  });

  test("6. engine refuses unsigned webhooks and messages to another business's number", async () => {
    const t1 = tap("View Products");
    assert.equal(await handleButtonTap(cust, t1, { inboundId: t1.id, phoneNumberId: PNID, signed: false }), false);
    const t2 = tap("View Products");
    assert.equal(await handleButtonTap(cust, t2, { inboundId: t2.id, phoneNumberId: "qa-unknown-number", signed: true }), false);
    assert.equal(await db.engineDecision.count({ where: { inboundId: { in: [t1.id, t2.id] } } }), 0);
  });

  test("7. hand to staff pauses automatic replies and tags them; stop offers tags no-offers; resume turns replies back on", async () => {
    const h = tap("Talk to us");
    assert.equal(await handleButtonTap(cust, h, { inboundId: h.id, phoneNumberId: PNID, signed: true }), true);
    const state = await chatAutomation(cust.id);
    assert.equal(state.paused, true);
    assert.equal(state.reason, "paused");
    assert.ok((await db.customer.findUniqueOrThrow({ where: { id: cust.id } })).tags.includes("needs-staff"));
    assert.match(texts().at(-1) ?? "", /Someone from QA Engine A [0-9]+ will reply/);
    await resumeChat(A, cust.id);
    assert.equal((await chatAutomation(cust.id)).paused, false);
    const s = tap("Stop offers");
    cust.tags = (await db.customer.findUniqueOrThrow({ where: { id: cust.id } })).tags;
    await handleButtonTap(cust, s, { inboundId: s.id, phoneNumberId: PNID, signed: true });
    const after = await db.customer.findUniqueOrThrow({ where: { id: cust.id } });
    assert.ok(after.tags.includes("no-offers") && after.tags.includes("needs-staff"), "tags kept and added");
    assert.equal(after.optedOut, false, "order messages still reach them");
  });

  test("8. staff typing pauses for the business's own minutes; resume ends it; a pause until resumed has no end", async () => {
    await db.client.update({ where: { id: A }, data: { staffPauseMinutes: 30 } });
    await db.message.create({ data: { customerId: cust.id, templateName: "Typed reply", body: "hello", status: "SENT", createdAt: new Date(Date.now() + 1000) } });
    const typing = await chatAutomation(cust.id, new Date(Date.now() + 20 * MIN));
    assert.equal(typing.reason, "staff-typing", "20 minutes after a staff reply, inside 30");
    assert.equal((await chatAutomation(cust.id, new Date(Date.now() + 31 * MIN))).paused, false, "31 minutes later it's over");
    await resumeChat(A, cust.id, new Date(Date.now() + 2000));
    assert.equal((await chatAutomation(cust.id, new Date(Date.now() + 5 * MIN))).paused, false, "resume ends the quiet time at once");
    await pauseChat(A, cust.id, null, "Staff");
    const forever = await chatAutomation(cust.id);
    assert.equal(forever.paused, true);
    assert.equal(forever.until, null);
    await resumeChat(A, cust.id);
  });

  test("9. our quick-reply payloads go only to businesses in engine mode", async () => {
    const settings = await getSettings();
    const t = await db.template.findUniqueOrThrow({ where: { id: tA } });
    const cfg = waConfig({ token: "qa-fake-token", phoneNumberId: PNID, businessAccountId: "waba-EA" });
    const payloads = () => (sent.at(-1)?.template?.components ?? []).filter((c) => c.sub_type === "quick_reply").map((c) => [c.index, c.parameters?.[0]?.payload]);
    await deliver(settings, t, { name: "Anu", phone: cust.phone }, cfg);
    assert.deepEqual(payloads(), [[0, "tb:view-products"], [1, "tb:talk-to-us"], [2, "tb:stop-offers"]]);
    const tb = await db.template.findUniqueOrThrow({ where: { id: tB } });
    await deliver(settings, tb, { name: "Bala", phone: `${P}2` }, waConfig({ token: "qa-fake-token", phoneNumberId: "pn-b", businessAccountId: "waba-EB" }));
    assert.deepEqual(payloads(), [], "B is in legacy mode: templates go out exactly as before");
  });
});
