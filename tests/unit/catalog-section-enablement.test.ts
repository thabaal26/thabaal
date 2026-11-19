import { test } from "node:test";
import assert from "node:assert/strict";
import { isSectionEnabled, isHrefEnabled, sanitizeDisabledSections } from "../../src/lib/client-sections";

test("Catalogue & Section Enablement Architecture Suite", async (t) => {
  await t.test("1. Enables a section when disabledSections is empty", () => {
    assert.equal(isSectionEnabled([], "catalogue"), true);
    assert.equal(isSectionEnabled([], "orders"), true);
    assert.equal(isSectionEnabled([], "campaigns"), true);
  });

  await t.test("2. Disables a section when its key is present", () => {
    assert.equal(isSectionEnabled(["catalogue"], "catalogue"), false);
    assert.equal(isSectionEnabled(["orders", "catalogue"], "catalogue"), false);
  });

  await t.test("3. Does not disable catalogue when another section is disabled", () => {
    assert.equal(isSectionEnabled(["orders"], "catalogue"), true);
    assert.equal(isSectionEnabled(["calls"], "catalogue"), true);
  });

  await t.test("4. Treats undefined or null disabledSections as empty (fail-open for standard sections)", () => {
    assert.equal(isSectionEnabled(undefined, "catalogue"), true);
    assert.equal(isSectionEnabled(null, "catalogue"), true);
  });

  await t.test("5. Finforte (c_finforte_001) with disabledSections = [] resolves catalogue = true without tenant hardcode", () => {
    const finforteClient = {
      id: "c_finforte_001",
      name: "Finforte",
      disabledSections: [],
    };
    const isCatalogueEnabled = isSectionEnabled(finforteClient.disabledSections, "catalogue");
    assert.equal(isCatalogueEnabled, true);
  });

  await t.test("6. Finforte (c_finforte_001) with disabledSections = ['catalogue'] resolves catalogue = false", () => {
    const finforteClient = {
      id: "c_finforte_001",
      name: "Finforte",
      disabledSections: ["catalogue"],
    };
    const isCatalogueEnabled = isSectionEnabled(finforteClient.disabledSections, "catalogue");
    assert.equal(isCatalogueEnabled, false);
  });

  await t.test("7. Tenant named SheVest Summit with disabledSections = [] resolves catalogue = true", () => {
    const shevestClient = {
      id: "c_shevest_999",
      name: "SheVest Summit 2026",
      disabledSections: [],
    };
    const isCatalogueEnabled = isSectionEnabled(shevestClient.disabledSections, "catalogue");
    assert.equal(isCatalogueEnabled, true);
  });

  await t.test("8. Any other tenant (e.g. Thenan Oils) resolves dynamically based strictly on disabledSections", () => {
    const thenanClient = {
      id: "c_thenan_001",
      name: "Thenan Oils",
      disabledSections: [],
    };
    assert.equal(isSectionEnabled(thenanClient.disabledSections, "catalogue"), true);

    const clientWithDisabledCat = {
      id: "c_other_002",
      name: "Consulting Co",
      disabledSections: ["catalogue", "orders"],
    };
    assert.equal(isSectionEnabled(clientWithDisabledCat.disabledSections, "catalogue"), false);
    assert.equal(isSectionEnabled(clientWithDisabledCat.disabledSections, "orders"), false);
    assert.equal(isSectionEnabled(clientWithDisabledCat.disabledSections, "campaigns"), true);
  });

  await t.test("9. Navigation link /dashboard/catalogue respects disabledSections via isHrefEnabled", () => {
    // When catalogue is enabled (disabledSections = [])
    assert.equal(isHrefEnabled("/dashboard/catalogue", []), true);

    // When catalogue is disabled
    assert.equal(isHrefEnabled("/dashboard/catalogue", ["catalogue"]), false);
  });
});
