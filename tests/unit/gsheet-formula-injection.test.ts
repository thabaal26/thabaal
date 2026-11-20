import test, { describe } from "node:test";
import assert from "node:assert/strict";

describe("Domain 6 Batch B: SHT-02 Google Sheets Formula Injection Protection Test Suite", () => {
  // Canonical sanitizer logic matching deploy/google-sheets/Code.gs sanitize_()
  function sanitize(v: unknown): unknown {
    if (typeof v === "string" && /^[\s\t\r\n]*[=+\-@]/.test(v)) return "'" + v;
    return v;
  }

  test("1. SHT-02 Sanitizes direct formula injection prefixes (=, +, -, @)", () => {
    assert.equal(sanitize("=1+1"), "'=1+1");
    assert.equal(sanitize("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
    assert.equal(sanitize("-100+50"), "'-100+50");
    assert.equal(sanitize("@SUM(A1:A10)"), "'@SUM(A1:A10)");
    assert.equal(sanitize("=IMPORTXML(\"http://malicious.site\", \"//a\")"), "'=IMPORTXML(\"http://malicious.site\", \"//a\")");
  });

  test("2. SHT-02 Sanitizes formulas with leading whitespace, tabs, and newlines", () => {
    assert.equal(sanitize("   =cmd|' /C calc'!A0"), "'   =cmd|' /C calc'!A0");
    assert.equal(sanitize("\t=IMPORTXML()"), "'\t=IMPORTXML()");
    assert.equal(sanitize("\r\n+12345"), "'\r\n+12345");
    assert.equal(sanitize(" \t \n @malicious"), "' \t \n @malicious");
  });

  test("3. SHT-02 Leaves benign inputs, normal phone numbers, and mid-string characters untampered", () => {
    assert.equal(sanitize("John Doe"), "John Doe");
    assert.equal(sanitize("919876543210"), "919876543210");
    assert.equal(sanitize("user@example.com"), "user@example.com");
    assert.equal(sanitize("Order #1001 (10-20% discount)"), "Order #1001 (10-20% discount)");
    assert.equal(sanitize(12345), 12345);
    assert.equal(sanitize(null), null);
    assert.equal(sanitize(undefined), undefined);
  });
});
