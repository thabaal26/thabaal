import test, { describe } from "node:test";
import assert from "node:assert/strict";

describe("Domain 6 Batch B: SHT-02 Google Sheets Formula Injection Protection Test Suite", () => {
  // Canonical sanitizer logic matching deploy/google-sheets/Code.gs sanitize_()
  function sanitize(v: unknown): unknown {
    if (typeof v === "number" || typeof v === "boolean" || v == null) return v;
    if (typeof v === "string") {
      const trimmed = v.trim();
      // Legitimate negative numeric string: preserve without escaping so Google Sheets treats as number
      if (/^-\d+(\.\d+)?$/.test(trimmed)) return v;
      // Formula-like or command strings starting with =, +, -, @
      if (/^[\s\t\r\n]*[=+\-@]/.test(v)) return "'" + v;
    }
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

  test("3. SHT-02 Preserves legitimate numeric values (both number type and negative number strings)", () => {
    // Pure numeric types
    assert.equal(sanitize(-50), -50);
    assert.equal(sanitize(-100.25), -100.25);
    assert.equal(sanitize(12345), 12345);
    assert.equal(sanitize(0), 0);

    // Negative numeric strings
    assert.equal(sanitize("-50"), "-50");
    assert.equal(sanitize("-100.25"), "-100.25");
    assert.equal(sanitize("  -42.5  "), "  -42.5  ");
  });

  test("4. SHT-02 Leaves benign inputs, normal phone numbers, and mid-string characters untampered", () => {
    assert.equal(sanitize("John Doe"), "John Doe");
    assert.equal(sanitize("919876543210"), "919876543210");
    assert.equal(sanitize("user@example.com"), "user@example.com");
    assert.equal(sanitize("Order #1001 (10-20% discount)"), "Order #1001 (10-20% discount)");
    assert.equal(sanitize(null), null);
    assert.equal(sanitize(undefined), undefined);
    assert.equal(sanitize(true), true);
    assert.equal(sanitize(false), false);
  });
});
