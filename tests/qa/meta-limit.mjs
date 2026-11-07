// The Campaigns page shows today's Meta limit and keeps it live (/api/limits), for the shop's own business only.
//   node tests/qa/meta-limit.mjs   (QA app running: tests/qa/serve.mjs). Screenshots go to .git/shots-limit/.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = process.env.BASE ?? S.base;
let pass = 0, fail = 0;
const ok = (name, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${name} ${x}`); };

let r = await fetch(BASE + "/api/limits");
ok("needs a login", r.status === 401, r.status);
r = await fetch(BASE + "/api/limits", { headers: { cookie: `wp_session=${S.tokens.manager}` } });
const j = await r.json();
ok("answers for the shop", r.status === 200 && j && "limit" in j && "left" in j, JSON.stringify(j));

fs.mkdirSync(".git/shots-limit", { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const looks = [
  { name: "light", scheme: "light", theme: "light", w: 1366, h: 900 },
  { name: "dark", scheme: "light", theme: "dark", w: 1366, h: 900 },
  { name: "night", scheme: "dark", theme: null, w: 1366, h: 900 },
  { name: "phone-390", scheme: "light", theme: "light", w: 390, h: 844 },
];
for (const L of looks) {
  const ctx = await b.newContext({ colorScheme: L.scheme, viewport: { width: L.w, height: L.h } });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  await ctx.addInitScript((t) => { try { if (t) localStorage.setItem("theme", t); else localStorage.removeItem("theme"); } catch {} }, L.theme);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE + "/dashboard/campaigns", { waitUntil: "networkidle" });
  const card = p.getByTestId("meta-limit-card");
  const text = (await card.textContent().catch(() => "")) ?? "";
  ok(`card shows (${L.name})`, /Meta limit/.test(text) && /people|Unlimited/.test(text), text.replace(/\s+/g, " ").slice(0, 90));
  const box = await card.boundingBox();
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(`fits the page (${L.name})`, box && box.width <= L.w && !sideways);
  ok(`no page errors (${L.name})`, errors.length === 0, errors[0] ?? "");
  await card.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `.git/shots-limit/campaigns-${L.name}.png` });
  await ctx.close();
}
{
  // No limit to pick: Settings has no picker; the card counts people reached and shows the next step.
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const p = await ctx.newPage();
  await p.goto(BASE + "/dashboard/settings", { waitUntil: "networkidle" });
  ok("Settings has no limit picker", (await p.locator("#meta-limit").count()) === 0);
  await p.goto(BASE + "/dashboard/campaigns", { waitUntil: "networkidle" });
  const t = ((await p.getByTestId("meta-limit-card").textContent()) ?? "").replace(/\s+/g, " ");
  ok("card counts people reached and what's left", /reached in 24 hours/.test(t) && /left/.test(t) && /next limit/.test(t), t.slice(0, 160));
  r = await fetch(BASE + "/api/limits", { headers: { cookie: `wp_session=${S.tokens.manager}` } });
  const v = await r.json();
  ok("left is the limit minus people reached", v.limit === null || v.left === Math.max(0, v.limit - v.used), JSON.stringify(v).slice(0, 200));
  await ctx.close();
}
await b.close();
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
