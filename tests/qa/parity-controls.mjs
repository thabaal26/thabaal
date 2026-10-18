// Lists the visible controls (buttons, links, selects, inputs, switches) and card headings on each page/tab of the
// sample design and of the QA app, so the two can be compared as text. Writes .qa-shots/parity/controls.json.
//   node tests/qa/parity-controls.mjs [pages=index,orders]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const arg = (k, d) => process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d;
const SAMPLE = path.resolve(arg("sample", ".tmp-ui/sample.html"));
const BASE = arg("base", "http://localhost:3200");
const ONLY = arg("pages", "");
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

function collect(root) {
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && !e.closest("dialog:not([open]), [hidden], .sr-only, aside, nav.nav, .side");
  };
  const txt = (e) => (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || e.value || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const scope = document.querySelector(root) || document.body;
  const out = { headings: [], controls: [] };
  for (const h of scope.querySelectorAll("h1,h2,h3")) if (vis(h)) out.headings.push(txt(h));
  for (const e of scope.querySelectorAll("button, a[href], select, input:not([type=hidden]), textarea, [role=switch], summary")) {
    if (!vis(e)) continue;
    const kind = e.tagName === "A" ? "link" : e.tagName === "SELECT" ? "select" : e.tagName === "INPUT" ? `input:${e.type}` : e.getAttribute("role") === "switch" ? "switch" : e.tagName.toLowerCase();
    out.controls.push(`${kind}: ${txt(e)}`);
  }
  // Collapse repeats ("button: Open chat" ×12) so rows of cards read as one pattern.
  const count = (arr) => Object.entries(arr.reduce((m, s) => ((m[s] = (m[s] || 0) + 1), m), {})).map(([s, n]) => (n > 1 ? `${s} ×${n}` : s));
  return { headings: count(out.headings), controls: count(out.controls) };
}

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const result = {};
const ctxS = await b.newContext({ viewport: { width: 1366, height: 900 } });
const s = await ctxS.newPage();
const ctxA = await b.newContext({ viewport: { width: 1366, height: 900 } });
const a = await ctxA.newPage();
const errors = [];
a.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await a.goto(BASE + "/login");
await a.fill("input[type=email], input[name=email]", "manager@qa.test");
await a.fill("input[type=password]", "qa-test-123");
await a.click("button[type=submit]");
await a.waitForURL(/dashboard/, { timeout: 30000 });

for (const [page, url] of PAGES) {
  await s.goto(`file:///${SAMPLE.replace(/\\/g, "/")}#${page}`);
  await s.waitForTimeout(300);
  const sSel = `section.pg[data-page="${page}"] .tabs button`;
  const sTabs = await s.$$eval(sSel, (els) => els.map((e) => e.textContent.trim()));
  await a.goto(BASE + url, { waitUntil: "networkidle" });
  const aSel = "main .tabs > button, main .tabs > a";
  const aTabs = await a.$$eval(aSel, (els) => els.filter((e) => e.offsetParent).map((e) => e.textContent.trim().replace(/\s+/g, " ")));
  const tabs = [...new Set([...(sTabs.length ? sTabs : ["(main)"]), ...(aTabs.length ? aTabs : ["(main)"])])];
  result[page] = {};
  for (const t of tabs) {
    const entry = {};
    const si = sTabs.indexOf(t);
    if (si >= 0 || (!sTabs.length && t === "(main)")) {
      if (si >= 0) {
        await s.locator(sSel).nth(si).click();
        await s.waitForTimeout(250);
      }
      entry.sample = await s.evaluate(collect, `section.pg[data-page="${page}"]`);
    }
    const ai = aTabs.indexOf(t);
    if (ai >= 0 || (!aTabs.length && t === "(main)")) {
      if (ai >= 0) {
        await a.goto(BASE + url, { waitUntil: "networkidle" });
        await a.locator(aSel).nth(ai).click();
        await a.waitForLoadState("networkidle").catch(() => {});
        await a.waitForTimeout(500);
      }
      entry.app = await a.evaluate(collect, "main");
      entry.appUrl = a.url().replace(BASE, "");
    }
    result[page][t] = entry;
  }
}
result.errors = errors;
await b.close();
fs.mkdirSync(".qa-shots/parity", { recursive: true });
fs.writeFileSync(".qa-shots/parity/controls.json", JSON.stringify(result, null, 1));
console.log("done", Object.keys(result).length, "errors:", errors.length);
