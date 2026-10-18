// Spacing and alignment across every common phone, tablet and desktop width, on the QA app as the shop manager.
// The checks are in layout-check.mjs (overlap, squeezed text, content touching card edges, uneven tiles, sideways scroll).
//   node tests/qa/layout.mjs [sizes=320x640,1440x900] [routes=/dashboard] [themes=dark] [langs=ta]
//   SELFTEST=1 breaks one card on purpose, to prove the checks still catch things.
import fs from "node:fs";
import { createRequire } from "node:module";
import { layoutIssues } from "./layout-check.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = process.env.BASE ?? S.base;
const arg = (k, d) => (process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d).split(",");

const SIZES = arg(
  "sizes",
  "320x640,360x740,375x667,390x844,414x896,430x932,600x960,768x1024,820x1180,1024x768,1280x800,1366x768,1440x900,1536x864,1920x1080,2560x1440",
).map((s) => {
  const [w, h] = s.split("x").map(Number);
  return { name: s, width: w, height: h };
});
const THEMES = arg("themes", "light");
const LANGS = arg("langs", "en");

const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const report = [];
for (const theme of THEMES)
  for (const lang of LANGS) {
    const ctx = await b.newContext({ colorScheme: theme === "dark" ? "dark" : "light" });
    await ctx.addCookies([
      { name: "wp_session", value: S.tokens.manager, url: BASE },
      { name: "thabaal-lang", value: lang, url: BASE },
    ]);
    await ctx.addInitScript(([t, l]) => {
      try {
        localStorage.setItem("theme", t);
        localStorage.setItem("thabaal-lang", l);
      } catch {}
    }, [theme, lang]);
    const p = await ctx.newPage();
    // Detail pages: the first template, campaign and audience the QA shop has.
    const firstLink = async (page, re) => {
      await p.goto(BASE + page, { waitUntil: "networkidle" }).catch(() => {});
      return p.evaluate((src) => [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")).find((h) => new RegExp(src).test(h)) ?? null, re.source);
    };
    const details = [
      await firstLink("/dashboard/templates", /^\/dashboard\/templates\/c[a-z0-9]{10,}$/),
      await firstLink("/dashboard/campaigns", /^\/dashboard\/campaigns\/c[a-z0-9]{10,}$/),
    ].filter(Boolean);
    const ROUTES = arg(
      "routes",
      [
        "/dashboard",
        "/dashboard/orders",
        "/dashboard/revenue",
        "/dashboard/revenue?tab=all",
        "/dashboard/customers",
        "/dashboard/customers?tab=groups",
        "/dashboard/customers?tab=loyalty",
        `/dashboard/customers/${S.customerId}`,
        "/dashboard/customers/audiences",
        "/dashboard/customers/grow",
        "/dashboard/refills",
        "/dashboard/catalogue",
        "/dashboard/catalogue?view=demand",
        "/dashboard/templates",
        "/dashboard/templates/new",
        "/dashboard/campaigns",
        "/dashboard/campaigns/new",
        "/dashboard/campaigns/compare",
        "/dashboard/messages",
        "/dashboard/replies",
        "/dashboard/replies/priority",
        "/dashboard/calls",
        "/dashboard/notifications",
        "/dashboard/report",
        "/dashboard/settings",
        "/dashboard/guide",
        ...details,
      ].join(","),
    );
    for (const size of SIZES) {
      await p.setViewportSize({ width: size.width, height: size.height });
      for (const route of ROUTES) {
        try {
          await p.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
        } catch (e) {
          report.push({ route, size: size.name, theme, lang, issues: [`load failed ${String(e).slice(0, 80)}`] });
          continue;
        }
        await p.waitForTimeout(300);
        if (process.env.SELFTEST) await p.evaluate(() => { const c = document.querySelector("main .card"); if (c) c.style.padding = "2px"; const h = document.querySelector("main .card p"); if (h) h.style.width = "20px"; });
        const issues = await p.evaluate(layoutIssues, { dbg: !!process.env.SELFTEST });
        report.push({ route, size: size.name, theme, lang, issues });
      }
    }
    await ctx.close();
  }
await b.close();
fs.writeFileSync(".git/qa-layout.json", JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.issues.length);
console.log(`${report.length} screens, ${bad.length} with findings`);
const groups = new Map();
for (const r of bad)
  for (const i of r.issues) {
    const key = `${r.route.replace(/c[a-z0-9]{20,}/, ":id")} :: ${i.replace(/\(\-?\d+px\)/, "(Npx)").replace(/\d+px wide/, "Npx wide").replace(/\d+(\/\d+)+/, "N/N").replace(/sideways \d+px/, "sideways")}`;
    groups.set(key, [...(groups.get(key) ?? []), r.size]);
  }
for (const [k, v] of [...groups.entries()].sort()) console.log(`- ${k}\n    on ${v.length}: ${[...new Set(v)].slice(0, 8).join(", ")}${v.length > 8 ? "…" : ""}`);
