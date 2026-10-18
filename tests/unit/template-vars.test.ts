// Template placeholders: {{1}} falls back to the customer's name, any other placeholder without a value set is never
// guessed (it used to be filled with the customer's name too: "Items: Priya. Total: Rs Priya").
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderFor, unmappedVars, type VarMap } from "../../src/lib/template";

const base = { category: "UTILITY" as const, headerType: "NONE" as const, headerText: "", footer: "", codeExpiryMins: null, securityNote: false };
const body = "Hello {{1}}, thank you for your order. Items: {{2}}. Total: Rs {{3}}.";
const customer = { name: "Muthu Selvam", phone: "919990001011" };

describe("template placeholders without a value", () => {
  test("synced template with only {{1}} mapped: {{2}} and {{3}} are reported as unmapped", () => {
    assert.deepEqual(unmappedVars({ category: "UTILITY", body, variables: { "1": { source: "first_name" } } as VarMap }), [2, 3]);
  });
  test("preview shows the placeholder itself, not the customer's name", () => {
    const r = renderFor({ ...base, body, variables: { "1": { source: "first_name" } } as VarMap }, customer);
    assert.equal(r.body, "Hello Muthu, thank you for your order. Items: {{2}}. Total: Rs {{3}}.");
  });
  test("every placeholder mapped: nothing unmapped and values filled in", () => {
    const variables = { "1": { source: "first_name" }, "2": { source: "static", value: "2 x Groundnut oil 1 L" }, "3": { source: "static", value: "560" } } as VarMap;
    assert.deepEqual(unmappedVars({ category: "UTILITY", body, variables }), []);
    assert.equal(renderFor({ ...base, body, variables }, customer).body, "Hello Muthu, thank you for your order. Items: 2 x Groundnut oil 1 L. Total: Rs 560.");
  });
  test("{{1}} with no mapping still uses the customer's name (unchanged)", () => {
    assert.deepEqual(unmappedVars({ category: "MARKETING", body: "Hi {{1}}!", variables: {} as VarMap }), []);
    assert.equal(renderFor({ ...base, category: "MARKETING", body: "Hi {{1}}!", variables: {} as VarMap }, customer).body, "Hi Muthu Selvam!");
  });
  test("authentication templates are never reported (Meta fixes their wording)", () => {
    assert.deepEqual(unmappedVars({ category: "AUTHENTICATION", body: "{{1}} {{2}}", variables: {} as VarMap }), []);
  });
});
