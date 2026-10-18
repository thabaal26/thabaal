// Builds docs/qa/TEST_CASES.csv from the result files the suites wrote (.git/qa-*.json and .git/qa-*.log), so every row
// is a test that actually ran, with its real outcome. Suites that weren't run show as NOT RUN.
//   node tests/qa/report.mjs [--retest]   (--retest: these results are the run after the fixes)
import fs from "node:fs";

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
const json = (f) => {
  const t = read(f);
  return t ? JSON.parse(t) : null;
};
const retest = process.argv.includes("--retest");
const rows = [];
const add = (r) =>
  rows.push({
    id: r.id,
    category: r.category,
    module: r.module,
    scenario: r.scenario,
    pre: r.pre ?? "QA app running (tests/qa/serve.mjs), seeded QA Test Shop + QA Other Shop",
    data: r.data ?? "seed data",
    steps: r.steps ?? "",
    expected: r.expected ?? "",
    actual: r.actual ?? "",
    status: r.status,
    priority: r.priority ?? "P2",
    evidence: r.evidence ?? "",
    retest: r.retest ?? (retest ? r.status : ""),
  });

// ── Unit + integration (node test runner TAP output from tests/run.mjs) ──
{
  const log = read(".git/qa-unit.log");
  if (log) {
    const lines = log.split("\n");
    const stack = [];
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
      const sub = lines[i].match(/^(\s*)# Subtest: (.*)$/);
      if (sub) {
        stack.push({ indent: sub[1].length, name: sub[2], hasChild: false });
        const parent = stack[stack.length - 2];
        if (parent && parent.indent < sub[1].length) parent.hasChild = true;
        continue;
      }
      const res = lines[i].match(/^(\s*)(ok|not ok) \d+ - (.*?)(\s#.*)?$/);
      if (!res) continue;
      const node = stack.pop();
      if (!node || node.hasChild) continue;
      const suite = stack.filter((s) => s.indent < res[1].length).map((s) => s.name).join(" › ");
      add({
        id: `UNIT-${String(++n).padStart(3, "0")}`,
        category: "Unit / DB integration",
        module: suite || "tests/unit",
        scenario: res[3],
        pre: "Throw-away Postgres (tests/run.mjs)",
        steps: "node tests/run.mjs",
        expected: "assertions hold",
        actual: res[2] === "ok" ? "assertions held" : "assertion failed",
        status: res[2] === "ok" ? "PASS" : "FAIL",
        priority: /pay|loyal|point|wallet|tenan|order/i.test(suite + res[3]) ? "P0" : "P1",
        evidence: ".git/qa-unit.log",
      });
    }
    let k = 0;
    for (const m of log.matchAll(/^(PASS|FAIL)\s+(.*)$/gm))
      add({
        id: `ISO-${String(++k).padStart(2, "0")}`,
        category: "Integration (HTTP isolation)",
        module: "tests/http/isolation.mjs",
        scenario: m[2].trim(),
        pre: "Built app on :3200 against the throw-away DB",
        steps: "node tests/run.mjs --http",
        expected: "no business sees another's data",
        actual: m[1] === "PASS" ? "as expected" : "leak or error",
        status: m[1],
        priority: "P0",
        evidence: ".git/qa-unit.log",
      });
  }
}

// ── Permission guards ──
{
  const log = read(".git/qa-action-guards.log");
  add({
    id: "GUARD-01",
    category: "Security (authorisation)",
    module: "src/app/dashboard/actions/*",
    scenario: "Every exported server action checks the caller's role before acting",
    pre: "source code",
    steps: "node tests/qa/action-guards.mjs",
    expected: "every action calls requireUser/requireManager/requireOrderAccess/requireAdmin",
    actual: log ? log.trim().split("\n").slice(-2).join(" ") : "",
    status: log ? (/All server actions check permissions/.test(log) ? "PASS" : "FAIL") : "NOT RUN",
    priority: "P0",
    evidence: ".git/qa-action-guards.log",
  });
}

// ── Suites with per-case JSON ──
const fromList = (file, prefix, category, module, map) => {
  const j = json(file);
  if (!j) return add({ id: `${prefix}-*`, category, module, scenario: `${module} suite`, status: "NOT RUN", priority: "P1" });
  j.forEach((r, i) => add({ id: `${prefix}-${String(i + 1).padStart(2, "0")}`, category, module, evidence: file, ...map(r, i) }));
};
fromList(".git/qa-api.json", "API", "API / auth / session", "src/app/api/*", (r) => ({
  id: r.id,
  scenario: r.name,
  steps: "node tests/qa/api.mjs",
  expected: r.name.split(/→|:/).slice(-1)[0].trim(),
  actual: r.status === "PASS" ? r.detail || "as expected" : r.detail,
  status: r.status,
  priority: /session|leak|other shop|signature|upload|export/i.test(r.name) ? "P0" : "P1",
}));
fromList(".git/qa-payments.json", "PAY", "Integration (payment webhooks)", "/api/webhook → orders", (r) => ({
  scenario: `#${r.no} ${r.name}`,
  steps: "node tests/qa/payments.mjs (HMAC-signed webhook replays)",
  expected: "order status, amounts and records as described",
  actual: r.detail,
  status: r.pass ? "PASS" : "FAIL",
  priority: "P0",
}));
fromList(".git/qa-payments-ui.json", "PAYUI", "E2E (payments in the browser)", "/dashboard/orders, /dashboard/revenue", (r) => ({
  scenario: `#${r.no} ${r.name}`,
  steps: "node tests/qa/payments-ui.mjs (Chromium)",
  expected: "money buttons change the order exactly once, as described",
  actual: r.detail,
  status: r.pass ? "PASS" : "FAIL",
  priority: "P0",
}));
fromList(".git/qa-crud.json", "CRUD", "Functional E2E (create/edit/delete)", "dashboard", (r) => ({
  module: r.area,
  scenario: r.name,
  steps: "node tests/qa/crud.mjs (Chromium)",
  expected: "saved, shown again after reload, removed on delete; refused for roles without access",
  actual: r.detail,
  status: r.pass ? "PASS" : "FAIL",
  priority: "P1",
}));
fromList(".git/qa-xss.json", "XSS", "Security (stored XSS)", "pages showing customer data", (r) => ({
  module: r.route,
  scenario: `HTML/script payloads in customer, chat, order, campaign and audience fields at ${r.viewport}`,
  data: "<img src=x onerror=…> in 7 fields",
  steps: "node tests/qa/xss.mjs",
  expected: "payload shown as text; nothing runs; no element created",
  actual: r.ok ? (r.shown ? "shown as text, did not run" : "not on this page, did not run") : `ran: ${r.ran} elements: ${r.elements}`,
  status: r.ok ? "PASS" : "FAIL",
  priority: "P0",
}));

// ── Crawls ──
for (const [name, file] of [["desktop", ".git/qa-crawl-desktop.json"], ["phone", ".git/qa-crawl-phone.json"]]) {
  const j = json(file);
  if (!j) {
    add({ id: `CRAWL-${name}`, category: "Smoke / regression (crawl)", module: "every page", scenario: `${name} crawl`, status: "NOT RUN", priority: "P1" });
    continue;
  }
  const roles = [...new Set(j.map((r) => r.role))];
  for (const role of roles) {
    const mine = j.filter((r) => r.role === role);
    const bad = mine.filter((r) => r.issues.length);
    add({
      id: `CRAWL-${name}-${role}`,
      category: "Smoke / regression (crawl)",
      module: "every page and internal link",
      scenario: `Open every page reachable as ${role} on ${name === "desktop" ? "1366×860" : "390×844"}`,
      data: `${role} login`,
      steps: `node tests/qa/crawl.mjs ${name}`,
      expected: "no page error, console error, broken value (NaN/undefined), sample data, other business's data or sideways scroll",
      actual: bad.length ? bad.slice(0, 3).map((r) => `${r.url}: ${r.issues[0]}`).join("; ") : `${mine.length} pages, 0 problems`,
      status: bad.length ? "FAIL" : "PASS",
      priority: role === "otherManager" ? "P0" : "P1",
      evidence: file,
    });
  }
}

// ── Visual, layout, a11y, perf, sweep: one row per suite with counts ──
const summary = (id, category, module, scenario, file, steps, judge, priority = "P2") => {
  const t = read(file);
  if (!t) return add({ id, category, module, scenario, steps, status: "NOT RUN", priority });
  const { status, actual } = judge(t);
  add({ id, category, module, scenario, steps, status, actual, priority, evidence: file });
};
summary("VIS-01", "Visual regression", "24 routes", "Screens at 5 sizes × light/dark × English/Tamil: nothing off-screen, clipped, untranslated or scrolling sideways", ".git/qa-visual.log", "node tests/qa/visual.mjs", (t) => {
  const last = t.trim().split("\n").filter((l) => /screens/.test(l)).pop() ?? "";
  return { status: /0 with (problems|issues|findings)|no problems/i.test(last) ? "PASS" : last ? "FAIL" : "BLOCKED", actual: last };
});
{
  const j = json(".git/qa-layout.json");
  if (j) {
    const sizes = [...new Set(j.map((r) => r.size))];
    for (const s of sizes) {
      const mine = j.filter((r) => r.size === s);
      const bad = mine.filter((r) => r.issues.length);
      add({
        id: `LAY-${s}`,
        category: "Responsive layout",
        module: `${mine.length} routes`,
        scenario: `Every route at ${s}: overlap, squeezed text, edge spacing, uneven tiles, sideways scroll, oversized dialogs`,
        steps: `node tests/qa/layout.mjs sizes=${s}`,
        expected: "no findings",
        actual: bad.length ? `${bad.length} routes with findings: ${bad.slice(0, 2).map((r) => `${r.route} (${r.issues[0]})`).join("; ")}` : `${mine.length} routes, 0 findings`,
        status: bad.length ? "FAIL" : "PASS",
        priority: "P2",
        evidence: ".git/qa-layout.json",
      });
    }
  } else add({ id: "LAY-*", category: "Responsive layout", module: "every route", scenario: "layout matrix", status: "NOT RUN" });
}
{
  const j = json(".git/qa-a11y.json");
  if (j) {
    for (const r of j) {
      const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      add({
        id: `A11Y-${r.size}-${r.route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "root"}`,
        category: "Accessibility (axe WCAG 2.x A/AA + keyboard)",
        module: r.route,
        scenario: `axe rules and keyboard focus at ${r.size}`,
        steps: "node tests/qa/a11y.mjs",
        expected: "no serious/critical axe violations; visible focus on Tab; dialogs close on Escape",
        actual: r.error ? r.error : `${r.violations.length} rule(s)${r.violations.length ? ": " + r.violations.map((v) => `${v.impact} ${v.id}`).join(", ") : ""}${r.keyboard.length ? "; keyboard: " + r.keyboard.join(", ") : ""}`,
        status: r.error ? "BLOCKED" : serious.length || r.keyboard.length ? "FAIL" : "PASS",
        priority: serious.some((v) => v.impact === "critical") ? "P1" : "P2",
        evidence: ".git/qa-a11y.json",
      });
    }
  } else add({ id: "A11Y-*", category: "Accessibility", module: "every route", scenario: "axe + keyboard", status: "NOT RUN" });
}
{
  const j = json(".git/qa-perf.json");
  if (j)
    for (const r of j)
      add({
        id: `PERF-${r.profile}-${r.route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}`,
        category: "Performance",
        module: r.route,
        scenario: `Cold load on ${r.profile === "phone" ? "a phone (4× CPU, 9 Mbps, 150 ms)" : "a laptop"}`,
        steps: "node tests/qa/perf.mjs (median of 3)",
        expected: "LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 300 ms (laptop) / 600 ms (phone)",
        actual: `TTFB ${r.ttfb} ms, FCP ${r.fcp} ms, LCP ${r.lcp} ms, CLS ${r.cls}, TBT ${r.tbt} ms, JS ${r.jsKB} KB, total ${r.totalKB} KB, ${r.requests} requests`,
        status: r.lcp <= 2500 && r.cls <= 0.1 && r.tbt <= (r.profile === "phone" ? 600 : 300) ? "PASS" : "FAIL",
        priority: "P3",
        evidence: ".git/qa-perf.json",
      });
  else add({ id: "PERF-*", category: "Performance", module: "main pages", scenario: "load metrics", status: "NOT RUN", priority: "P3" });
}
for (const [id, file, label] of [["SWEEP-phone", ".git/qa-sweep-390.json", "390×844"], ["SWEEP-desktop", ".git/qa-sweep-1366.json", "1366×900"]]) {
  const j = json(file);
  if (!j) {
    add({ id, category: "Interaction sweep", module: "every page", scenario: `Press every button at ${label}`, status: "NOT RUN" });
    continue;
  }
  const list = Array.isArray(j) ? j : (j.results ?? []);
  const bad = list.filter((r) => (r.issues ?? r.problems ?? []).length || r.error);
  add({
    id,
    category: "Interaction sweep",
    module: "every page",
    scenario: `Press every button at ${label}; each dialog opens inside the screen and closes`,
    steps: `node tests/qa/sweep.mjs${label.startsWith("390") ? " size=390x844" : ""}`,
    expected: "no page error; dialogs fit and close",
    actual: `${list.length} presses${bad.length ? `, ${bad.length} with findings` : ", 0 findings"}`,
    status: bad.length ? "FAIL" : "PASS",
    evidence: file,
  });
}

const csvCell = (v) => {
  const s = String(v ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const head = ["Test ID", "Category", "Module / route", "Scenario", "Preconditions", "Test data", "Steps", "Expected result", "Actual result", "Status", "Priority", "Evidence", "Retest result"];
const keys = ["id", "category", "module", "scenario", "pre", "data", "steps", "expected", "actual", "status", "priority", "evidence", "retest"];
fs.writeFileSync("docs/qa/TEST_CASES.csv", [head.join(","), ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(","))].join("\n") + "\n");
const count = (s) => rows.filter((r) => r.status === s).length;
const totals = { total: rows.length, PASS: count("PASS"), FAIL: count("FAIL"), BLOCKED: count("BLOCKED"), SKIPPED: count("SKIPPED"), "NOT RUN": count("NOT RUN") };
fs.writeFileSync(".git/qa-totals.json", JSON.stringify(totals, null, 1));
console.log(JSON.stringify(totals));
