// What a page costs while it just sits open: every request it makes on its own for a while (polling, refreshes),
// with bytes and server time, on the QA app. Chats used to re-render itself every 6 seconds.
//   node tests/qa/idle-load.mjs [route=/dashboard/replies] [seconds=60] [out=.git/qa-idle.json]
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost|127\.0\.0\.1/.test(S.base)) throw new Error("QA app only");
const arg = (k, d) => process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d;
const route = arg("route", "/dashboard/replies");
const seconds = Number(arg("seconds", "60"));

const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: S.base }]);
const p = await ctx.newPage();
await p.goto(S.base + route, { waitUntil: "networkidle" });
const reqs = [];
p.on("requestfinished", async (r) => {
  const s = await r.sizes().catch(() => null);
  const t = r.timing();
  const u = new URL(r.url());
  reqs.push({ path: u.pathname + (u.searchParams.has("_rsc") ? " (page data)" : ""), bytes: s ? s.responseBodySize : 0, ms: Math.round(t.responseStart) });
});
await p.waitForTimeout(seconds * 1000);
await b.close();
const by = new Map();
for (const r of reqs) {
  const g = by.get(r.path) ?? { n: 0, bytes: 0, ms: [] };
  g.n++;
  g.bytes += r.bytes;
  g.ms.push(r.ms);
  by.set(r.path, g);
}
const rows = [...by.entries()].map(([path, g]) => ({ path, requests: g.n, kb: Math.round(g.bytes / 102.4) / 10, medianMs: g.ms.sort((a, b) => a - b)[Math.floor(g.ms.length / 2)] }));
const total = { requests: reqs.length, kb: Math.round(reqs.reduce((a, r) => a + r.bytes, 0) / 102.4) / 10 };
fs.writeFileSync(arg("out", ".git/qa-idle.json"), JSON.stringify({ route, seconds, total, rows }, null, 1));
console.log(`${route} open ${seconds}s: ${total.requests} requests, ${total.kb} KB`);
for (const r of rows) console.log(`  ${r.path}: ${r.requests}× ${r.kb} KB, median ${r.medianMs} ms`);
