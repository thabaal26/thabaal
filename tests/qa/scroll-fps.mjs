// Scrolling smoothness on the QA app: scrolls each page top to bottom with the mouse wheel (computer) or by touch-like
// steps (phone) while counting animation frames, and reports frames per second and slow frames (over 16.7 ms = below
// 60 fps; over 33 ms = a visible hitch). Run with nothing else busy on the computer, or the numbers are low.
//   node tests/qa/scroll-fps.mjs [pages=/dashboard,/dashboard/orders] [size=both|desktop|phone]
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const arg = (k, d) => process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d;
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const B = S.base ?? "http://localhost:3200";
const PAGES = arg("pages", "")
  ? arg("pages", "").split(",")
  : [
      "/login",
      "/dashboard",
      "/dashboard/replies",
      "/dashboard/replies/priority",
      "/dashboard/orders",
      "/dashboard/revenue",
      "/dashboard/revenue?tab=all",
      "/dashboard/customers",
      "/dashboard/customers?tab=groups",
      "/dashboard/customers?tab=loyalty",
      `/dashboard/customers/${S.customerId}`,
      "/dashboard/refills",
      "/dashboard/catalogue",
      "/dashboard/catalogue?view=demand",
      "/dashboard/campaigns",
      "/dashboard/campaigns/new",
      "/dashboard/templates",
      "/dashboard/report",
      "/dashboard/settings",
      "/dashboard/guide",
    ];
const size = arg("size", "both");
const SIZES = [
  ...(size !== "phone" ? [{ name: "desktop", viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, isMobile: false }] : []),
  ...(size !== "desktop" ? [{ name: "phone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }] : []),
];

const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const rows = [];
for (const sz of SIZES) {
  const ctx = await b.newContext({ viewport: sz.viewport, deviceScaleFactor: sz.deviceScaleFactor, isMobile: sz.isMobile, hasTouch: sz.hasTouch });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: B }]);
  const p = await ctx.newPage();
  for (const path of PAGES) {
    await p.goto(B + path, { waitUntil: "networkidle" }).catch(() => {});
    await p.waitForTimeout(800);
    const result = await p.evaluate(async () => {
      const el = document.scrollingElement;
      const max = el.scrollHeight - innerHeight;
      if (max < 200) return { short: true };
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 200));
      const frames = [];
      let last = performance.now();
      let done = false;
      const tick = (t) => {
        frames.push(t - last);
        last = t;
        if (!done) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      // ~2.5 s of steady scrolling, 40 px per frame-ish, down then back up.
      const step = Math.max(30, Math.ceil(max / 70));
      for (let y = 0; y <= max; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => r()));
      }
      for (let y = max; y >= 0; y -= step) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => r()));
      }
      done = true;
      const f = frames.slice(2);
      const total = f.reduce((a, x) => a + x, 0);
      const sorted = [...f].sort((a, c) => a - c);
      return {
        fps: Math.round((f.length / total) * 1000),
        slow: f.filter((x) => x > 17.5).length,
        hitch: f.filter((x) => x > 34).length,
        worst: Math.round(sorted[sorted.length - 1]),
        p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
        frames: f.length,
      };
    });
    rows.push({ size: sz.name, path, ...result });
    console.log(sz.name.padEnd(8), path.padEnd(48), result.short ? "short page" : `${result.fps} fps · p95 ${result.p95} ms · worst ${result.worst} ms · slow ${result.slow}/${result.frames} · hitches ${result.hitch}`);
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(".git/qa-scroll-fps.json", JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => !r.short && (r.fps < 58 || r.hitch > 1));
console.log(`\n${rows.length} page scrolls, ${bad.length} below 60 fps or with hitches`);
