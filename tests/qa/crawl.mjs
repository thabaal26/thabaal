// Read-only crawl of the QA app (tests/qa/serve.mjs) as each role: follows every internal link from Home (tabs and
// filters included) and checks each page: status, sign-in redirects, script errors, failed requests, broken values
// ("undefined", "NaN", "[object Object]", untranslated keys), real-shop data that can only be hardcoded (the QA
// database holds none), other businesses' data, sideways scroll and small tap targets on phones.
//   node tests/qa/crawl.mjs [desktop|phone] [roles=manager,staff,viewer,admin,otherManager]
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pwPath = process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core";
const { chromium } = require(pwPath);

const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
const BASE = S.base;
const size = process.argv[2] ?? "desktop";
const vp = size === "phone" ? { width: 390, height: 844 } : { width: 1366, height: 860 };
const roles = (process.argv.find((a) => a.startsWith("roles="))?.slice(6) ?? "manager,staff,viewer,admin,otherManager").split(",");

// Words from the real shop's data and from the earlier static design: they can only appear if hardcoded.
const HARDCODED = ["Thenan", "Madhumita", "STEPHAN", "EZHUMALAI", "Murugan", "Sunami", "Nishok", "RG-10", "Kambu", "Moringa", "Lorem", "lorem ipsum", "John Doe", "Jane Doe", "example.com", "+91 98765", "9876543210"];
const BROKEN = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /\bnull\b(?! *[a-z])/, /Infinity/, /\b[a-z]+\.[a-z]+\.[a-z_]+\b(?=\s|$)/];
const OTHER_SHOP = ["ZzOther", "QO-1001", "QA Other Shop"];
const QA_SHOP = ["Meena Raj", "QA-1001", "Karthik S", "QA Test Shop"];

const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const report = [];
for (const role of roles) {
  const ctx = await b.newContext({ viewport: vp });
  const cookies = [{ name: "wp_session", value: S.tokens[role], url: BASE }];
  if (role === "admin") cookies.push({ name: "wp_client", value: S.shopId, url: BASE });
  await ctx.addCookies(cookies);
  const p = await ctx.newPage();
  let pageErrors = [], failed = [], consoleErrors = [];
  p.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 180)));
  p.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 180)));
  p.on("response", (r) => r.status() >= 400 && r.url().startsWith(BASE) && failed.push(`${r.status()} ${r.url().replace(BASE, "")}`));

  const seen = new Set();
  const queue = ["/dashboard", `/dashboard/customers/${S.customerId}`];
  while (queue.length && seen.size < 160) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    pageErrors = []; failed = []; consoleErrors = [];
    let status = 0;
    try {
      const r = await p.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 });
      status = r?.status() ?? 0;
    } catch (e) {
      report.push({ role, url, issues: [`load failed: ${String(e).slice(0, 120)}`] });
      continue;
    }
    await p.waitForTimeout(300);
    const info = await p.evaluate(({ phone }) => {
      const text = document.body.innerText;
      const vw = window.innerWidth;
      const wide = document.documentElement.scrollWidth;
      const offRight = [];
      const small = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.display === "none") continue;
        // Inside a sideways-scrolling strip is fine.
        let scroller = false;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { scroller = true; break; }
        }
        if (!scroller && r.right > vw + 2 && el.children.length === 0) offRight.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${(el.textContent || "").trim().slice(0, 30)}" right=${Math.round(r.right)}`);
        // A checkbox or radio is tapped through its label, so the label's size is what counts; screen-reader-only
        // controls (a chart's keyboard list, a hidden file input) aren't finger targets.
        const hit = el.matches("input[type=checkbox],input[type=radio]") ? (el.closest("label") ?? el).getBoundingClientRect() : r;
        const srOnly = r.width <= 2 || r.height <= 2 || el.closest(".sr-only");
        if (phone && !srOnly && el.matches("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],summary") && (hit.height < 32 || hit.width < 32)) {
          const inSentence = el.matches("a") && el.parentElement && /\S/.test((el.parentElement.textContent || "").replace(el.textContent || "", ""));
          if (!inSentence) small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 28)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/dashboard"));
      return { text, title: document.title, wide, vw, offRight: offRight.slice(0, 6), small: [...new Set(small)].slice(0, 8), links, login: location.pathname.startsWith("/login"), path: location.pathname + location.search };
    }, { phone: size === "phone" });
    const issues = [];
    if (status !== 200) issues.push(`status ${status}`);
    if (info.login) issues.push("sent to sign-in");
    if (/Application error|Something went wrong|This page couldn.t load|Internal Server Error/i.test(info.text)) issues.push("error page shown");
    for (const re of BROKEN) { const m = info.text.match(re); if (m) issues.push(`broken value: "${info.text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ")}"`); }
    const hard = HARDCODED.filter((w) => info.text.includes(w));
    if (hard.length) issues.push(`hardcoded/sample data: ${hard.join(", ")}`);
    if (role === "otherManager") { const leak = QA_SHOP.filter((w) => info.text.includes(w)); if (leak.length) issues.push(`LEAK of QA Test Shop data: ${leak.join(", ")}`); }
    else if (role !== "admin") { const leak = OTHER_SHOP.filter((w) => info.text.includes(w)); if (leak.length) issues.push(`LEAK of other shop data: ${leak.join(", ")}`); }
    if (info.wide > info.vw + 2) issues.push(`sideways scroll: page ${info.wide}px on ${info.vw}px screen`);
    if (info.offRight.length) issues.push(`off-screen: ${info.offRight.join(" | ")}`);
    if (info.small.length) issues.push(`small tap targets: ${info.small.join(" | ")}`);
    if (pageErrors.length) issues.push(`script errors: ${pageErrors.slice(0, 2).join(" | ")}`);
    const f = [...new Set(failed)].filter((x) => !/favicon|\/_next\/image/.test(x));
    if (f.length) issues.push(`failed requests: ${f.slice(0, 4).join(", ")}`);
    const ce = [...new Set(consoleErrors)].filter((x) => !/Failed to load resource/.test(x));
    if (ce.length) issues.push(`console errors: ${ce.slice(0, 2).join(" | ")}`);
    report.push({ role, url, final: info.path, issues });
    for (const h of info.links) {
      const clean = h.split("#")[0];
      if (!seen.has(clean) && !/\/export|\.csv|logout|signout/i.test(clean)) queue.push(clean);
    }
  }
  console.log(`${role}: ${seen.size} pages`);
  await ctx.close();
}
await b.close();
fs.mkdirSync("docs/qa", { recursive: true });
fs.writeFileSync(`.git/qa-crawl-${size}.json`, JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.issues.length);
console.log(`\n${report.length} page visits, ${bad.length} with issues`);
for (const r of bad) console.log(`- [${r.role}] ${r.url}${r.final && r.final !== r.url ? ` → ${r.final}` : ""}\n    ${r.issues.join("\n    ")}`);
