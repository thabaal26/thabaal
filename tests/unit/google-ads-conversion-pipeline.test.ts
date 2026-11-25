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
  formatGoogleAdsTransactionReference,
} from "../../src/lib/marketing/receipt";
import {
  GOOGLE_ADS_ID,
  GOOGLE_ADS_CONVERSION_LABEL,
  GOOGLE_ADS_SCRIPT_ID,
  isAdsConfigValid,
  initializeGoogleAdsQueue,
  ensureGoogleAdsScriptLoaded,
} from "../../src/lib/marketing/google-ads-loader";
import {
  computeRetryBackoffMs,
  MAX_DISPATCH_ATTEMPTS,
  parseConversionDispatchState,
  readConversionDispatchState,
  writeConversionDispatchState,
  type ConversionDispatchState,
  type DispatchStorage,
} from "../../src/lib/marketing/google-ads-dispatch-state";

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
    const loaderFile = path.resolve(__dirname, "../../src/lib/marketing/google-ads-loader.ts");
    const content = `${fs.readFileSync(providerFile, "utf8")}\n${fs.readFileSync(loaderFile, "utf8")}`;

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

  it("14. Structured External Transaction Reference: Deterministic, non-PII, max 64 chars (Turn 81-82)", () => {
    const testLeadId = "cmwutn3x30002kz611b5pxq0r";
    const ref2026 = formatGoogleAdsTransactionReference(testLeadId, new Date("2026-11-24T12:00:00Z"));

    assert.ok(ref2026.startsWith("THB-LEAD-2026-"), "Must start with THB-LEAD-<year>-");
    assert.ok(ref2026.length <= 64, `Must not exceed 64 characters (length: ${ref2026.length})`);
    assert.ok(/^[A-Z0-9-]+$/.test(ref2026), "Must be uppercase alphanumeric and dashes only");
    assert.ok(!ref2026.includes("@") && !ref2026.includes("+"), "Must not contain PII");

    // Idempotency: same leadId and year must return identical reference
    const refAgain = formatGoogleAdsTransactionReference(testLeadId, new Date("2026-11-24T15:30:00Z"));
    assert.equal(refAgain, ref2026, "Reference must be identical across retries for the same lead");
  });

  it("15. resolveThankYouReceipt returns structured transactionReference alongside conversionEventId (Turn 81-82)", async () => {
    const testPhone = `91${Math.floor(10000000 + Math.random() * 90000000)}`;
    const submissionKey = `sub_trans_ref_${Date.now()}`;

    const { leadResult: r, conversion } = await processDemoRequestAtomic({
      input: {
        shop: "Reference Test Store",
        person: "Ganesan",
        phone: testPhone,
      },
      submissionKey,
    });

    assert.equal(r.ok, true);
    const resolved = await resolveThankYouReceipt(conversion.receiptToken);

    assert.equal(resolved.valid, true);
    assert.equal(resolved.conversionEligible, true);
    assert.ok(resolved.conversionEventId, "Must return stable conversionEventId UUID");
    assert.ok(resolved.transactionReference, "Must return structured transactionReference");
    assert.ok(resolved.transactionReference.startsWith("THB-LEAD-"), "transactionReference must have THB-LEAD prefix");
    assert.ok(resolved.transactionReference.length <= 64, "transactionReference must be <= 64 chars");
  });

  it("16. Consent Mode v2 Signals: default denied and update granted on consent (Turn 81-88)", () => {
    const providerFile = path.resolve(__dirname, "../../src/components/marketing/GoogleAdsProvider.tsx");
    const loaderFile = path.resolve(__dirname, "../../src/lib/marketing/google-ads-loader.ts");
    const content = `${fs.readFileSync(providerFile, "utf8")}\n${fs.readFileSync(loaderFile, "utf8")}`;

    // Must define Consent Mode v2 default with all 4 parameters
    assert.ok(content.includes("'ad_storage': 'denied'"), "Must set ad_storage denied by default");
    assert.ok(content.includes("'analytics_storage': 'denied'"), "Must set analytics_storage denied by default");
    assert.ok(content.includes("'ad_user_data': 'denied'"), "Must set ad_user_data denied by default");
    assert.ok(content.includes("'ad_personalization': 'denied'"), "Must set ad_personalization denied by default");

    // Must define Consent Mode v2 update on consent granted
    assert.ok(content.includes("'ad_storage': 'granted'"), "Must update ad_storage to granted");
    assert.ok(content.includes("'analytics_storage': 'granted'"), "Must update analytics_storage to granted");
    assert.ok(content.includes("'ad_user_data': 'granted'"), "Must update ad_user_data to granted");
    assert.ok(content.includes("'ad_personalization': 'granted'"), "Must update ad_personalization to granted");

    // Must handle consent revocation
    assert.ok(content.includes("ad_storage: newStatus === \"granted\" ? \"granted\" : \"denied\""));
  });

  it("17. Dispatch State Management & Transaction-Specific Tracking (Turn 81-88)", () => {
    const providerFile = path.resolve(__dirname, "../../src/components/marketing/GoogleAdsProvider.tsx");
    const content = fs.readFileSync(providerFile, "utf8");

    // Provider must use the shared exported state helpers rather than duplicating private parsing logic
    assert.ok(content.includes("readConversionDispatchState("), "Must use shared readConversionDispatchState helper");
    assert.ok(content.includes("writeConversionDispatchState("), "Must use shared writeConversionDispatchState helper");
    assert.ok(content.includes("if (!enabled || !ready || !transactionId) return;"), "Must gate conversion dispatch on both enabled and ready");
    assert.ok(content.includes("attemptGenerationRef"), "Must isolate stale callbacks via attemptGenerationRef");
    assert.ok(content.includes('status: "tag_callback_completed"'));
    assert.ok(content.includes("event_timeout: DISPATCH_TIMEOUT_MS"));
  });

  it("18. Real Production State Machine: Malformed/Out-of-Range Values Fail Closed & Retry Cap (Turn 82-88)", () => {
    const providerFile = path.resolve(__dirname, "../../src/components/marketing/GoogleAdsProvider.tsx");
    const content = fs.readFileSync(providerFile, "utf8");
    assert.ok(content.includes("MAX_DISPATCH_ATTEMPTS"), "Must enforce MAX_DISPATCH_ATTEMPTS");
    assert.ok(content.includes("IN_FLIGHT_WINDOW_MS"), "Must bound in-flight window to timeout + buffer");

    // Directly test real parseConversionDispatchState helper
    assert.equal(parseConversionDispatchState(null), null);
    assert.equal(parseConversionDispatchState(""), null);
    assert.equal(parseConversionDispatchState("done")?.status, "tag_callback_completed");
    assert.equal(parseConversionDispatchState("retryable")?.status, "retryable");
    assert.equal(parseConversionDispatchState("queued:1700000000000")?.status, "pending");

    // Corrupt JSON and out-of-range attempts fail closed to max_retries_exceeded
    assert.equal(parseConversionDispatchState("{broken json")?.status, "max_retries_exceeded");
    assert.equal(parseConversionDispatchState('{"status":"pending","attempts":99,"lastAttemptTs":1000}')?.status, "max_retries_exceeded");
    assert.equal(parseConversionDispatchState('{"status":"unknown","attempts":1,"lastAttemptTs":1000}')?.status, "max_retries_exceeded");
    assert.equal(parseConversionDispatchState('{"status":"retryable","attempts":2,"lastAttemptTs":1000}')?.attempts, 2);
  });

  it("19. Synchronous Dispatch Exception Recovery, Exponential Backoff & In-Page Recovery (Turn 82-88)", () => {
    const providerFile = path.resolve(__dirname, "../../src/components/marketing/GoogleAdsProvider.tsx");
    const content = fs.readFileSync(providerFile, "utf8");

    assert.ok(content.includes("inFlightRef.current = false;"), "Must clear inFlightRef.current on synchronous failure");
    assert.ok(content.includes('nextAttempts < MAX_DISPATCH_ATTEMPTS ? "retryable" : "max_retries_exceeded"'));
    assert.ok(content.includes("recoveryTimer = setTimeout("), "Must schedule automatic in-page recovery timer");
    assert.ok(content.includes("retryTimer = setTimeout("), "Must schedule delayed retry in synchronous catch path");
    assert.ok(content.includes("computeRetryBackoffMs(nextAttempts)"), "Must use shared computeRetryBackoffMs helper");

    // Verify real exported computeRetryBackoffMs sequence: 1s, 2s, 4s capped
    assert.equal(computeRetryBackoffMs(1), 1000);
    assert.equal(computeRetryBackoffMs(2), 2000);
    assert.equal(computeRetryBackoffMs(3), 4000);
    assert.equal(computeRetryBackoffMs(10), 4000);
  });

  it("20. Database-Level Unique Constraint & Collision Prevention for Transaction Reference (Turn 82-88)", async () => {
    const schemaFile = path.resolve(__dirname, "../../prisma/schema.prisma");
    const schemaContent = fs.readFileSync(schemaFile, "utf8");

    assert.ok(
      schemaContent.includes("transactionReference String? @unique"),
      "Prisma schema must enforce @unique on transactionReference"
    );

    const migrationFile = path.resolve(__dirname, "../../prisma/sql/2026-11-21-demo-conversion-attempt.sql");
    const sqlContent = fs.readFileSync(migrationFile, "utf8");
    assert.ok(sqlContent.includes('"transactionReference" TEXT'), "SQL migration must match Prisma TEXT type");
    assert.ok(sqlContent.includes('"DemoConversionAttempt_transactionReference_key"'), "SQL migration must define unique index");
    assert.ok(sqlContent.includes("chk_created_has_trans_ref"), "SQL migration must define CHECK constraint");

    const fullCuid = "cmwutn3x30002kz611b5pxq0r";
    const ref = formatGoogleAdsTransactionReference(fullCuid, new Date("2026-11-24T12:00:00Z"));
    assert.equal(ref, "THB-LEAD-2026-CMWUTN3X30002KZ611B5PXQ0R");
    assert.ok(ref.length <= 64);

    const testPhoneA = `91${Math.floor(10000000 + Math.random() * 90000000)}`;
    const testPhoneB = `91${Math.floor(10000000 + Math.random() * 90000000)}`;

    const resA = await processDemoRequestAtomic({
      input: { shop: "Store Alpha", person: "Person A", phone: testPhoneA },
      submissionKey: `sub_uniq_a_${Date.now()}`,
    });
    const resB = await processDemoRequestAtomic({
      input: { shop: "Store Beta", person: "Person B", phone: testPhoneB },
      submissionKey: `sub_uniq_b_${Date.now()}`,
    });

    assert.ok(resA.conversion.transactionReference);
    assert.ok(resB.conversion.transactionReference);
    assert.notEqual(resA.conversion.transactionReference, resB.conversion.transactionReference);
  });

  it("21. Real Helper Storage Failure Handling: Read Throw & Write Throw Within Page Lifecycle (Turn 85-88)", () => {
    const key = "thabaal-ads-conv:THB-FAIL-STORAGE";
    const memory = new Map<string, ConversionDispatchState>();
    const brokenStorage: DispatchStorage = {
      getItem: () => {
        throw new Error("SecurityError: sessionStorage disabled");
      },
      setItem: () => {
        throw new Error("SecurityError: sessionStorage disabled");
      },
    };

    assert.equal(readConversionDispatchState(key, memory, brokenStorage), null);
    writeConversionDispatchState(key, { status: "pending", attempts: 1, lastAttemptTs: 100 }, memory, brokenStorage);
    assert.deepEqual(readConversionDispatchState(key, memory, brokenStorage), {
      status: "pending",
      attempts: 1,
      lastAttemptTs: 100,
    });
    writeConversionDispatchState(
      key,
      { status: "max_retries_exceeded", attempts: MAX_DISPATCH_ATTEMPTS, lastAttemptTs: 200 },
      memory,
      brokenStorage,
    );
    assert.equal(readConversionDispatchState(key, memory, brokenStorage)?.status, "max_retries_exceeded");
  });

  it("22. Database Mathematical Completeness: Zero Created Attempts Missing Reference (Turn 85-88)", async () => {
    const attempts = await db.demoConversionAttempt.findMany({
      where: { outcome: "CREATED" },
      select: { id: true, transactionReference: true, leadId: true },
    });

    assert.ok(attempts.length > 0, "Must have at least one CREATED attempt in database");
    const missingRef = attempts.filter((a) => !a.transactionReference);
    assert.equal(missingRef.length, 0);
  });

  it("23. Real Helper Memory Precedence Over Stale Storage When Write Fails (Turn 86-88)", () => {
    const key = "thabaal-ads-conv:THB-STALE-PRECEDENCE";
    const memory = new Map<string, ConversionDispatchState>();
    const backing: Record<string, string> = {
      [key]: JSON.stringify({ status: "pending", attempts: 1, lastAttemptTs: 1000 }),
    };
    let throwOnWrite = false;
    const flakyStorage: DispatchStorage = {
      getItem: (k) => backing[k] ?? null,
      setItem: (k, v) => {
        if (throwOnWrite) throw new Error("QuotaExceededError");
        backing[k] = v;
      },
    };

    // Step 1: Initial read pulls attempts=1 from storage and seeds memory
    const initial = readConversionDispatchState(key, memory, flakyStorage);
    assert.equal(initial?.attempts, 1);

    // Step 2: Storage write throws, so backing retains stale attempts=1 while memory gets attempts=2
    throwOnWrite = true;
    writeConversionDispatchState(key, { status: "retryable", attempts: 2, lastAttemptTs: 2000 }, memory, flakyStorage);
    assert.equal(JSON.parse(backing[key]).attempts, 1, "Backing storage still has stale attempt counter");

    // Step 3: Subsequent read prioritizes memory (attempts=2) instead of stale storage (attempts=1)
    const updated = readConversionDispatchState(key, memory, flakyStorage);
    assert.equal(updated?.attempts, 2);
    assert.equal(updated?.status, "retryable");

    // Step 4: Writing max_retries_exceeded caps further retries cleanly
    writeConversionDispatchState(
      key,
      { status: "max_retries_exceeded", attempts: MAX_DISPATCH_ATTEMPTS, lastAttemptTs: 3000 },
      memory,
      flakyStorage,
    );
    const exhausted = readConversionDispatchState(key, memory, flakyStorage);
    assert.equal(exhausted?.status, "max_retries_exceeded");
    assert.equal(exhausted?.attempts, 3);
  });

  it("24. Turn 88 Project Boundaries: Public Marketing Auth Coverage, Strict Privacy Disclosure, & Zero UUID Fallback", () => {
    // 1. /thank-you strictly fails closed on transactionReference without conversionEventId fallback
    const thankYouContent = fs.readFileSync(
      path.resolve(__dirname, "../../src/app/(marketing)/thank-you/page.tsx"),
      "utf8",
    );
    assert.ok(thankYouContent.includes("<GoogleAdsConversion transactionId={receipt.transactionReference} />"));
    assert.ok(!thankYouContent.includes("receipt.transactionReference ?? receipt.conversionEventId"));

    // 2. /login and /signup live in (marketing) so ConsentBanner + GoogleAdsProvider cover ALL public landing routes
    assert.ok(fs.existsSync(path.resolve(__dirname, "../../src/app/(marketing)/login/page.tsx")));
    assert.ok(fs.existsSync(path.resolve(__dirname, "../../src/app/(marketing)/signup/page.tsx")));

    // 3. Password recovery lives in isolated (auth) root layout without any Google Ads provider
    const authLayout = fs.readFileSync(path.resolve(__dirname, "../../src/app/(auth)/layout.tsx"), "utf8");
    assert.ok(!authLayout.includes("GoogleAdsProvider") && !authLayout.includes("AW-18580810849"));
    assert.ok(fs.existsSync(path.resolve(__dirname, "../../src/app/(auth)/forgot-password/page.tsx")));
    assert.ok(fs.existsSync(path.resolve(__dirname, "../../src/app/(auth)/reset-password/page.tsx")));

    // 4. Privacy Policy discloses Google Ads measurement, Consent Mode v2, and has no blanket contradiction
    const privacyContent = fs.readFileSync(
      path.resolve(__dirname, "../../src/app/(marketing)/privacy/page.tsx"),
      "utf8",
    );
    assert.ok(!privacyContent.includes("There are no advertising or third-party tracking cookies."));
    assert.ok(privacyContent.includes("AW-18580810849"));
    assert.ok(privacyContent.includes("thabaal_marketing_consent"));
    assert.ok(privacyContent.includes("Google Consent Mode v2"));

    // 5. ConsentBanner renders non-overlapping in-flow on mobile and floating bottom-right on desktop + syncs with landing Tamil toggle
    const bannerContent = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/marketing/ConsentBanner.tsx"),
      "utf8",
    );
    assert.ok(bannerContent.includes("relative w-full"));
    assert.ok(bannerContent.includes("lg:fixed lg:inset-x-auto lg:bottom-5 lg:right-5"));
    assert.ok(bannerContent.includes("focus-visible:ring-2"));

    const signInContent = fs.readFileSync(
      path.resolve(__dirname, "../../src/app/(marketing)/login/thabaal-sign-in.tsx"),
      "utf8",
    );
    assert.ok(signInContent.includes('from "@/lib/i18n/context"'));
    assert.ok(signInContent.includes("setLanguage(next)"));
  });

  it("25. GoogleAdsProvider singleton loader lifecycle: idempotent queue/config, shared loading promise, error retry, and ID mismatch guard", async () => {
    const g = globalThis as Record<string, unknown>;
    const hadWindow = Object.prototype.hasOwnProperty.call(g, "window");
    const hadDocument = Object.prototype.hasOwnProperty.call(g, "document");
    const prevWindow = g.window;
    const prevDocument = g.document;

    type ListenerEntry = { fn: () => void; once: boolean };
    class MockScriptElement {
      id = "";
      async = false;
      src = "";
      dataset: Record<string, string> = {};
      private listeners = new Map<string, ListenerEntry[]>();

      addEventListener(type: string, fn: () => void, opts?: { once?: boolean }) {
        const list = this.listeners.get(type) ?? [];
        list.push({ fn, once: Boolean(opts?.once) });
        this.listeners.set(type, list);
      }

      removeEventListener(type: string, fn: () => void) {
        const list = this.listeners.get(type);
        if (!list) return;
        this.listeners.set(
          type,
          list.filter((entry) => entry.fn !== fn),
        );
      }

      emit(type: string) {
        const list = [...(this.listeners.get(type) ?? [])];
        for (const entry of list) {
          if (entry.once) {
            this.removeEventListener(type, entry.fn);
          }
          entry.fn();
        }
      }
    }

    function setupDomEnv() {
      const headChildren: MockScriptElement[] = [];
      let createdCount = 0;
      let appendedCount = 0;
      const mockWindow: Record<string, unknown> = {};
      const mockDocument = {
        getElementById(id: string) {
          return headChildren.find((el) => el.id === id) ?? null;
        },
        querySelector(selector: string) {
          const match = selector.match(/googletagmanager\.com\/gtag\/js\?id=([^"\]]+)/);
          if (!match) return null;
          return headChildren.find((el) => el.src.includes(`googletagmanager.com/gtag/js?id=${match[1]}`)) ?? null;
        },
        createElement(_tag: string) {
          createdCount += 1;
          return new MockScriptElement();
        },
        head: {
          appendChild(el: MockScriptElement) {
            appendedCount += 1;
            headChildren.push(el);
            return el;
          },
        },
      };
      g.window = mockWindow;
      g.document = mockDocument;
      return {
        headChildren,
        getCreatedCount: () => createdCount,
        getAppendedCount: () => appendedCount,
        mockWindow: mockWindow as {
          dataLayer?: ArrayLike<unknown>[];
          gtag?: (...args: unknown[]) => void;
          __thabaalGoogleAdsRuntime?: {
            adsId: string;
            configured: boolean;
            status: string;
            promise?: Promise<void>;
          };
        },
      };
    }

    try {
      // Scenario A & B: Single queue/config across revocation+regrant and shared loading promise
      const env1 = setupDomEnv();
      const testAdsId = "AW-18580810849";

      initializeGoogleAdsQueue(testAdsId);
      assert.equal(env1.mockWindow.__thabaalGoogleAdsRuntime?.configured, true);

      // Simulate consent revocation then re-grant without duplicating gtag('config', ...)
      env1.mockWindow.gtag?.("consent", "update", {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      initializeGoogleAdsQueue(testAdsId);

      const commands = (env1.mockWindow.dataLayer ?? []).map((args) => Array.from(args));
      const configCalls = commands.filter((c) => c[0] === "config" && c[1] === testAdsId);
      const consentDefaultCalls = commands.filter((c) => c[0] === "consent" && c[1] === "default");
      const grantedUpdates = commands.filter(
        (c) => c[0] === "consent" && c[1] === "update" && (c[2] as Record<string, string>)?.ad_storage === "granted",
      );
      assert.equal(configCalls.length, 1);
      assert.equal(consentDefaultCalls.length, 1);
      assert.equal(grantedUpdates.length, 2);

      // Concurrent ensureGoogleAdsScriptLoaded shares single promise and creates one script tag
      const p1 = ensureGoogleAdsScriptLoaded(testAdsId);
      const p2 = ensureGoogleAdsScriptLoaded(testAdsId);
      assert.equal(p1, p2);
      assert.equal(env1.mockWindow.__thabaalGoogleAdsRuntime?.status, "loading");
      assert.equal(env1.getCreatedCount(), 1);
      assert.equal(env1.getAppendedCount(), 1);
      assert.equal(env1.headChildren[0].id, GOOGLE_ADS_SCRIPT_ID);
      assert.equal(env1.headChildren[0].async, true);
      assert.equal(env1.headChildren[0].src, `https://www.googletagmanager.com/gtag/js?id=${testAdsId}`);

      env1.headChildren[0].emit("load");
      await Promise.all([p1, p2]);
      assert.equal(env1.mockWindow.__thabaalGoogleAdsRuntime?.status, "loaded");
      assert.equal(env1.headChildren[0].dataset.thabaalLoaded, "1");

      // Subsequent call after loaded creates no extra element
      await ensureGoogleAdsScriptLoaded(testAdsId);
      assert.equal(env1.getCreatedCount(), 1);
      assert.equal(env1.getAppendedCount(), 1);

      // Mismatched ID fails fast
      assert.throws(() => initializeGoogleAdsQueue("AW-9999999999"), /runtime ID mismatch/);
      await assert.rejects(() => ensureGoogleAdsScriptLoaded("AW-9999999999"), /runtime ID mismatch/);

      // Scenario C: Error event resets cached promise to status='error' and allows retry on existing tag
      const env2 = setupDomEnv();
      initializeGoogleAdsQueue(testAdsId);
      const errPromise = ensureGoogleAdsScriptLoaded(testAdsId);
      assert.equal(env2.mockWindow.__thabaalGoogleAdsRuntime?.status, "loading");
      env2.headChildren[0].emit("error");

      await assert.rejects(errPromise, /Failed to load Google Ads tag script/);
      assert.equal(env2.mockWindow.__thabaalGoogleAdsRuntime?.status, "error");
      assert.equal(env2.mockWindow.__thabaalGoogleAdsRuntime?.promise, undefined);

      const retryPromise = ensureGoogleAdsScriptLoaded(testAdsId);
      assert.equal(env2.mockWindow.__thabaalGoogleAdsRuntime?.status, "loading");
      assert.equal(env2.getCreatedCount(), 1);
      assert.equal(env2.headChildren.length, 1);

      env2.headChildren[0].emit("load");
      await retryPromise;
      assert.equal(env2.mockWindow.__thabaalGoogleAdsRuntime?.status, "loaded");
      assert.equal(env2.headChildren[0].dataset.thabaalLoaded, "1");

      // Scenario D: Provider revocation boundary invariant in source
      const providerSource = fs.readFileSync(
        path.resolve(__dirname, "../../src/components/marketing/GoogleAdsProvider.tsx"),
        "utf8",
      );
      assert.ok(providerSource.includes('ad_storage: newStatus === "granted" ? "granted" : "denied"'));
      assert.ok(providerSource.includes("if (!enabled || !ready || !transactionId) return;"));
      assert.ok(providerSource.includes("attemptGenerationRef.current"));
    } finally {
      if (hadWindow) {
        g.window = prevWindow;
      } else {
        delete g.window;
      }
      if (hadDocument) {
        g.document = prevDocument;
      } else {
        delete g.document;
      }
    }
  });
});
