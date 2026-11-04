// The old admin view is gone (dashboard/layout.tsx): an admin who hasn't opened one business is sent to the admin
// panel from every business-app page; inside one business (Open to make changes) the app still opens; the portal-wide
// sending settings live in Admin › Settings › Sending and look; business logins are unaffected.
//   node tests/qa/admin-old-view.mjs   (on a running `node tests/qa/serve.mjs`)
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost/.test(S.base)) throw new Error("QA only");
const BASE = S.base;
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
async function check(name, fn) {
  try {
    results.push({ name, pass: true, detail: (await fn()) ?? "" });
  } catch (e) {
    results.push({ name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 240) });
  }
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function as(role, cookie) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens[role], url: BASE }, ...(cookie ? [{ name: "wp_client", value: cookie, url: BASE }] : [])]);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e).slice(0, 160)));
  return p;
}
const path = (p) => new URL(p.url()).pathname;

const admin = await as("admin");
await check("Admin without a business: every business-app page goes to the admin panel", async () => {
  const seen = [];
  for (const route of ["/dashboard", "/dashboard/templates", "/dashboard/replies", "/dashboard/customers", "/dashboard/settings", "/dashboard/account", "/dashboard/campaigns"]) {
    await admin.goto(BASE + route, { waitUntil: "networkidle" });
    seen.push(`${route}→${path(admin)}`);
    expect(path(admin) === "/admin", `${route} stayed at ${path(admin)}`);
  }
  return `${seen.length} pages → /admin`;
});

await check("Inside one business (Open to make changes) the app opens, and the switcher offers the admin panel instead of All clients", async () => {
  const p = await as("admin", S.shopId);
  await p.goto(`${BASE}/dashboard/templates`, { waitUntil: "networkidle" });
  expect(path(p) === "/dashboard/templates", `went to ${path(p)}`);
  const body = await p.locator("body").innerText();
  expect(!/All clients/.test(body), "All clients still offered");
  expect(/Admin panel/.test(body), "no way back to the admin panel");
  await p.context().close();
  return "opens; switcher says Admin panel";
});

await check("Admin › Settings links to Sending and look, which shows the provider, Meta number, scheduler and look", async () => {
  await admin.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  await admin.getByRole("link", { name: "Sending and look settings" }).click();
  await admin.waitForURL(/\/admin\/settings\/sending/);
  const text = await admin.locator("main").innerText();
  for (const w of ["Meta Cloud API", "Scheduler", "Appearance"]) expect(text.includes(w), `missing ${w}`);
  expect(!admin.errors.length, admin.errors.join(" | "));
  return "provider, Meta, scheduler, look";
});

await check("Business logins are unaffected and can't open admin pages", async () => {
  const m = await as("manager");
  await m.goto(`${BASE}/dashboard/templates`, { waitUntil: "networkidle" });
  expect(path(m) === "/dashboard/templates", `manager went to ${path(m)}`);
  await m.goto(`${BASE}/admin/settings/sending`, { waitUntil: "networkidle" });
  expect(!path(m).startsWith("/admin"), `manager opened ${path(m)}`);
  await m.context().close();
  return "manager stays in their app";
});

await browser.close();
fs.writeFileSync(".git/qa-admin-old-view.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
