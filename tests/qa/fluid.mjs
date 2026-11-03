// Browser zoom and screen sizes, on every page of the QA app. Browser zoom is simulated the way Chrome does it: the page
// gets a smaller (or larger) CSS viewport and a matching devicePixelRatio, so media queries and dvh behave as on a
// zoomed screen. Each page at each size records:
//   sideways - the page scrolls sideways
//   unused   - CSS px of the content area left empty beside the page's content (a cap narrower than the screen)
//   issues   - layout-check.mjs findings (overlap, squeezed text, touching edges, uneven tiles, too-wide dialogs)
//   chat     - Chats only: the message box is on screen without scrolling, and the chat reaches the bottom
// Writes .git/qa-fluid.json and prints a summary.
//   node tests/qa/fluid.mjs [routes=/dashboard,/dashboard/replies] [screens=zoom,devices] [who=manager]
import fs from "node:fs";
import { createRequire } from "node:module";
import { layoutIssues } from "./layout-check.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = S.base;
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error("QA app only");
const arg = (k, d) => process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1) ?? d;

// A 1920×1080 monitor shows the page in about 1920×950 (browser bars), a 1366×768 laptop in 1366×657.
const zoom = (w, h, z) => ({ name: `${w}@${Math.round(z * 100)}%`, width: Math.round(w / z), height: Math.round(h / z), dpr: z });
const SCREENS = {
  zoom: [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5].map((z) => zoom(1920, 950, z)).concat([1, 1.25, 1.5].map((z) => zoom(1366, 657, z))),
  devices: [
    { name: "tablet-land 1024x768", width: 1024, height: 768, dpr: 2 },
    { name: "tablet 768x1024", width: 768, height: 1024, dpr: 2, mobile: true },
    { name: "phone-land 844x390", width: 844, height: 390, dpr: 3, mobile: true },
    { name: "phone 390x844", width: 390, height: 844, dpr: 3, mobile: true },
    { name: "phone 360x800", width: 360, height: 800, dpr: 3, mobile: true },
  ],
};
const screens = arg("screens", "zoom,devices").split(",").flatMap((k) => SCREENS[k] ?? []);

const DASH = [
  "/dashboard", "/dashboard/replies", "/dashboard/replies/priority", "/dashboard/calls", "/dashboard/orders", "/dashboard/orders/packing",
  "/dashboard/revenue", "/dashboard/customers", `/dashboard/customers/${S.customerId}`, "/dashboard/customers/audiences", "/dashboard/customers/grow",
  "/dashboard/customers/fields", "/dashboard/customers/sheet", "/dashboard/refills", "/dashboard/catalogue", "/dashboard/catalogue/combos",
  "/dashboard/templates", "/dashboard/templates/new", "/dashboard/campaigns", "/dashboard/campaigns/new", "/dashboard/campaigns/compare",
  "/dashboard/messages", "/dashboard/notifications", "/dashboard/report", "/dashboard/requests", "/dashboard/settings", "/dashboard/settings/fields",
  "/dashboard/settings/sheet", "/dashboard/account", "/dashboard/guide",
];
const ADMIN = ["/admin", "/admin/clients", "/admin/enquiries", "/admin/messages", "/admin/payments", "/admin/settings", "/admin/support", "/admin/usage"];
const PUBLIC = ["/login", "/signup", "/forgot-password"];
const who = arg("who", "manager,admin,public").split(",");
const plan = [
  ...(who.includes("manager") ? [["manager", arg("routes", DASH.join(",")).split(",")]] : []),
  ...(who.includes("admin") && !process.argv.some((a) => a.startsWith("routes=")) ? [["admin", ADMIN]] : []),
  ...(who.includes("public") && !process.argv.some((a) => a.startsWith("routes=")) ? [["public", PUBLIC]] : []),
];

/** Runs in the page: how much of the content area the page's content uses, and the Chats fill. */
function measure() {
  const vw = innerWidth;
  const vh = innerHeight;
  const out = { sideways: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0 };
  const main = document.querySelector("main#main, main") ?? document.body;
  const cs = getComputedStyle(main);
  // What the page could use: its card (main's parent) less main's side padding, so a cap on main itself counts too.
  const card = main.parentElement ?? main;
  const avail = card.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  // The page's own width: the innermost .wrapin (the portal's page frame), else the first wrapper with content.
  const frames = [...main.querySelectorAll(".wrapin")];
  let el = frames[frames.length - 1];
  if (!el) {
    el = main;
    for (let i = 0; i < 6; i++) {
      const kids = [...el.children].filter((k) => k.getBoundingClientRect().height > 40 && getComputedStyle(k).position !== "fixed");
      if (kids.length !== 1) break;
      el = kids[0];
    }
  }
  out.avail = Math.round(avail);
  out.used = Math.round(el.getBoundingClientRect().width);
  out.unused = Math.max(0, Math.round(avail - out.used));
  const wa = document.querySelector(".wa-app");
  if (wa) {
    const comp = document.querySelector(".wa-comp, .wa-closed");
    const r = wa.getBoundingClientRect();
    const c = comp?.getBoundingClientRect();
    const bottomNav = document.querySelector("nav[data-mtabs]");
    const navTop = bottomNav && getComputedStyle(bottomNav).display !== "none" ? bottomNav.getBoundingClientRect().top : vh;
    out.chat = { composerOnScreen: c ? c.bottom <= navTop + 1 && c.top >= 0 : null, gapBelow: Math.round(navTop - r.bottom), height: Math.round(r.height) };
  }
  return out;
}

const b = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
for (const [role, routes] of plan)
  for (const sc of screens) {
    const ctx = await b.newContext({ viewport: { width: sc.width, height: sc.height }, deviceScaleFactor: sc.dpr, isMobile: !!sc.mobile, hasTouch: !!sc.mobile });
    if (role !== "public") await ctx.addCookies([{ name: "wp_session", value: S.tokens[role], url: BASE }]);
    const p = await ctx.newPage();
    for (const route of routes) {
      try {
        await p.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
        await p.waitForTimeout(250);
        const m = await p.evaluate(measure);
        const issues = await p.evaluate(layoutIssues, {});
        report.push({ route, screen: sc.name, role, ...m, issues });
      } catch (e) {
        report.push({ route, screen: sc.name, role, error: String(e.message || e).split("\n")[0].slice(0, 120) });
      }
    }
    await ctx.close();
  }
await b.close();
fs.writeFileSync(arg("out", ".git/qa-fluid.json"), JSON.stringify(report, null, 1));

const bad = (r) => r.error || r.sideways || r.issues?.length || (r.chat && (!r.chat.composerOnScreen || r.chat.gapBelow > 40));
console.log(`${report.length} screens; sideways ${report.filter((r) => r.sideways).length}; with layout findings ${report.filter((r) => r.issues?.length).length}; errors ${report.filter((r) => r.error).length}`);
const wide = report.filter((r) => r.unused > 400);
console.log(`content leaves >400px of the screen empty on ${wide.length} screens, e.g. ${[...new Set(wide.map((r) => `${r.route} ${r.screen} (${r.unused}px)`))].slice(0, 6).join("; ")}`);
const groups = new Map();
for (const r of report.filter(bad)) {
  const keys = [
    ...(r.error ? [`error ${r.error}`] : []),
    ...(r.sideways ? ["sideways"] : []),
    ...(r.issues ?? []).map((i) => i.replace(/\d+px/g, "Npx").replace(/\d+(\/\d+)+/, "N/N")),
    ...(r.chat && !r.chat.composerOnScreen ? ["chat: message box off screen"] : []),
    ...(r.chat && r.chat.gapBelow > 40 ? [`chat: ${r.chat.gapBelow}px empty below`] : []),
  ];
  for (const k of keys) {
    const key = `${r.route.replace(/c[a-z0-9]{20,}/, ":id")} :: ${k}`;
    groups.set(key, [...(groups.get(key) ?? []), r.screen]);
  }
}
for (const [k, v] of [...groups.entries()].sort()) console.log(`- ${k}\n    on ${v.length}: ${[...new Set(v)].slice(0, 6).join(", ")}${v.length > 6 ? "…" : ""}`);
