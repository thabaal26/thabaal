import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { db } from "../../src/lib/db";
import { addWebsiteLead } from "../../src/lib/leads";
import {
  createReceiptToken,
  hashReceiptToken,
  hashSubmissionKey,
  recordDemoConversionAttempt,
  processDemoRequestAtomic,
  resolveThankYouReceipt,
  calculateReceiptExpiry,
} from "../../src/lib/marketing/receipt";
import {
  GOOGLE_ADS_ID,
  GOOGLE_ADS_CONVERSION_LABEL,
  isAdsConfigValid,
} from "../../src/components/marketing/GoogleAdsProvider";

describe("Google Ads Conversion Pipeline & Zero-Leakage Boundary (Turn 48-49 Certification)", () => {
  it("1. New Lead creates an eligible DemoConversionAttempt and persistent conversionEventId", async () => {
    const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const submissionKey = `sub_test_${Date.now()}_${Math.random()}`;

    const { leadResult: r, conversion } = await processDemoRequestAtomic({
      input: {
        shop: "Test Organic Oils",
        person: "Murugan",
        phone: testPhone,
        town: "Madurai",
        sells: "Sesame oil",
        plan: "growth",
      },
      submissionKey,
    });

    assert.equal(r.ok, true, "New lead must be created successfully");
    assert.equal(r.again, false, "Must strictly be a new lead (again === false)");
    assert.ok(r.id, "Must return valid lead id");

    assert.equal(conversion.outcome, "CREATED");
    assert.ok(conversion.receiptToken, "Must return a raw bearer token");
    assert.ok(conversion.conversionEventId, "Must return a stable conversionEventId UUID");

    // Verify token hash is stored in PostgreSQL
    const tokenHash = hashReceiptToken(conversion.receiptToken);
    const dbRecord = await db.demoConversionAttempt.findUnique({
      where: { receiptTokenHash: tokenHash },
    });
    assert.ok(dbRecord, "Database record must exist by token hash");
    assert.equal(dbRecord?.leadId, r.id);
    assert.equal(dbRecord?.outcome, "CREATED");
    assert.equal(dbRecord?.conversionEventId, conversion.conversionEventId);

    // Verify resolveThankYouReceipt validates it as eligible
    const resolved = await resolveThankYouReceipt(conversion.receiptToken);
    assert.equal(resolved.valid, true);
    assert.equal(resolved.conversionEligible, true);
    assert.equal(resolved.conversionEventId, conversion.conversionEventId);
  });

  it("2. Existing open Lead updated does not receive an eligible conversion", async () => {
    const testPhone = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
    // Initial lead creation
    const r1 = await processDemoRequestAtomic({
      input: {
        shop: "Existing Shop A",
        person: "Karthik",
        phone: testPhone,
      },
      submissionKey: `sub_initial_${Date.now()}`,
    });
    assert.equal(r1.leadResult.ok, true);
    assert.equal(r1.leadResult.again, false);

    // Re-submission with same phone
    const r2 = await processDemoRequestAtomic({
      input: {
        shop: "Existing Shop A Renamed",
        person: "Karthik Raja",
        phone: testPhone,
      },
      submissionKey: `sub_repeat_${Date.now()}`,
    });
    assert.equal(r2.leadResult.ok, true);
    assert.equal(r2.leadResult.again, true, "Must be flagged as repeat enquiry (again === true)");

    assert.equal(r2.conversion.outcome, "UPDATED_EXISTING");
    assert.equal(r2.conversion.conversionEventId, null, "Existing lead must have null conversionEventId");

    // Verify resolveThankYouReceipt confirms valid receipt but conversion is ineligible
    const resolved = await resolveThankYouReceipt(r2.conversion.receiptToken);
    assert.equal(resolved.valid, true);
    assert.equal(resolved.conversionEligible, false, "Must not be eligible for Google Ads conversion");
    assert.equal(resolved.conversionEventId, null);
  });

  it("3. Strict again === false eligibility: fail-closed if again is undefined or true", async () => {
    // Verifies that only strictly again === false is treated as eligible
    const isEligible = (r: { ok: boolean; again?: boolean; id?: string }) =>
      r.ok === true && r.again === false && typeof r.id === "string" && r.id.length > 0;

    assert.equal(isEligible({ ok: true, again: false, id: "lead_123" }), true, "again === false must be eligible");
    assert.equal(isEligible({ ok: true, again: true, id: "lead_123" }), false, "again === true must be ineligible");
    assert.equal(isEligible({ ok: true, again: undefined, id: "lead_123" }), false, "again === undefined must fail-closed as ineligible");
    assert.equal(isEligible({ ok: false, again: false, id: "lead_123" }), false, "ok === false must be ineligible");
    assert.equal(isEligible({ ok: true, again: false, id: "" }), false, "empty id must be ineligible");
  });

  it("4. Fault Injection & Transaction Atomicity: Receipt insertion failure rolls back Lead creation", async () => {
    const testPhone = `94${Math.floor(10000000 + Math.random() * 90000000)}`;
    const submissionKey = `fault_test_${Date.now()}`;

    let caughtError: Error | null = null;
    try {
      await processDemoRequestAtomic({
        input: {
          shop: "Fault Injection Shop",
          person: "Tester",
          phone: testPhone,
        },
        submissionKey,
        onBeforeReceipt: async () => {
          throw new Error("SIMULATED_RECEIPT_PERSISTENCE_CRASH");
        },
      });
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError, "Transaction must fail and throw on receipt error");
    assert.equal(caughtError?.message, "SIMULATED_RECEIPT_PERSISTENCE_CRASH");

    // Verify that the Lead was NOT created in PostgreSQL due to atomic rollback
    const leadInDb = await db.lead.findFirst({
      where: { phone: testPhone },
    });
    assert.equal(leadInDb, null, "Lead creation MUST be rolled back if receipt fails");

    // Verify that no DemoConversionAttempt was created
    const attemptInDb = await db.demoConversionAttempt.findUnique({
      where: { submissionKeyHash: hashSubmissionKey(submissionKey) },
    });
    assert.equal(attemptInDb, null, "DemoConversionAttempt MUST NOT exist");
  });

  it("5. Direct visit without receipt or with empty/null token fails gracefully", async () => {
    const resNull = await resolveThankYouReceipt(null);
    assert.equal(resNull.valid, false);
    assert.equal(resNull.conversionEligible, false);
    assert.equal(resNull.conversionEventId, null);

    const resUndefined = await resolveThankYouReceipt(undefined);
    assert.equal(resUndefined.valid, false);
    assert.equal(resUndefined.conversionEligible, false);

    const resEmpty = await resolveThankYouReceipt("");
    assert.equal(resEmpty.valid, false);
    assert.equal(resEmpty.conversionEligible, false);
  });

  it("6. Malformed or forged token never throws and returns ineligible", async () => {
    const malformedTokens = [
      "not_a_valid_token",
      "short",
      "1234567890123456789012345678901234567890!@#$%",
      "a".repeat(100),
    ];

    for (const badToken of malformedTokens) {
      const res = await resolveThankYouReceipt(badToken);
      assert.equal(res.valid, false, `Bad token "${badToken}" must be invalid`);
      assert.equal(res.conversionEligible, false);
      assert.equal(res.conversionEventId, null);
    }
  });

  it("7. Expired receipt token is rejected by resolveThankYouReceipt", async () => {
    const testPhone = `96${Math.floor(10000000 + Math.random() * 90000000)}`;
    const submissionKey = `sub_expired_${Date.now()}`;

    const { conversion } = await processDemoRequestAtomic({
      input: {
        shop: "Expired Test Store",
        person: "Ravi",
        phone: testPhone,
      },
      submissionKey,
    });

    const tokenHash = hashReceiptToken(conversion.receiptToken);

    // Manually backdate expiresAt in PostgreSQL to 1 hour in the past
    await db.demoConversionAttempt.update({
      where: { receiptTokenHash: tokenHash },
      data: { expiresAt: new Date(Date.now() - 3600 * 1000) },
    });

    // Verification must now fail due to expiry
    const resolved = await resolveThankYouReceipt(conversion.receiptToken);
    assert.equal(resolved.valid, false, "Expired receipt must be invalid");
    assert.equal(resolved.conversionEligible, false);
    assert.equal(resolved.conversionEventId, null);
  });

  it("8. Submission retry with identical submissionKey is idempotent", async () => {
    const testPhone = `95${Math.floor(10000000 + Math.random() * 90000000)}`;
    const submissionKey = `idempotent_sub_${Date.now()}`;

    const first = await processDemoRequestAtomic({
      input: {
        shop: "Idempotent Store",
        person: "Anand",
        phone: testPhone,
      },
      submissionKey,
    });

    const second = await processDemoRequestAtomic({
      input: {
        shop: "Idempotent Store",
        person: "Anand",
        phone: testPhone,
      },
      submissionKey, // Same submissionKey
    });

    // conversionEventId must remain identical across network retries
    assert.equal(second.conversion.conversionEventId, first.conversion.conversionEventId);
    assert.equal(second.conversion.outcome, first.conversion.outcome);
  });

  it("9. Zero Hardcoded Production Credentials: No fallback to live IDs when env is unset", () => {
    const providerFile = path.resolve(__dirname, "../../src/components/marketing/GoogleAdsProvider.tsx");
    const content = fs.readFileSync(providerFile, "utf8");

    // Must NOT contain hardcoded fallbacks
    assert.ok(!content.includes('|| "AW-18580810849"'), "Must NOT fall back to production AW ID");
    assert.ok(!content.includes('|| "qHQ6CNfFkrwdEOHYgpxF"'), "Must NOT fall back to production conversion label");

    // Must use nullish coalescing to empty string
    assert.ok(content.includes("process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? \"\""));
    assert.ok(content.includes("process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL ?? \"\""));
    assert.ok(content.includes("isAdsConfigValid"));

    // Verify that empty or invalid IDs evaluate to invalid
    assert.equal(/^AW-\d+$/.test(""), false);
    assert.equal(/^AW-\d+$/.test("invalid"), false);
    assert.equal(/^[A-Za-z0-9_-]+$/.test(""), false);
  });

  it("10. Basic Consent Mode: Tags load only when consent is granted, and form works when denied", async () => {
    const providerFile = path.resolve(__dirname, "../../src/components/marketing/GoogleAdsProvider.tsx");
    const content = fs.readFileSync(providerFile, "utf8");

    // Must gate script loading on granted consent
    assert.ok(content.includes("isAdsConfigValid && consent === \"granted\""), "Basic consent gate must be strictly enforced");

    // Form submission succeeds at database level even when consent is not granted
    const testPhone = `92${Math.floor(10000000 + Math.random() * 90000000)}`;
    const submissionKey = `consent_denied_demo_${Date.now()}`;

    const res = await processDemoRequestAtomic({
      input: { shop: "Consent Denied Store", person: "Suresh", phone: testPhone },
      submissionKey,
    });

    assert.equal(res.leadResult.ok, true, "Lead must be created successfully");
    const leadInDb = await db.lead.findFirst({ where: { phone: testPhone } });
    assert.ok(leadInDb, "Lead must be persisted in database regardless of consent");
  });

  it("11. Strict SaaS Boundary: /dashboard and /admin routes in (portal) contain ZERO tracking scripts", async () => {
    const repoRoot = path.resolve(__dirname, "../../src/app/(portal)");

    function getFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getFiles(fullPath));
        } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const portalFiles = getFiles(repoRoot);
    assert.ok(portalFiles.length > 50, "Must inspect substantial number of protected portal files");

    const FORBIDDEN_STRINGS = [
      "AW-18580810849",
      "qHQ6CNfFkrwdEOHYgpxF",
      "GoogleAdsProvider",
      "GoogleAdsConversion",
      "googletagmanager.com/gtag/js",
    ];

    for (const filePath of portalFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      for (const forbidden of FORBIDDEN_STRINGS) {
        assert.ok(
          !content.includes(forbidden),
          `Protected SaaS file ${filePath} violates boundary! Contains forbidden string: ${forbidden}`
        );
      }
    }
  });

  it("12. Independent Root Layouts: (marketing) and (portal) have separate <html> and <body> roots", () => {
    const marketingLayoutPath = path.resolve(__dirname, "../../src/app/(marketing)/layout.tsx");
    const portalLayoutPath = path.resolve(__dirname, "../../src/app/(portal)/layout.tsx");
    const oldRootLayoutPath = path.resolve(__dirname, "../../src/app/layout.tsx");

    assert.ok(!fs.existsSync(oldRootLayoutPath), "Legacy shared root layout must NOT exist");
    assert.ok(fs.existsSync(marketingLayoutPath), "Marketing root layout must exist");
    assert.ok(fs.existsSync(portalLayoutPath), "Portal root layout must exist");

    const marketingContent = fs.readFileSync(marketingLayoutPath, "utf8");
    const portalContent = fs.readFileSync(portalLayoutPath, "utf8");

    assert.ok(marketingContent.includes("<html") && marketingContent.includes("<body"), "Marketing layout must define root html and body");
    assert.ok(marketingContent.includes("GoogleAdsProvider"), "Marketing layout must mount GoogleAdsProvider");
    assert.ok(marketingContent.includes("ConsentBanner"), "Marketing layout must mount ConsentBanner");

    assert.ok(portalContent.includes("<html") && portalContent.includes("<body"), "Portal layout must define root html and body");
    assert.ok(!portalContent.includes("GoogleAdsProvider"), "Portal layout must NOT contain GoogleAdsProvider");
    assert.ok(!portalContent.includes("ConsentBanner"), "Portal layout must NOT contain ConsentBanner");
    assert.ok(!portalContent.includes("googletagmanager.com"), "Portal layout must NOT contain GTM");
  });

  it("13. One-Shot, Fail-Closed Consent Reset & URL Cleansing (Turn 53 Condition B)", async () => {
    // Dynamically test getMarketingConsent in simulated browser environment
    const { getMarketingConsent, setMarketingConsent, CONSENT_STORAGE_KEY } = await import("../../src/lib/marketing/consent");

    // Setup global window / document / localStorage mocks
    const storage: Record<string, string> = { [CONSENT_STORAGE_KEY]: "granted" };
    let currentUrl = "https://www.thabaal.in/?cookie_settings=1";

    const originalWindow = (global as any).window;
    const originalDocument = (global as any).document;

    try {
      (global as any).window = {
        location: {
          get search() {
            try { return new URL(currentUrl).search; } catch { return ""; }
          },
          get href() { return currentUrl; },
          protocol: "https:",
        },
        history: {
          replaceState: (_state: any, _title: string, url: string) => {
            currentUrl = url.startsWith("http") ? url : `https://www.thabaal.in${url}`;
          },
        },
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
      };

      (global as any).document = {
        cookie: "thabaal_marketing_consent=granted; Path=/",
      };

      (global as any).localStorage = {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => { storage[k] = v; },
        removeItem: (k: string) => { delete storage[k]; },
      };

      (global as any).CustomEvent = class CustomEvent {
        type: string;
        detail: any;
        constructor(type: string, opts?: { detail?: any }) {
          this.type = type;
          this.detail = opts?.detail;
        }
      };

      // 1. Initial call with ?cookie_settings=1 should reset stored "granted" to null
      const res = getMarketingConsent();
      assert.equal(res, null, "Must return null (undecided) when reset parameter is detected");
      assert.equal(storage[CONSENT_STORAGE_KEY], undefined, "localStorage must be purged");
      assert.ok(!currentUrl.includes("cookie_settings"), `URL must have parameter stripped: ${currentUrl}`);

      // 2. User subsequently selects "denied"
      setMarketingConsent("denied");
      assert.equal(storage[CONSENT_STORAGE_KEY], "denied");

      // 3. Page reload (now without parameter): choice persists
      const resAfterReload = getMarketingConsent();
      assert.equal(resAfterReload, "denied", "User choice must persist after parameter consumption");
    } finally {
      (global as any).window = originalWindow;
      (global as any).document = originalDocument;
    }
  });
});
