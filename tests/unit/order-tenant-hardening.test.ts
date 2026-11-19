import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { resolveOrderForClient, handleCartChoice } from "../../src/lib/order-intake";
import { addressBook } from "../../src/lib/address-book-server";

describe("TEN-01: Order & Address-Book Tenant Hardening Test Suite", () => {
  let clientAId: string;
  let clientBId: string;
  let customerAId: string;
  let customerBId: string;
  let orderAId: string;
  let orderBId: string;

  before(async () => {
    // 1. Create two isolated tenants
    const cA = await db.client.create({ data: { name: `TenA_${Date.now()}` } });
    const cB = await db.client.create({ data: { name: `TenB_${Date.now()}` } });
    clientAId = cA.id;
    clientBId = cB.id;

    // 2. Create customer for Tenant A
    const custA = await db.customer.create({
      data: {
        clientId: clientAId,
        name: "Alice A",
        phone: `919811${Date.now().toString().slice(-6)}`,
        locationRaw: "123 Anna Nagar, Madurai",
        location: "Anna Nagar",
      },
    });
    customerAId = custA.id;

    // 3. Create customer for Tenant B
    const custB = await db.customer.create({
      data: {
        clientId: clientBId,
        name: "Bob B",
        phone: `919822${Date.now().toString().slice(-6)}`,
        locationRaw: "456 KK Nagar, Madurai",
        location: "KK Nagar",
      },
    });
    customerBId = custB.id;

    // 4. Create Order under Tenant A
    const oA = await db.order.create({
      data: {
        clientId: clientAId,
        customerId: customerAId,
        number: 5001,
        status: "NEW",
        total: 450,
        currency: "INR",
        items: [{ id: "item1", name: "Gingelly Oil 1L", price: 450, quantity: 1 }],
      },
    });
    orderAId = oA.id;

    // 5. Create Order under Tenant B
    const oB = await db.order.create({
      data: {
        clientId: clientBId,
        customerId: customerBId,
        number: 5002,
        status: "NEW",
        total: 900,
        currency: "INR",
        items: [{ id: "item2", name: "Cold Pressed Coconut Oil 1L", price: 900, quantity: 1 }],
      },
    });
    orderBId = oB.id;
  });

  test("1. resolveOrderForClient: Returns order when orderId and clientId match authorized tenant", async () => {
    const order = await resolveOrderForClient({ orderId: orderAId, clientId: clientAId });
    assert.ok(order);
    assert.equal(order?.id, orderAId);
    assert.equal(order?.clientId, clientAId);
  });

  test("2. resolveOrderForClient: Returns null when orderId exists in another tenant (cross-tenant read prevented)", async () => {
    // Attempting to read Tenant A's order using Tenant B's client context
    const order = await resolveOrderForClient({ orderId: orderAId, clientId: clientBId });
    assert.equal(order, null, "Must return null on cross-tenant order resolution");
  });

  test("3. resolveOrderForClient: Returns null when clientId is missing, empty or whitespace", async () => {
    assert.equal(await resolveOrderForClient({ orderId: orderAId, clientId: "" }), null);
    assert.equal(await resolveOrderForClient({ orderId: orderAId, clientId: "   " }), null);
  });

  test("4. resolveOrderForClient: Returns null when orderId does not exist", async () => {
    const order = await resolveOrderForClient({ orderId: "non_existent_cuid", clientId: clientAId });
    assert.equal(order, null);
  });

  test("5. handleCartChoice: Cross-tenant cart merge is strictly prevented", async () => {
    // Attempt to merge Tenant B's order into Tenant A's order
    await handleCartChoice(customerAId, `cart_add:${orderAId}:${orderBId}`, clientAId);

    // Verify Tenant A's order is still untouched (status NEW, mergeWith null)
    const refreshedA = await db.order.findUniqueOrThrow({ where: { id: orderAId } });
    assert.equal(refreshedA.status, "NEW");
    assert.equal(refreshedA.mergeWith, null);

    // Verify Tenant B's order is untouched
    const refreshedB = await db.order.findUniqueOrThrow({ where: { id: orderBId } });
    assert.equal(refreshedB.status, "NEW");
  });

  test("6. handleCartChoice: Cross-tenant new order manipulation is rejected when tenantClientId mismatches", async () => {
    // Tenant B attempts to manipulate Tenant A's order
    await handleCartChoice(customerAId, `cart_sep:${orderAId}`, clientBId);

    const refreshedA = await db.order.findUniqueOrThrow({ where: { id: orderAId } });
    assert.equal(refreshedA.internalNote, null, "Tenant B must not mutate Tenant A order");
  });

  test("7. addressBook: Scoped query with clientId returns customer's delivery addresses", async () => {
    const addresses = await addressBook(customerAId, clientAId);
    assert.ok(Array.isArray(addresses));
    assert.ok(addresses.length > 0);
    assert.equal(addresses[0].area, "Anna Nagar");
  });

  test("8. addressBook: Cross-tenant query (customer A queried with tenant B's clientId) returns empty array", async () => {
    const addresses = await addressBook(customerAId, clientBId);
    assert.deepEqual(addresses, [], "Cross-tenant address query must yield empty array");
  });
});
