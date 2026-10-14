// Checks that each client is its own island: its own sending number, order numbers, sheet, Meta balance, secrets.
// Runs on the test database only (tests/run.mjs).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { db } from "../../src/lib/db";
import { sheetHookStatus } from "../../src/lib/google-sheets-live";
import { getMetaAccountInfo, setMetaAccountBalance } from "../../src/lib/meta-balance";
import { orderRef, orderWhereRef, prefixFromName } from "../../src/lib/order-ref";
import { ensureOrderPrefix, nextOrderRef } from "../../src/lib/orders";
import { readiness } from "../../src/lib/provider";
import { isSealed } from "../../src/lib/secret-box";
import { numberConfig, senderFor } from "../../src/lib/senders";
import { MetaError, NOT_CONNECTED_CODE, sendTemplateMessage, sendTextMessage, waConfig } from "../../src/lib/whatsapp";

const raw = new PrismaClient();
let A: { id: string };
let B: { id: string };
let C: { id: string };

before(async () => {
  // First client created = the "legacy" one that may use the deployment-wide sheet link.
  A = await db.client.create({ data: { name: "Alpha Stores", homeCity: "Chennai" } });
  B = await db.client.create({ data: { name: "Beta Foods", homeCity: "Coimbatore" } });
  C = await db.client.create({ data: { name: "Alpha Spices", homeCity: "Madurai" } });
  await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });
});
after(async () => {
  await raw.$disconnect();
  await db.$disconnect();
});

describe("sending never borrows another business's number", () => {
  test("a client with no number is not connected (not demo, not the deployment number)", async () => {
    const { number, cfg } = await senderFor(B.id);
    assert.equal(number, null);
    assert.equal(cfg.notConnected, true);
    assert.equal(cfg.live, false);
    assert.equal(cfg.token, undefined);
  });
  test("a number without any token is not connected either", () => {
    const cfg = numberConfig({ token: null, phoneNumberId: "PN1", businessAccountId: "W1" }, null);
    assert.equal(cfg.notConnected, true);
  });
  test("a complete number is its own", () => {
    const cfg = numberConfig({ token: null, phoneNumberId: "PN1", businessAccountId: "W1" }, "EAAclienttoken");
    assert.equal(cfg.own, true);
    assert.equal(cfg.notConnected, false);
  });
  test("sending refuses outright instead of pretending", async () => {
    const { cfg } = await senderFor(B.id);
    await assert.rejects(sendTextMessage(cfg, "919800000001", "hi"), (e: unknown) => e instanceof MetaError && e.code === NOT_CONNECTED_CODE);
    await assert.rejects(
      sendTemplateMessage(cfg, { to: "919800000001", templateName: "x", language: "en", headerType: "NONE", bodyParams: [] } as never),
      (e: unknown) => e instanceof MetaError && e.code === NOT_CONNECTED_CODE,
    );
  });
  test("campaign readiness says not connected", async () => {
    const s = await db.setting.findUniqueOrThrow({ where: { id: 1 } });
    const r = await readiness(s, (await senderFor(B.id)).cfg);
    assert.equal(r.ok, false);
    assert.equal(r.notConnected, true);
  });
  test("platform-level config (no argument) is separate from any client", () => {
    assert.equal(waConfig().notConnected, false);
  });
});

describe("order numbers belong to each client", () => {
  test("prefix from the business name", () => {
    assert.equal(prefixFromName("Fresh Mart"), "FM");
    assert.equal(prefixFromName("Cup N Saucer"), "CNS");
    assert.equal(prefixFromName("Zara"), "ZARA");
  });
  test("each client counts from 1001 with its own prefix", async () => {
    assert.equal(await nextOrderRef(A.id), "AS-1001");
    assert.equal(await nextOrderRef(A.id), "AS-1002");
    assert.equal(await nextOrderRef(B.id), "BF-1001");
  });
  test("a taken prefix gets a letter added", async () => {
    assert.equal(await ensureOrderPrefix(C.id), "ASA");
  });
  test("20 orders at once never share a number", async () => {
    const refs = await Promise.all(Array.from({ length: 20 }, () => nextOrderRef(B.id)));
    assert.equal(new Set(refs).size, 20);
  });
  test("lookups find the right order, old RG numbers still work", async () => {
    const cust = await db.customer.create({ data: { clientId: A.id, phone: "919800000010", name: "Asha" } });
    const ref = await nextOrderRef(A.id);
    const o = await db.order.create({ data: { ref, clientId: A.id, customerId: cust.id, items: [], total: 100 } });
    const legacy = await db.order.create({ data: { clientId: A.id, customerId: cust.id, items: [], total: 50 } });
    assert.equal(orderRef(o), ref);
    assert.equal(orderRef(legacy), `RG-${1000 + legacy.number}`);
    assert.equal((await db.order.findFirst({ where: orderWhereRef(ref.toLowerCase()) }))?.id, o.id);
    assert.equal((await db.order.findFirst({ where: orderWhereRef(`#RG-${1000 + legacy.number}`) }))?.id, legacy.id);
    assert.equal(await db.order.findFirst({ where: { ...orderWhereRef(ref), clientId: B.id } }), null);
  });
});

describe("live Google Sheet goes only to the client's own sheet", () => {
  test("the deployment-wide sheet serves the first client only", async () => {
    assert.equal((await sheetHookStatus(A.id)).source, "shared");
    assert.equal((await sheetHookStatus(B.id)).state, "off");
    assert.equal((await sheetHookStatus(C.id)).state, "off");
  });
  test("a client's own link and secret are used, and the secret is stored encrypted", async () => {
    await db.client.update({ where: { id: B.id }, data: { sheetHookUrl: "https://script.google.com/macros/s/AKfycbBETAbetabetabetabeta/exec", sheetHookSecret: "beta-secret-0123456789" } });
    const st = await sheetHookStatus(B.id);
    assert.equal(st.source, "own");
    assert.equal(st.hasSecret, true);
    const stored = await raw.client.findUniqueOrThrow({ where: { id: B.id }, select: { sheetHookSecret: true } });
    assert.ok(isSealed(stored.sheetHookSecret));
  });
});

describe("Meta balance is per client, nothing hard-coded", () => {
  test("an unconnected client shows its own name and no balance", async () => {
    const acc = await getMetaAccountInfo(null, C.id);
    assert.equal(acc.accountName, "Alpha Spices");
    assert.equal(acc.liveBalance, 0);
    assert.equal(acc.wabaId, "");
  });
  test("a balance saved for one client never shows for another", async () => {
    await setMetaAccountBalance("WABA-A", 750, "test", A.id);
    assert.equal((await getMetaAccountInfo(null, A.id)).liveBalance, 750);
    assert.equal((await getMetaAccountInfo(null, B.id)).liveBalance, 0);
  });
});

describe("secrets are encrypted at rest", () => {
  test("access tokens are sealed in the database and plain in the app", async () => {
    await db.client.update({ where: { id: A.id }, data: { waToken: "EAAtesttoken123" } });
    const stored = await raw.client.findUniqueOrThrow({ where: { id: A.id }, select: { waToken: true } });
    assert.ok(isSealed(stored.waToken));
    assert.equal((await db.client.findUniqueOrThrow({ where: { id: A.id } })).waToken, "EAAtesttoken123");
  });
});
