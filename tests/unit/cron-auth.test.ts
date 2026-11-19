// Security audit (8 Nov 2026 / Updated 19 Nov 2026):
// The scheduler endpoint accepts only POST with "Authorization: Bearer <CRON_SECRET>".
// The secret in the web address (?key=) is refused, and so are a wrong or missing header.
// Uses ?probe=key so nothing is dispatched.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { POST, GET, HEAD } from "../../src/app/api/cron/route";

const secret = process.env.CRON_SECRET ?? "";
const callPost = (path: string, auth?: string) =>
  POST(new NextRequest(`http://localhost${path}`, { method: "POST", headers: auth ? { authorization: auth } : {} }));

describe("cron endpoint: method security & authorization", () => {
  test("1. GET and HEAD are strictly rejected with 405 Method Not Allowed", async () => {
    const getRes = await GET();
    assert.equal(getRes.status, 405);
    assert.equal(getRes.headers.get("Allow"), "POST");
    assert.equal(getRes.headers.get("Cache-Control"), "no-store");
    const getJson = await getRes.json();
    assert.equal(getJson.error, "METHOD_NOT_ALLOWED");

    const headRes = await HEAD();
    assert.equal(headRes.status, 405);
    assert.equal(headRes.headers.get("Allow"), "POST");
    assert.equal(headRes.headers.get("Cache-Control"), "no-store");
  });

  test("2. no header, the secret in the address, a wrong or near-miss header on POST: 401", async () => {
    assert.ok(secret.length > 8, "tests/run.mjs sets CRON_SECRET");
    assert.equal((await callPost("/api/cron?probe=key")).status, 401);
    assert.equal((await callPost(`/api/cron?probe=key&key=${encodeURIComponent(secret)}`)).status, 401);
    assert.equal((await callPost("/api/cron?probe=key", "Bearer wrong")).status, 401);
    assert.equal((await callPost("/api/cron?probe=key", `Bearer ${secret}x`)).status, 401);
    assert.equal((await callPost("/api/cron?probe=key", secret)).status, 401);
  });

  test("3. the right Bearer header on POST is let in", async () => {
    const r = await callPost("/api/cron?probe=key", `Bearer ${secret}`);
    assert.equal(r.status, 200);
    assert.ok("encryptionKey" in (await r.json()));
  });
});
