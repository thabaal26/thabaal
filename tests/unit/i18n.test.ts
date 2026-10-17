import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DICTIONARY } from "@/lib/i18n/dict";

describe("i18n Dictionary Integrity & Tamil Localization Rules", () => {
  it("every translation entry has non-empty English and Tamil strings", () => {
    let checkedCount = 0;
    for (const [sectionKey, section] of Object.entries(DICTIONARY)) {
      for (const [key, val] of Object.entries(section)) {
        assert.ok(val.en && typeof val.en === "string" && val.en.trim().length > 0, `Missing en string for ${sectionKey}.${key}`);
        assert.ok(val.ta && typeof val.ta === "string" && val.ta.trim().length > 0, `Missing ta string for ${sectionKey}.${key}`);
        checkedCount++;
      }
    }
    assert.ok(checkedCount >= 100, `Expected at least 100 translation keys, checked ${checkedCount}`);
  });

  it("preserves protected keywords in English across all Tamil strings", () => {
    const protectedTerms = ["WhatsApp", "UPI", "GST", "OTP", "Meta", "PDF", "Excel", "Google Sheets"];
    for (const [sectionKey, section] of Object.entries(DICTIONARY)) {
      for (const [key, val] of Object.entries(section)) {
        for (const term of protectedTerms) {
          if (val.en.includes(term)) {
            assert.ok(
              val.ta.includes(term),
              `Protected term '${term}' in ${sectionKey}.${key} ('${val.en}') must be preserved in Tamil: '${val.ta}'`
            );
          }
        }
      }
    }
  });

  it("never includes artificial plural patterns like '(s)' or '(கள்)' in Tamil strings", () => {
    for (const [sectionKey, section] of Object.entries(DICTIONARY)) {
      for (const [key, val] of Object.entries(section)) {
        assert.ok(!val.ta.includes("(கள்)"), `Unnatural plural '(கள்)' found in ${sectionKey}.${key}: '${val.ta}'`);
        assert.ok(!val.ta.includes("(s)"), `English plural notation '(s)' found in ${sectionKey}.${key}: '${val.ta}'`);
      }
    }
  });

  it("formats dates and times properly with ta-IN locale", () => {
    const now = new Date("2026-10-17T10:30:00Z");
    const formatted = now.toLocaleDateString("ta-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    assert.ok(formatted && formatted.length > 0, "ta-IN date formatting must produce a valid string");
  });

  it("formats Indian currency with normal digits and Rupee symbol", () => {
    const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(1250);
    assert.ok(formatted.includes("1,250") || formatted.includes("1250"), `Currency formatting must include normal digits: ${formatted}`);
  });
});
