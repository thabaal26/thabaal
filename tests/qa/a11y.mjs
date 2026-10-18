// Accessibility checks (axe-core, WCAG 2.0/2.1/2.2 A and AA rules) on every dashboard page, as the shop manager, on a
// laptop and a phone, plus keyboard checks: Tab reaches the main controls, focus is visible, and Escape closes a dialog.
// Automated rules find only part of the WCAG issues; screen-reader behaviour is not covered here.
//   node tests/qa/a11y.mjs [sizes=1366x768,390x844] [routes=/dashboard]
//   AXE_PATH points at axe.min.js (npm i axe-core anywhere outside the app).
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const AXE = fs.readFileSync(process.env.AXE_PATH ?? require.resolve("axe-core/axe.min.js"), "utf8");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = process.env.BASE ?? S.base;
const arg = (k, d) => (process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d).split(",");
const SIZES = arg("sizes", "1366x768,390x844").map((s) => {
  const [width, height] = s.split("x").map(Number);
  return { name: s, width, height };
});
const ROUTES = arg(
  "routes",
  [
    "/login",
    "/dashboard",
    "/dashboard/orders",
    "/dashboard/revenue",
    "/dashboard/customers",
    `/dashboard/customers/${S.customerId}`,
    "/dashboard/customers/audiences",
    "/dashboard/customers/grow",
    "/dashboard/refills",
    "/dashboard/catalogue",
    "/dashboard/templates",
    "/dashboard/templates/new",
    "/dashboard/campaigns",
    "/dashboard/campaigns/new",
    "/dashboard/messages",
    "/dashboard/replies",
    "/dashboard/replies/priority",
    "/dashboard/calls",
    "/dashboard/notifications",
    "/dashboard/report",
    "/dashboard/settings",
    "/dashboard/guide",
    "/privacy",
    "/terms",
    "/about",
  ].join(","),
);

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const report = [];
for (const size of SIZES) {
  const ctx = await b.newContext({ viewport: { width: size.width, height: size.height } });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const p = await ctx.newPage();
  for (const route of ROUTES) {
    const entry = { route, size: size.name, violations: [], keyboard: [] };
    try {
      // The sign-in page is checked logged out.
      if (route === "/login") await ctx.clearCookies();
      await p.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
      await p.waitForTimeout(300);
      await p.addScriptTag({ content: AXE });
      const res = await p.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")), notes: v.nodes.slice(0, 4).map((n) => (n.any[0] ?? n.all[0] ?? n.none[0])?.message ?? "") }));
      });
      entry.violations = res;
      // Keyboard: the first 15 Tab stops each show a visible focus indicator and none is hidden off-screen.
      entry.keyboard = await (async () => {
        const out = [];
        await p.evaluate(() => document.activeElement?.blur());
        for (let i = 0; i < 15; i++) {
          await p.keyboard.press("Tab");
          const f = await p.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const look = () => {
              const cs = getComputedStyle(el);
              return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor].join("|");
            };
            const r = el.getBoundingClientRect();
            // Visible focus = the element looks different focused than not focused.
            const focused = look();
            el.blur();
            const blurred = look();
            el.focus();
            const ring = focused !== blurred;
            const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.tagName).trim().slice(0, 40);
            return { name, ring, offscreen: r.width === 0 || r.height === 0 || r.right < 0 || r.bottom < 0 };
          });
          if (!f) break;
          if (!f.ring) out.push(`no visible focus: "${f.name}"`);
          if (f.offscreen) out.push(`focus on hidden element: "${f.name}"`);
        }
        return [...new Set(out)];
      })();
      if (route === "/login") await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
    } catch (e) {
      entry.error = String(e).slice(0, 200);
    }
    report.push(entry);
    const serious = entry.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    console.log(`${size.name} ${route}: ${entry.violations.length} rules (${serious.length} serious/critical)${entry.keyboard.length ? `, keyboard: ${entry.keyboard.length}` : ""}${entry.error ? ` ERROR ${entry.error}` : ""}`);
  }
  await ctx.close();
}

// Escape closes an open dialog and returns focus: tried on the first button on Orders that opens one.
{
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const p = await ctx.newPage();
  await p.goto(BASE + "/dashboard/orders", { waitUntil: "networkidle" });
  const opened = await p
    .getByRole("button", { name: /^\s*new order\s*$/i })
    .first()
    .click({ timeout: 5000 })
    .then(() => p.waitForSelector('[role="dialog"], dialog[open]', { timeout: 5000 }))
    .then(() => true)
    .catch(() => false);
  let closed = false;
  let focusBack = false;
  if (opened) {
    await p.keyboard.press("Escape");
    closed = await p.waitForSelector('[role="dialog"], dialog[open]', { state: "detached", timeout: 3000 }).then(() => true).catch(async () => !(await p.$('[role="dialog"]:visible, dialog[open]')));
    // Focus goes back to the button that opened it.
    if (closed) focusBack = await p.evaluate(() => /new\s*order/i.test(document.activeElement?.textContent ?? ""));
  }
  report.push({ route: "/dashboard/orders (New order dialog)", size: "1366x768", violations: [], keyboard: opened ? (closed ? (focusBack ? [] : ["focus does not return to the opener"]) : ["Escape does not close the dialog"]) : ["dialog did not open"] });
  console.log(`dialog Escape: opened ${opened}, closed ${closed}, focus back ${focusBack}`);
  await ctx.close();
}
await b.close();
fs.writeFileSync(".git/qa-a11y.json", JSON.stringify(report, null, 1));

const byRule = new Map();
for (const r of report)
  for (const v of r.violations) {
    const k = `${v.impact} ${v.id}: ${v.help}`;
    const cur = byRule.get(k) ?? { pages: new Set(), nodes: 0, sample: v.targets[0] };
    cur.pages.add(`${r.route}@${r.size}`);
    cur.nodes += v.count;
    byRule.set(k, cur);
  }
console.log(`\n${report.length} page checks; ${byRule.size} distinct rules violated`);
for (const [k, v] of [...byRule.entries()].sort()) console.log(`- ${k}\n    ${v.pages.size} pages, ${v.nodes} elements, e.g. ${v.sample}`);
const kb = report.flatMap((r) => r.keyboard.map((k) => `${r.route}@${r.size}: ${k}`));
if (kb.length) console.log(`\nKeyboard findings:\n- ${kb.slice(0, 40).join("\n- ")}`);
