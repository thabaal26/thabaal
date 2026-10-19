import assert from "node:assert/strict";
import { describe, test, before } from "node:test";
import { db } from "../../src/lib/db";
import {
  catalogProducts,
  createCatalogProductItem,
  deleteCatalogProductItem,
  updateCatalogProductItem,
} from "../../src/lib/catalog";

describe("Template & Catalogue CRUD for QA Test Shop", () => {
  let clientId: string;

  before(async () => {
    const client = await db.client.upsert({
      where: { name: "QA Test Shop" },
      update: {},
      create: {
        name: "QA Test Shop",
        brandPrimary: "#0D9488",
        brandAccent: "#14B8A6",
        homeCity: "Madurai",
        orderFlow: "deliver",
        businessType: "retail",
        billingMode: "direct",
      },
    });
    clientId = client.id;
  });

  describe("Catalogue Product CRUD", () => {
    const testSku = "QA-TEST-SKU-999";

    test("1. Create: adds product in test mode and validates parameters", async () => {
      // Invalid SKU test
      const badSku = await createCatalogProductItem(clientId, {
        retailerId: "bad sku with spaces!",
        name: "Test Oil",
        priceAmount: 100,
        inStock: true,
        description: "Test description",
        imageUrl: null,
        brand: "QA Test Shop",
        link: "https://example.com",
      });
      assert.equal(badSku.ok, false);

      // Valid Create
      const res = await createCatalogProductItem(clientId, {
        retailerId: testSku,
        name: "Cold Pressed Groundnut Oil 1L",
        priceAmount: 280,
        inStock: true,
        description: "Pure cold pressed oil from QA Test Shop",
        imageUrl: null,
        brand: "QA Test Shop",
        link: "https://example.com/product",
      });
      assert.equal(res.ok, true);
    });

    test("2. Read: newly added product appears in catalogProducts list", async () => {
      const products = await catalogProducts(clientId);
      const item = products.find((p) => p.retailerId === testSku);
      assert.ok(item, "Created product should be present in catalogProducts");
      assert.equal(item.name, "Cold Pressed Groundnut Oil 1L");
      assert.equal(item.priceAmount, 280);
      assert.equal(item.inStock, true);
    });

    test("3. Update: modifies price, stock status, and name", async () => {
      const products = await catalogProducts(clientId);
      const item = products.find((p) => p.retailerId === testSku);
      assert.ok(item);

      const updateRes = await updateCatalogProductItem(clientId, {
        id: item.id,
        retailerId: testSku,
        name: "Cold Pressed Groundnut Oil 1L (Updated)",
        priceAmount: 310,
        inStock: false,
      });
      assert.equal(updateRes.ok, true);

      // Verify read reflects changes
      const updatedProducts = await catalogProducts(clientId);
      const updatedItem = updatedProducts.find((p) => p.retailerId === testSku);
      assert.ok(updatedItem);
      assert.equal(updatedItem.name, "Cold Pressed Groundnut Oil 1L (Updated)");
      assert.equal(updatedItem.priceAmount, 310);
      assert.equal(updatedItem.inStock, false);
    });

    test("4. Delete: removes product from catalogProducts", async () => {
      const deleteRes = await deleteCatalogProductItem(clientId, testSku);
      assert.equal(deleteRes.ok, true);

      const products = await catalogProducts(clientId);
      const item = products.find((p) => p.retailerId === testSku);
      assert.equal(item, undefined, "Deleted product should no longer be present");
    });
  });

  describe("Template CRUD", () => {
    const tplName = "qa_automated_test_template";
    let templateId: string;

    test("1. Create: adds template with draft status and variables", async () => {
      await db.template.deleteMany({ where: { clientId, name: tplName } });

      const tpl = await db.template.create({
        data: {
          clientId,
          name: tplName,
          language: "en",
          category: "MARKETING",
          headerType: "NONE",
          body: "Hello {{1}}, here is your test offer!",
          variables: { "1": { source: "first_name" } },
          status: "DRAFT",
          statusReason: "Created for QA verification",
        },
      });

      assert.ok(tpl.id);
      templateId = tpl.id;
      assert.equal(tpl.status, "DRAFT");
    });

    test("2. Read: template can be queried by ID and client", async () => {
      const tpl = await db.template.findUnique({ where: { id: templateId } });
      assert.ok(tpl);
      assert.equal(tpl.name, tplName);
      assert.equal(tpl.clientId, clientId);
      assert.equal(tpl.category, "MARKETING");
    });

    test("3. Update: modifies body, variables, and approval status", async () => {
      const updated = await db.template.update({
        where: { id: templateId },
        data: {
          body: "Hello {{1}}, your exclusive 20% discount is ready!",
          status: "APPROVED",
          statusReason: null,
        },
      });

      assert.equal(updated.status, "APPROVED");
      assert.ok(updated.body.includes("20% discount"));
    });

    test("4. Delete: cleans up template from database", async () => {
      await db.template.delete({ where: { id: templateId } });
      const tpl = await db.template.findUnique({ where: { id: templateId } });
      assert.equal(tpl, null, "Deleted template should not exist");
    });
  });
});
