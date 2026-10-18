// Interaction sweep on the QA app: on every page, clicks each distinct button once (fresh page each time), answers
// the app's own confirm dialogs, and records what happened: a dialog/sheet, a toast (ok or "Problem"), a page change,
// nothing at all (a dead button), script errors and server errors. Links are checked by loading their targets.
// QA database only — it changes QA data (orders get confirmed, cancelled…); restart the QA app to reset.
// Every dialog or sheet a click opens is also screenshotted (.qa-shots/sweep/) and checked for layout problems
// (layout-check.mjs: overlap, squeezed text, content touching edges, wider than the screen), then closed.
//   node tests/qa/sweep.mjs [pages=/dashboard,/dashboard/orders] [max=40] [size=390x844]
import fs from "node:fs";
import { createRequire } from "node:module";
import { layoutIssues } from "./layout-check.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const arg = (k, d) => process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d;
const BASE = arg("base", "http://localhost:3200");
const MAX = Number(arg("max", "45"));
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error("QA app only");

const DEFAULT_PAGES = [
  "/dashboard",
  "/dashboard/replies",
  "/dashboard/replies/priority",
  "/dashboard/calls",
  "/dashboard/orders",
  "/dashboard/orders/packing",
  "/dashboard/revenue",
  "/dashboard/revenue?tab=got&per=m",
  "/dashboard/revenue?tab=cod",
  "/dashboard/revenue?tab=all",
  "/dashboard/revenue?tab=set",
  "/dashboard/customers",
  "/dashboard/customers?tab=groups",
  "/dashboard/customers?tab=loyalty",
  `/dashboard/customers/${S.customerId}`,
  "/dashboard/customers/audiences",
  "/dashboard/refills",
  "/dashboard/catalogue",
  "/dashboard/catalogue?view=demand",
  "/dashboard/catalogue/combos",
  "/dashboard/campaigns",
  "/dashboard/campaigns/new",
  "/dashboard/templates",
  "/dashboard/templates/new",
  "/dashboard/report",
  "/dashboard/messages",
  "/dashboard/notifications",
  "/dashboard/settings",
  "/dashboard/guide",
];
const PAGES = arg("pages", "") ? arg("pages", "").split(",") : DEFAULT_PAGES;
const SKIP = /sign out|log ?out|வெளியேறு|^EN$|தமிழ்|switch to (dark|light)|Look:|language|மொழி|Dismiss|Notifications/i;

const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const [VW, VH] = arg("size", "1366x900").split("x").map(Number);
const ctx = await b.newContext({ viewport: { width: VW, height: VH } });
const SHOTS = `.qa-shots/sweep/${VW}`;
fs.mkdirSync(SHOTS, { recursive: true });
let shotN = 0;
const p = await ctx.newPage();
let errs = [];
let bad = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
p.on("response", (r) => r.status() >= 500 && bad.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 80)}`));
p.on("dialog", (d) => d.dismiss().catch(() => {}));
await p.goto(BASE + "/login");
await p.fill("input[type=email], input[name=email]", "manager@qa.test");
await p.fill("input[type=password]", "qa-test-123");
await p.click("button[type=submit]");
await p.waitForURL(/dashboard/, { timeout: 30000 });

const labelsJs = () => {
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== "hidden";
  };
  const main = document.querySelector("main") || document.body;
  const out = [];
  for (const e of main.querySelectorAll("button, summary, [role=switch]")) {
    if (!vis(e) || e.disabled || e.closest("[aria-hidden=true]")) continue;
    const t = (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (t) out.push(t);
  }
  return [...new Set(out)];
};
const linksJs = () => [...new Set([...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/") && !h.startsWith("/api/")))];
const snap = () =>
  p.evaluate(() => ({
    url: location.pathname + location.search + location.hash,
    html: (document.querySelector("main")?.innerHTML.length ?? 0) + ":" + document.querySelectorAll("[role=dialog],[role=alertdialog],dialog[open]").length,
    toasts: [...document.querySelectorAll("[role=status] .surface-dark")].map((t) => t.textContent.trim().replace(/\s+/g, " ").slice(0, 160)),
  }));

// The QA shop has no WhatsApp number on purpose, so anything that would message a customer is refused with this.
const EXPECTED = /hasn't connected its own WhatsApp number|Add a WhatsApp number for this client|24-hour window has closed|Give the campaign a name|template is used by a campaign/i;
const openAll = () => p.evaluate(() => document.querySelectorAll("main details").forEach((d) => (d.open = true))).catch(() => {});
const results = [];
const checked = new Set();
for (const path of PAGES) {
  errs = [];
  bad = [];
  await p.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  const pageErrs = [...errs];
  const pageLayout = await p.evaluate(layoutIssues, {}).catch(() => []);
  await openAll();
  const labels = (await p.evaluate(labelsJs)).filter((l) => !SKIP.test(l)).slice(0, MAX);
  const links = await p.evaluate(linksJs);
  const linkProblems = [];
  for (const h of links) {
    const key = h.split("#")[0];
    if (checked.has(key)) continue;
    checked.add(key);
    const r = await p.request.get(BASE + key).catch(() => null);
    if (!r || r.status() >= 400) linkProblems.push(`${key} → ${r ? r.status() : "failed"}`);
  }
  const clicks = [];
  for (const label of labels) {
    errs = [];
    bad = [];
    await p.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await openAll();
    const before = await snap();
    const el = p.locator("main").locator("button, summary, [role=switch]").filter({ hasText: label }).first();
    let target = el;
    if (!(await el.count())) target = p.locator(`main [aria-label="${label.replace(/"/g, '\\"')}"]`).first();
    if (!(await target.count()) || !(await target.isVisible().catch(() => false))) {
      clicks.push({ label, result: "not found after reload" });
      continue;
    }
    try {
      await target.click({ timeout: 4000 });
    } catch (e) {
      clicks.push({ label, result: `click failed: ${String(e).split("\n")[0].slice(0, 100)}` });
      continue;
    }
    await p.waitForTimeout(700);
    // The app's own "Are you sure?" dialog: say yes, so the action runs.
    const confirmBtn = p.locator("[role=alertdialog] button[type=submit]");
    let confirmed = false;
    if (await confirmBtn.count()) {
      const input = p.locator("[role=alertdialog] input, [role=alertdialog] textarea");
      if (await input.count()) await input.first().fill("QA sweep").catch(() => {});
      await confirmBtn.first().click().catch(() => {});
      confirmed = true;
    }
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(900);
    const after = await snap();
    const dialog = await p.locator("[role=dialog], dialog[open]").count();
    let layout;
    if (dialog) {
      layout = await p.evaluate(layoutIssues, { scope: "[role=dialog], [role=alertdialog], dialog[open]" }).catch(() => []);
      const file = `${SHOTS}/${String(++shotN).padStart(3, "0")}-${path.replace(/\W+/g, "_")}-${label.replace(/\W+/g, "_").slice(0, 30)}.png`;
      await p.screenshot({ path: file }).catch(() => {});
      if (!layout.length) layout = undefined;
    }
    const result = [
      confirmed && "confirmed",
      dialog && "opened dialog",
      after.url !== before.url && `→ ${after.url}`,
      after.toasts.length && `toast: ${after.toasts.join(" | ")}`,
      !confirmed && !dialog && after.url === before.url && !after.toasts.length && after.html === before.html && "NO VISIBLE EFFECT",
    ]
      .filter(Boolean)
      .join("; ");
    clicks.push({
      label,
      result: (result || "changed the page") + (after.toasts.some((t) => /Problem/.test(t)) && after.toasts.every((t) => !/Problem/.test(t) || EXPECTED.test(t)) ? " [expected in QA]" : ""),
      errors: errs.length ? errs : undefined,
      server: bad.length ? bad : undefined,
      layout,
    });
    if (dialog) await p.keyboard.press("Escape").catch(() => {});
  }
  results.push({ path, pageErrs, pageLayout, linkProblems, clicks });
  fs.writeFileSync(`.git/qa-sweep-${VW}.json`, JSON.stringify(results, null, 1));
  const look = clicks.filter((c) => /NO VISIBLE|Problem|failed|errors/.test(c.result) || c.errors || c.server);
  console.log(`${path}: ${clicks.length} clicks, ${look.length} to look at, ${linkProblems.length} bad links, ${pageLayout.length} page layout, ${clicks.filter((c) => c.layout).length} dialogs with layout problems`);
  for (const c of look) console.log(`   ! ${c.label}: ${c.result}${c.errors ? ` errors: ${c.errors[0]}` : ""}${c.server ? ` server: ${c.server[0]}` : ""}`);
  for (const i of pageLayout) console.log(`   ~ page: ${i}`);
  for (const c of clicks.filter((c) => c.layout)) console.log(`   ~ ${c.label}: ${c.layout.join(" | ")}`);
}
await b.close();
