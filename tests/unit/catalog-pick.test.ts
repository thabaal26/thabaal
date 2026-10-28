import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chooseCatalogId } from "../../src/lib/catalog-pick";

describe("which catalogue a WhatsApp account uses", () => {
  test("the catalogue Meta lists as connected wins", () => {
    assert.equal(chooseCatalogId(["111"], ["222"]), "111");
  });

  test("the first connected catalogue when Meta lists several", () => {
    assert.equal(chooseCatalogId(["111", "333"], []), "111");
  });

  test("Meta lists none connected: the business's only catalogue", () => {
    assert.equal(chooseCatalogId([], ["1763209861641300"]), "1763209861641300");
  });

  test("Meta lists none connected and the business has several: no guess", () => {
    assert.equal(chooseCatalogId([], ["222", "444"]), null);
  });

  test("no catalogue anywhere", () => {
    assert.equal(chooseCatalogId([], []), null);
  });
});
