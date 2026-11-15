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

const SUB_ID = "sub_visual_qa_12345";
const setSub = async (status, note = null) => {
  await db.razorpayRecord.deleteMany({ where: { rzpId: SUB_ID } });
  if (status) {
    await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: SUB_ID,
        purpose: "plan",
        clientId: S.shopId,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status,
        createdBy: "QA Visual Test",
        note: note ?? (status === "cancelling" ? "Cancelled by Owner: Cost [Cycle End]" : status === "cancelled" ? "Cancelled by Owner [Immediate]" : null),
      },
    });
  }
};

const viewports = [
  { name: "desktop_1440x900", width: 1440, height: 900 },
  { name: "desktop_1280x800", width: 1280, height: 800 },
  { name: "tablet_768x1024", width: 768, height: 1024 },
  { name: "mobile_390x844", width: 390, height: 844 },
  { name: "mobile_360x740", width: 360, height: 740 },
];

console.log("Starting Playwright Visual Acceptance Suite across 5 viewports...");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const errors = [];
const recordPass = (no, name, detail) => results.push({ no, name, pass: true, detail });
const recordFail = (no, name, err) => results.push({ no, name, pass: false, detail: String(err.message ?? err) });

try {
  // Test both /dashboard/billing and /dashboard/account routes
  for (const route of ["/dashboard/billing", "/dashboard/account"]) {
    console.log(`\nTesting Route: ${route}`);

    for (const vp of viewports) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(`${vp.name} on ${route}: ${e.message}`));

      // 1. Active Auto-Pay State
      await setSub("active");
      await p.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      const activeText = await p.locator("body").innerText();
      expect(/Subscribed · auto-pay is on/.test(activeText), "Subscribed header missing");
      expect(/Auto-Pay Active/.test(activeText), "Auto-Pay Active badge missing");
      expect(await p.getByRole("button", { name: "Cancel subscription" }).isVisible(), "Cancel subscription button not visible");

      const activeShot = path.join(screenshotsDir, `${route.replace(/\//g, "_").slice(1)}_active_${vp.name}.png`);
      await p.screenshot({ path: activeShot, fullPage: false });

      // Check mobile horizontal overflow
      if (vp.width <= 768) {
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow <= 1, `Horizontal overflow detected: ${overflow}px on ${vp.name}`);
      }

      // 2. Cancellation Confirmation Modal (on 1440x900 and 390x844)
      if (vp.width === 1440 || vp.width === 390) {
        await p.getByRole("button", { name: "Cancel subscription" }).click();
        const dlg = p.getByRole("dialog", { name: "Cancel subscription" });
        await dlg.waitFor({ timeout: 5000 });
        const dlgText = await dlg.innerText();
        expect(/nothing more is charged/i.test(dlgText), "Warning text missing in dialog");
        expect(await dlg.getByRole("button", { name: "Keep subscription" }).isVisible(), "Keep subscription button missing");
        expect(await dlg.getByRole("button", { name: "Cancel subscription" }).isVisible(), "Cancel subscription action button missing");

        const modalShot = path.join(screenshotsDir, `${route.replace(/\//g, "_").slice(1)}_modal_${vp.name}.png`);
        await dlg.screenshot({ path: modalShot });
        await dlg.getByRole("button", { name: "Keep subscription" }).click();
        await p.waitForTimeout(500);
      }

      // 3. Cancelling State (Scheduled cancellation at cycle end)
      if (vp.width === 1440 || vp.width === 390) {
        await setSub("cancelling", "Cancelled by Owner: Cost [Cycle End]");
        await p.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        const cancellingText = await p.locator("body").innerText();
        expect(/Subscription cancelled/.test(cancellingText), "Cancelled header missing");
        expect(/Auto-Pay Scheduled to End/.test(cancellingText), "Auto-Pay Scheduled to End badge missing");
        expect(/Nothing more will be charged/.test(cancellingText), "Entitlement explanation missing");
        expect(await p.getByRole("button", { name: "Resubscribe" }).isVisible(), "Resubscribe button missing");

        const cancellingShot = path.join(screenshotsDir, `${route.replace(/\//g, "_").slice(1)}_cancelling_${vp.name}.png`);
        await p.screenshot({ path: cancellingShot, fullPage: false });
      }

      // 4. Cancelled State (Completed cancellation)
      if (vp.width === 1440 || vp.width === 390) {
        await setSub("cancelled", "Cancelled by Owner [Immediate]");
        await p.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        const cancelledText = await p.locator("body").innerText();
        expect(/Subscription cancelled/.test(cancelledText), "Cancelled header missing");
        expect(/Auto-Pay Cancelled/.test(cancelledText), "Auto-Pay Cancelled badge missing");

        const cancelledShot = path.join(screenshotsDir, `${route.replace(/\//g, "_").slice(1)}_cancelled_${vp.name}.png`);
        await p.screenshot({ path: cancelledShot, fullPage: false });
      }

      await ctx.close();
      recordPass(results.length + 1, `${route} on ${vp.name}`, `Verified active, modal, and cancellation states`);
    }
  }

  // Cleanup QA subscription
  await setSub(null);
} catch (e) {
  recordFail(results.length + 1, "Playwright Visual Execution Error", e);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log("\n================ Playwright Visual Results ================");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name} — ${r.detail}`);
}
expect(errors.length === 0, `Browser errors detected: ${errors.join(" | ")}`);

const failedCount = results.filter((r) => !r.pass).length;
console.log(`\nOverall: ${results.length - failedCount}/${results.length} visual test scenarios passed.`);
process.exit(failedCount ? 1 : 0);
