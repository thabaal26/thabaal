// Visual matrix on the QA app: every main route × 5 screen sizes × light/dark × English/Tamil, as the shop manager.
// Saves a screenshot of each to .qa-shots/<route>/<size>-<theme>-<lang>.png and checks what a person would notice:
// sideways scrolling, things cut off past the screen edge, text clipped inside its box, tap targets under 40px on
// phones, untranslated English in Tamil mode on main headings, and script errors.
//   node tests/qa/visual.mjs [sizes=360x740,390x844] [routes=/dashboard,/dashboard/orders] [themes=light] [langs=ta]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = S.base;
const arg = (k, d) => (process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d).split(",");

const SIZES = arg("sizes", "360x740,390x844,768x1024,1366x860,1920x1080").map((s) => {
  const [w, h] = s.split("x").map(Number);
  return { name: s, width: w, height: h, phone: w < 600 };
});
const ROUTES = arg(
  "routes",
  [
    "/dashboard",
    "/dashboard/orders",
    "/dashboard/orders?tab=pack",
    "/dashboard/orders/packing",
    "/dashboard/revenue",
    "/dashboard/customers",
    `/dashboard/customers/${S.customerId}`,
    "/dashboard/customers/audiences",
    "/dashboard/customers/grow",
    "/dashboard/catalogue",
    "/dashboard/catalogue/combos",
    "/dashboard/templates",
    "/dashboard/templates/new",
    "/dashboard/campaigns",
    "/dashboard/campaigns/new",
    "/dashboard/messages",
    "/dashboard/replies",
    "/dashboard/notifications",
    "/dashboard/refills",
    "/dashboard/report",
    "/dashboard/wallet",
    "/dashboard/settings",
    "/dashboard/guide",
    "/dashboard/calls",
  ].join(","),
);
const THEMES = arg("themes", "light,dark");
const LANGS = arg("langs", "en,ta");
const OUT = ".qa-shots";

const slug = (r) => r.replace(/^\/dashboard\/?/, "").replace(/[?=&/]+/g, "_").replace(/_+$/, "") || "home";
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
    let errors = [];
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    for (const size of SIZES) {
      await p.setViewportSize({ width: size.width, height: size.height });
      for (const route of ROUTES) {
        errors = [];
        try {
          await p.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
        } catch (e) {
          report.push({ route, size: size.name, theme, lang, issues: [`load failed ${String(e).slice(0, 80)}`] });
          continue;
        }
        await p.waitForTimeout(250);
        const info = await p.evaluate(({ phone, lang }) => {
          const vw = window.innerWidth;
          const out = { wide: document.documentElement.scrollWidth, vw, off: [], clipped: [], small: [], english: [] };
          const visible = (el, r) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
          const inScroller = (el) => {
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) return true;
            return false;
          };
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (!visible(el, r)) continue;
            const st = getComputedStyle(el);
            const label = `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 26)}"`;
            if (el.children.length === 0 && r.right > vw + 1 && !inScroller(el) && st.position !== "fixed") out.off.push(`${label} right=${Math.round(r.right)}`);
            // Text cut off inside its own box without an ellipsis.
            // (Screen-reader-only text is clipped to 1px on purpose.)
            const srOnly = r.width <= 2 || r.height <= 2 || /sr-only/.test(String(el.className)) || st.clip === "rect(0px, 0px, 0px, 0px)";
            if (!srOnly && el.children.length === 0 && (el.textContent || "").trim() && st.overflow === "hidden" && st.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 2 && !/line-clamp/.test(String(el.className))) out.clipped.push(label);
            // Screen-reader-only controls (e.g. a chart's keyboard list) aren't finger targets.
            if (phone && !srOnly && !el.closest(".sr-only") && el.matches("a[href],button,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,[role=button],[role=tab],summary") && (r.height < 40 || r.width < 40)) {
              const inline = el.matches("a") && /\S/.test((el.parentElement?.textContent || "").replace(el.textContent || "", ""));
              if (!inline) out.small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
          }
          if (lang === "ta") {
            // Headings, navigation and buttons only (names, places and products are data, in whatever language).
            for (const h of document.querySelectorAll("h1, h2, nav a, button:not([role=radio])")) {
              // Names and places are data; a language's own name (lang="en" on "English") is meant to stay as written.
              if (h.closest("[data-data], article, li, td, [lang]:not(html)")) continue;
              const t = (h.textContent || "").trim();
              if (t.length > 3 && /^[A-Za-z][A-Za-z ,.'&-]+$/.test(t) && !/^(WhatsApp|UPI|COD|QA|Thabaal|PDF|CSV|OK|Google|Meta)\b/.test(t)) out.english.push(t.slice(0, 30));
            }
          }
          return { ...out, off: out.off.slice(0, 5), clipped: [...new Set(out.clipped)].slice(0, 5), small: [...new Set(out.small)].slice(0, 6), english: [...new Set(out.english)].slice(0, 8) };
        }, { phone: size.phone, lang });
        const dir = path.join(OUT, slug(route));
        fs.mkdirSync(dir, { recursive: true });
        await p.screenshot({ path: path.join(dir, `${size.name}-${theme}-${lang}.png`), fullPage: false });
        const issues = [];
        if (info.wide > info.vw + 1) issues.push(`sideways scroll ${info.wide}px on ${info.vw}px`);
        if (info.off.length) issues.push(`off screen: ${info.off.join(" | ")}`);
        if (info.clipped.length) issues.push(`text clipped: ${info.clipped.join(" | ")}`);
        if (info.small.length) issues.push(`tap targets < 40px: ${info.small.join(" | ")}`);
        if (info.english.length) issues.push(`English in Tamil mode: ${info.english.join(" | ")}`);
        if (errors.length) issues.push(`script errors: ${errors.slice(0, 2).join(" | ")}`);
        report.push({ route, size: size.name, theme, lang, issues });
      }
    }
    await ctx.close();
  }
await b.close();
fs.writeFileSync(".git/qa-visual.json", JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.issues.length);
console.log(`${report.length} screens, ${bad.length} with findings`);
// Group identical findings across sizes/themes to keep the list readable.
const groups = new Map();
for (const r of bad)
  for (const i of r.issues) {
    const key = `${r.route} :: ${i.replace(/\d+px on \d+px/, "Npx").replace(/right=\d+/g, "right=N").replace(/\d+x\d+/g, "WxH")}`;
    const g = groups.get(key) ?? [];
    g.push(`${r.size}/${r.theme}/${r.lang}`);
    groups.set(key, g);
  }
for (const [k, v] of [...groups.entries()].sort()) console.log(`- ${k}\n    on ${v.length}: ${v.slice(0, 6).join(", ")}${v.length > 6 ? "…" : ""}`);
