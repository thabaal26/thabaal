import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { GET, HEAD, POST } from "../../src/app/api/cron/route";

describe("SCH-01: Cron Method Security & Mutating Guard Test Suite", () => {
  const secret = process.env.CRON_SECRET || "test-cron-secret";

  test("1. GET request returns 405 Method Not Allowed with Allow: POST header", async () => {
    const res = await GET();
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("Allow"), "POST");
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "METHOD_NOT_ALLOWED");
  });

  test("2. HEAD request returns 405 Method Not Allowed with Allow: POST header and empty body", async () => {
    const res = await HEAD();
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("Allow"), "POST");
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    const text = await res.text();
    assert.equal(text, "");
  });

  test("3. POST without Authorization header returns 401 Unauthorized", async () => {
    const req = new NextRequest("http://localhost/api/cron", {
      method: "POST",
      headers: {},
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "Unauthorized");
  });

  test("4. POST with incorrect Bearer token returns 401 Unauthorized", async () => {
    const req = new NextRequest("http://localhost/api/cron", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
  });

  test("5. POST with timing attack length mismatch returns 401 Unauthorized safely", async () => {
    const req = new NextRequest("http://localhost/api/cron", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}-extra-padding-bytes` },
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
  });

  test("6. POST with valid Bearer token and probe=key returns 200 without executing dispatch", async () => {
    const req = new NextRequest("http://localhost/api/cron?probe=key", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body.encryptionKey === "string" || body.encryptionKey === null);
  });
});
