// Screenshots of pages at chosen sizes (and browser zoom, as in fluid.mjs) on the QA app, for a person to look at.
//   node tests/qa/fluid-shots.mjs routes=/dashboard,/dashboard/orders sizes=1920x950@1,1920x950@0.67 [who=manager] [theme=dark] [full=1]
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost|127\.0\.0\.1/.test(S.base)) throw new Error("QA app only");
const arg = (k, d) => process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d;
const routes = arg("routes", "/dashboard").split(",");
const who = arg("who", "manager");
const theme = arg("theme", "");
fs.mkdirSync(".git/shots-fluid", { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const spec of arg("sizes", "1920x950@1").split(",")) {
  const [wh, z = "1"] = spec.split("@");
  const [w, h] = wh.split("x").map(Number);
  const zoom = Number(z);
  const ctx = await b.newContext({ viewport: { width: Math.round(w / zoom), height: Math.round(h / zoom) }, deviceScaleFactor: zoom });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens[who], url: S.base }]);
  if (theme) await ctx.addInitScript((t) => { try { if (t === "dark") localStorage.setItem("theme", "dark"); if (t === "night") localStorage.setItem("thabaal-theme", "night"); } catch {} }, theme);
  const p = await ctx.newPage();
  for (const r of routes) {
    await p.goto(S.base + r, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(400);
    const name = `${r.replace(/^\//, "").replace(/[/?=&]/g, "_") || "root"}-${w}x${h}@${Math.round(zoom * 100)}${theme ? "-" + theme : ""}.png`;
    await p.screenshot({ path: `.git/shots-fluid/${name}`, fullPage: arg("full", "") === "1" });
    console.log(name);
  }
  await ctx.close();
}
await b.close();
