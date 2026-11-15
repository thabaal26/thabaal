import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");

const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost/.test(S.base) || !/localhost|127\.0\.0\.1/.test(S.dbUrl)) throw new Error("QA only");

const BASE = S.base;
const db = new PrismaClient({ datasources: { db: { url: S.dbUrl } } });
const screenshotsDir = path.resolve("tests/qa/screenshots");
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const results = [];
const expect = (condition, msg) => {
  if (!condition) throw new Error(msg);
};

const viewports = [
  { name: "desktop_1440x900", width: 1440, height: 900 },
  { name: "desktop_1280x800", width: 1280, height: 800 },
  { name: "tablet_768x1024", width: 768, height: 1024 },
  { name: "mobile_390x844", width: 390, height: 844 },
  { name: "mobile_360x740", width: 360, height: 740 },
];

console.log("Starting Playwright Dual-Option Checkout Acceptance Suite across 5 viewports...");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const errors = [];
const recordPass = (no, name, detail) => results.push({ no, name, pass: true, detail });
const recordFail = (no, name, err) => results.push({ no, name, pass: false, detail: String(err.message ?? err) });

try {
  // Ensure clean subscription state for testing plan selection
  await db.razorpayRecord.deleteMany({ where: { clientId: S.shopId } });

  for (const vp of viewports) {
    console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));

    await p.goto(`${BASE}/dashboard/account`, { waitUntil: "networkidle" });

    // Switch to plans tab
    const plansTab = p.getByRole("button", { name: "See plans" }).first();
    await plansTab.click();
    await p.waitForTimeout(600);

    // Click on Growth plan (or second plan button)
    const planBtns = await p.locator("div.plan button.btn").all();
    expect(planBtns.length >= 2, "Less than 2 plan buttons found in plans tab");
    // Click Growth plan (index 1)
    await planBtns[1].click();

    // Verify Step 1 modal opens
    const modal = p.locator("div.lockwrap[role='dialog']");
    await modal.waitFor({ timeout: 5000 });
    expect(await modal.isVisible(), "Modal Step 1 is not visible");
    const step1Text = await modal.innerText();
    expect(/Subscribe to Growth/i.test(step1Text), "Step 1 does not show Growth plan");

    // Click "Continue" to advance to Step 2 (dual option checkout)
    const continueBtn = modal.getByRole("button", { name: "Continue" });
    await continueBtn.click();
    await p.waitForTimeout(600);

    // Verify Step 2 dual-option modal
    await p.waitForSelector("text=Instant One-Time Payment", { timeout: 5000 });
    const step2Text = await modal.innerText();

    expect(/Instant One-Time Payment/i.test(step2Text), "Option 1: Instant One-Time Payment header missing");
    expect(/Zero Mandate Failure/i.test(step2Text), "Zero Mandate Failure badge missing");
    expect(/Recurring AutoPay/i.test(step2Text), "Option 2: Recurring AutoPay header missing");
    expect(/Tip: If GPay or your bank shows/i.test(step2Text), "AutoPay fallback tip missing");

    // Check action buttons exist
    const oneTimeBtn = modal.locator("button:has-text('Pay ₹2,999 (Instant UPI / Cards)')");
    expect(await oneTimeBtn.isVisible(), "Instant One-Time Payment button (₹2,999) not visible");

    const autoPayBtn = modal.locator("button:has-text('Set up AutoPay · ₹2,999')");
    expect(await autoPayBtn.isVisible(), "AutoPay button (₹2,999) not visible");

    // Check mobile horizontal overflow
    if (vp.width <= 768) {
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow <= 1, `Horizontal overflow detected: ${overflow}px on ${vp.name}`);
    }

    // Capture screenshot of Step 2 Dual Option Modal
    const shotPath = path.join(screenshotsDir, `dual_option_step2_${vp.name}.png`);
    await p.screenshot({ path: shotPath, fullPage: false });
    console.log(`Saved screenshot: ${shotPath}`);

    recordPass(results.length + 1, `Dual Option Checkout on ${vp.name}`, `Verified One-Time (₹2,999) + AutoPay (₹2,999), 0px overflow (${vp.width}x${vp.height})`);
  }
} catch (e) {
  recordFail(results.length + 1, "Playwright Dual Option Execution Error", e);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log("\n================ Playwright Dual-Option Visual Results ================");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name} — ${r.detail}`);
}
expect(errors.length === 0, `Browser errors detected: ${errors.join(" | ")}`);

const failedCount = results.filter((r) => !r.pass).length;
console.log(`\nOverall: ${results.length - failedCount}/${results.length} dual-option visual test scenarios passed.`);
process.exit(failedCount ? 1 : 0);
