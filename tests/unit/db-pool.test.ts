// The database client's pool size (lib/db.ts withPoolSize): 10 connections through Neon's pooler, so a page that
// reads many things at once doesn't wait in line; a size already in the address and direct addresses are left alone.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { withPoolSize } from "../../src/lib/db";

describe("database pool size", () => {
  test("a pooler address gets 10 connections; anything else is left as it is", () => {
    assert.equal(withPoolSize("postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require"), "postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require&connection_limit=10");
    assert.equal(withPoolSize("postgresql://u:p@ep-x-pooler.neon.tech/db"), "postgresql://u:p@ep-x-pooler.neon.tech/db?connection_limit=10");
    assert.equal(withPoolSize("postgresql://u:p@ep-x-pooler.neon.tech/db?connection_limit=3"), "postgresql://u:p@ep-x-pooler.neon.tech/db?connection_limit=3");
    assert.equal(withPoolSize("postgresql://u:p@ep-x.neon.tech/db?sslmode=require"), "postgresql://u:p@ep-x.neon.tech/db?sslmode=require");
    assert.equal(withPoolSize("postgresql://postgres:test@localhost:5433/db"), "postgresql://postgres:test@localhost:5433/db");
    assert.equal(withPoolSize(undefined), undefined);
  });
});
