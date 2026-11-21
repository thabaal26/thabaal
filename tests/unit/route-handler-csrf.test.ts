import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { verifySameOrigin, rejectCrossSite } from "../../src/lib/csrf";

describe("CSRF-01: Route Handler Origin & Cross-Site Request Forgery Verification", () => {
  test("Scenario 1: Correct https://www.thabaal.in Origin is accepted", () => {
    const req = new Request("https://www.thabaal.in/api/upload", {
      method: "POST",
      headers: {
        host: "www.thabaal.in",
        origin: "https://www.thabaal.in",
        "sec-fetch-site": "same-origin",
      },
    });

    const res = verifySameOrigin(req);
    assert.equal(res.ok, true);
  });

  test("Scenario 2: Foreign Origin returns 403 rejection", () => {
    const req = new Request("https://www.thabaal.in/api/upload", {
      method: "POST",
      headers: {
        host: "www.thabaal.in",
        origin: "https://evil-attacker-site.com",
        "sec-fetch-site": "cross-site",
      },
    });

    const res = verifySameOrigin(req);
    assert.equal(res.ok, false);
    assert.match(res.reason ?? "", /Cross-site request blocked|does not match/);

    const httpResponse = rejectCrossSite(res.reason);
    assert.equal(httpResponse.status, 403);
  });

  test("Scenario 3: Origin null (sandboxed iframe / data URI) is strictly rejected", () => {
    const req = new Request("https://www.thabaal.in/api/upload", {
      method: "POST",
      headers: {
        host: "www.thabaal.in",
        origin: "null",
      },
    });

    const res = verifySameOrigin(req);
    assert.equal(res.ok, false);
    assert.match(res.reason ?? "", /null or opaque/);
  });

  test("Scenario 4: Malicious Referer suffix (e.g. www.thabaal.in.evil.com) is strictly rejected", () => {
    const req = new Request("https://www.thabaal.in/api/upload", {
      method: "POST",
      headers: {
        host: "www.thabaal.in",
        referer: "https://www.thabaal.in.attacker.org/steal",
      },
    });

    const res = verifySameOrigin(req);
    assert.equal(res.ok, false);
    assert.match(res.reason ?? "", /does not match/);
  });

  test("Scenario 5: Origin and Referer both absent on cookie-authenticated request is strictly rejected", () => {
    const req = new Request("https://www.thabaal.in/api/upload", {
      method: "POST",
      headers: {
        host: "www.thabaal.in",
        cookie: "wp_session=eyJhbGciOiJIUzI1NiJ9...; path=/",
      },
    });

    const res = verifySameOrigin(req);
    assert.equal(res.ok, false);
    assert.match(res.reason ?? "", /requires Origin or Referer/);
  });

  test("Scenario 6: Sec-Fetch-Site: cross-site triggers immediate rejection even if origin spoofed", () => {
    const req = new Request("https://www.thabaal.in/api/upload", {
      method: "POST",
      headers: {
        host: "www.thabaal.in",
        origin: "https://www.thabaal.in",
        "sec-fetch-site": "cross-site",
      },
    });

    const res = verifySameOrigin(req);
    assert.equal(res.ok, false);
    assert.match(res.reason ?? "", /Sec-Fetch-Site/);
  });

  test("Scenario 7: Sec-Fetch-Site same-site from untrusted sibling subdomain is rejected", () => {
    const req = new Request("https://www.thabaal.in/api/upload", {
      method: "POST",
      headers: {
        host: "www.thabaal.in",
        origin: "https://untrusted-subdomain.thabaal.in",
        "sec-fetch-site": "same-site",
      },
    });

    const res = verifySameOrigin(req);
    assert.equal(res.ok, false);
    assert.match(res.reason ?? "", /does not match/);
  });

  test("Scenario 8: Non-browser machine request without session cookies passes CSRF check (handled by webhook authenticator)", () => {
    const req = new Request("https://www.thabaal.in/api/webhook", {
      method: "POST",
      headers: {
        host: "www.thabaal.in",
        "x-hub-signature-256": "sha256=1234567890abcdef...",
      },
    });

    const res = verifySameOrigin(req);
    assert.equal(res.ok, true);
  });
});
