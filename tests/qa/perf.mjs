// Loading performance of the main pages on the QA app (production build), measured in Chromium:
// time to first byte, first and largest contentful paint (FCP, LCP), layout shift (CLS), total blocking time from long
// tasks (TBT, a lab stand-in for INP), JavaScript and total bytes, request count and repeated requests.
// Profiles: "laptop" (no throttling) and "phone" (4× slower CPU, 9 Mbps / 150 ms network, 390×844).
// The QA app runs on this computer, so network times are lower than on the live site; compare runs, not absolutes.
//   node tests/qa/perf.mjs [routes=/dashboard] [runs=3]  → .git/qa-perf.json (median of runs)
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = process.env.BASE ?? S.base;
const arg = (k, d) => (process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d).split(",");
const RUNS = Number(arg("runs", "3")[0]);
const ROUTES = arg(
  "routes",
  "/login,/dashboard,/dashboard/orders,/dashboard/revenue,/dashboard/customers,/dashboard/catalogue,/dashboard/templates,/dashboard/campaigns,/dashboard/messages,/dashboard/replies,/dashboard/report,/dashboard/settings",
);
const PROFILES = [
  { name: "laptop", viewport: { width: 1366, height: 768 }, cpu: 1, net: null },
  { name: "phone", viewport: { width: 390, height: 844 }, cpu: 4, net: { latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 } },
];

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const out = [];
for (const prof of PROFILES)
  for (const route of ROUTES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      // A fresh context each run: a cold cache, as for a first visit.
      const ctx = await b.newContext({ viewport: prof.viewport });
      if (route !== "/login") await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
      const p = await ctx.newPage();
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Network.enable");
      if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });
      if (prof.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...prof.net });
      const reqs = [];
      p.on("requestfinished", async (r) => {
        const s = await r.sizes().catch(() => null);
        reqs.push({ url: r.url(), type: r.resourceType(), bytes: s ? s.responseBodySize + s.responseHeadersSize : 0 });
      });
      await p.addInitScript(() => {
        window.__perf = { lcp: 0, cls: 0, tbt: 0 };
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__perf.lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__perf.tbt += Math.max(0, e.duration - 50);
        }).observe({ type: "longtask", buffered: true });
      });
      const t0 = Date.now();
      await p.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
      const loadMs = Date.now() - t0;
      await p.waitForTimeout(1000);
      const m = await p.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const fcp = performance.getEntriesByName("first-contentful-paint")[0];
        return { ttfb: nav?.responseStart ?? null, fcp: fcp?.startTime ?? null, domContentLoaded: nav?.domContentLoadedEventEnd ?? null, ...window.__perf };
      });
      const urls = reqs.map((r) => r.url.split("#")[0]);
      const repeated = [...new Set(urls.filter((u, i) => urls.indexOf(u) !== i))];
      runs.push({
        ...m,
        loadMs,
        requests: reqs.length,
        jsKB: Math.round(reqs.filter((r) => r.type === "script").reduce((a, r) => a + r.bytes, 0) / 1024),
        totalKB: Math.round(reqs.reduce((a, r) => a + r.bytes, 0) / 1024),
        repeated,
      });
      await ctx.close();
    }
    const pick = (k) => {
      const v = median(runs.map((r) => r[k]).filter((x) => x != null));
      return v == null ? null : k === "cls" ? Number(v.toFixed(3)) : Math.round(v);
    };
    const row = {
      profile: prof.name,
      route,
      ttfb: pick("ttfb"),
      fcp: pick("fcp"),
      lcp: pick("lcp"),
      cls: pick("cls"),
      tbt: pick("tbt"),
      loadMs: pick("loadMs"),
      requests: pick("requests"),
      jsKB: pick("jsKB"),
      totalKB: pick("totalKB"),
      repeated: runs[0].repeated,
    };
    out.push(row);
    console.log(`${prof.name.padEnd(6)} ${route.padEnd(24)} TTFB ${row.ttfb}ms FCP ${row.fcp}ms LCP ${row.lcp}ms CLS ${row.cls} TBT ${row.tbt}ms JS ${row.jsKB}KB total ${row.totalKB}KB req ${row.requests}${row.repeated.length ? ` repeated ${row.repeated.length}` : ""}`);
  }
await b.close();
fs.writeFileSync(".git/qa-perf.json", JSON.stringify(out, null, 1));
