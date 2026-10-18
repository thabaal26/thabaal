// Side-by-side screenshots of the sample design (thabaal-portal.html) and the QA app, page by page and tab by tab,
// for the design parity check. Writes .qa-shots/parity/<page>/{sample,app}-<tab>-<w>.png and a JSON list.
//   node tests/qa/parity-shots.mjs [sample=path] [widths=1366,390] [pages=index,orders]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const arg = (k, d) => process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d;
const SAMPLE = path.resolve(arg("sample", ".tmp-ui/sample.html"));
const BASE = arg("base", "http://localhost:3200");
const WIDTHS = arg("widths", "1366").split(",").map(Number);
const ONLY = arg("pages", "");

// Sample hash page → app path.
const PAGES = [
  ["index", "/dashboard"],
  ["inbox", "/dashboard/replies"],
  ["orders", "/dashboard/orders"],
  ["payments", "/dashboard/revenue"],
  ["customers", "/dashboard/customers"],
  ["products", "/dashboard/catalogue"],
  ["campaigns", "/dashboard/campaigns"],
  ["templates", "/dashboard/templates"],
  ["reports", "/dashboard/report"],
  ["settings", "/dashboard/settings"],
  ["guide", "/dashboard/guide"],
].filter(([p]) => !ONLY || ONLY.split(",").includes(p));

const OUT = ".qa-shots/parity";
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const report = [];

async function tabsOf(p, sel) {
  return p.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null).map((e) => (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)));
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "main";

// Sample
{
  const ctx = await b.newContext({ colorScheme: "light" });
  const p = await ctx.newPage();
  for (const w of WIDTHS) {
    await p.setViewportSize({ width: w, height: 900 });
    for (const [page] of PAGES) {
      await p.goto(`file:///${SAMPLE.replace(/\\/g, "/")}#${page}`);
      await p.waitForTimeout(400);
      const dir = path.join(OUT, page);
      fs.mkdirSync(dir, { recursive: true });
      const sel = `section.pg[data-page="${page}"] .tabs button`;
      const tabs = await tabsOf(p, sel);
      if (!tabs.length) {
        await p.screenshot({ path: path.join(dir, `sample-main-${w}.png`), fullPage: true });
      }
      for (let i = 0; i < tabs.length; i++) {
        await p.locator(sel).nth(i).click();
        await p.waitForTimeout(300);
        await p.screenshot({ path: path.join(dir, `sample-${slug(tabs[i])}-${w}.png`), fullPage: true });
      }
      report.push({ side: "sample", page, w, tabs });
    }
  }
  await ctx.close();
}

// App
{
  const ctx = await b.newContext({ colorScheme: "light" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await p.goto(BASE + "/login");
  await p.fill("input[type=email], input[name=email]", "manager@qa.test");
  await p.fill("input[type=password]", "qa-test-123");
  await p.click("button[type=submit]");
  await p.waitForURL(/dashboard/, { timeout: 30000 });
  for (const w of WIDTHS) {
    await p.setViewportSize({ width: w, height: 900 });
    for (const [page, url] of PAGES) {
      await p.goto(BASE + url, { waitUntil: "networkidle" });
      await p.waitForTimeout(500);
      const dir = path.join(OUT, page);
      fs.mkdirSync(dir, { recursive: true });
      const sel = ".wrapin .tabs > button, .wrapin .tabs > a, main .tabs > button, main .tabs > a";
      const tabs = await tabsOf(p, sel);
      if (!tabs.length) await p.screenshot({ path: path.join(dir, `app-main-${w}.png`), fullPage: true });
      for (let i = 0; i < tabs.length; i++) {
        await p.goto(BASE + url, { waitUntil: "networkidle" });
        const el = p.locator(sel).nth(i);
        if (await el.isVisible()) {
          await el.click();
          await p.waitForLoadState("networkidle").catch(() => {});
          await p.waitForTimeout(600);
        }
        await p.screenshot({ path: path.join(dir, `app-${slug(tabs[i])}-${w}.png`), fullPage: true });
      }
      report.push({ side: "app", page, w, url, tabs });
    }
  }
  report.push({ side: "app", errors });
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(OUT, "list.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
