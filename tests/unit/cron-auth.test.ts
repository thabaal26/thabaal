// Security audit (8 Nov 2026): the scheduler endpoint takes only "Authorization: Bearer <CRON_SECRET>". The secret in
// the web address (?key=) is refused, and so are a wrong or missing header. Uses ?probe=key so nothing is dispatched.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../src/app/api/cron/route";

const secret = process.env.CRON_SECRET ?? "";
const call = (path: string, auth?: string) => GET(new NextRequest(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} }));

describe("cron endpoint: only the Authorization header", () => {
  test("1. no header, the secret in the address, a wrong or near-miss header: 401", async () => {
    assert.ok(secret.length > 8, "tests/run.mjs sets CRON_SECRET");
    assert.equal((await call("/api/cron?probe=key")).status, 401);
    assert.equal((await call(`/api/cron?probe=key&key=${encodeURIComponent(secret)}`)).status, 401);
    assert.equal((await call("/api/cron?probe=key", "Bearer wrong")).status, 401);
    assert.equal((await call("/api/cron?probe=key", `Bearer ${secret}x`)).status, 401);
    assert.equal((await call("/api/cron?probe=key", secret)).status, 401);
  });
  test("2. the right Bearer header is let in", async () => {
    const r = await call("/api/cron?probe=key", `Bearer ${secret}`);
    assert.equal(r.status, 200);
    assert.ok("encryptionKey" in (await r.json()));
  });
});
