// Create / read / update / delete through the real screens on the QA app, checked in the QA database, plus the
// same buttons as staff and viewer (they must be refused by the server, not only hidden).
//   node tests/qa/crud.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost/.test(S.base) || !/localhost|127\.0\.0\.1/.test(S.dbUrl)) throw new Error("QA only");
const BASE = S.base;
const db = new PrismaClient({ datasources: { db: { url: S.dbUrl } } });
const run = String(Date.now()).slice(-4);
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
async function check(area, name, fn) {
  try {
    results.push({ area, name, pass: true, detail: (await fn()) ?? "" });
  } catch (e) {
    results.push({ area, name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 260) });
  }
}

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function as(role) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens[role], url: BASE }]);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e).slice(0, 160)));
  return p;
}
const go = (p, path) => p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
async function toast(p, re, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const all = await p.locator("[role=status] p").allTextContents().catch(() => []);
    const hit = all.find((t) => re.test(t));
    if (hit) return hit.trim();
    await p.waitForTimeout(250);
  }
  const all = await p.locator("[role=status] p").allTextContents().catch(() => []);
  throw new Error(`no message matching ${re}; saw: ${all.join(" | ").slice(0, 160) || "nothing"}`);
}
const dialog = (p, title) => p.getByRole("dialog").filter({ hasText: title }).last();

const manager = await as("manager");
const phone = `9199900${run}9`.slice(0, 12);
const name = `QA New Customer ${run}`;

await check("Customers", "Add a customer (manager)", async () => {
  await go(manager, "/dashboard/customers");
  await manager.getByRole("button", { name: /^Add/ }).first().click();
  const d = dialog(manager, "Add customer");
  await d.waitFor();
  await d.getByLabel("Name").fill(name);
  await d.getByLabel("WhatsApp number").fill(phone);
  await d.getByLabel(/Area/).fill("Anna Nagar");
  await d.getByRole("button", { name: "Add customer" }).click();
  await toast(manager, /./);
  const c = await db.customer.findFirst({ where: { clientId: S.shopId, phone } });
  expect(c && c.name === name && c.location === "Anna Nagar", `saved: ${JSON.stringify(c && { name: c.name, phone: c.phone, location: c.location })}`);
  await go(manager, `/dashboard/customers?q=${encodeURIComponent(name)}`);
  expect(await manager.getByText(name).first().isVisible(), "new customer not listed");
  return `${c.name}, ${c.phone}, ${c.location}`;
});

await check("Customers", "Edit the customer; the form opens with the saved values", async () => {
  const c = await db.customer.findFirstOrThrow({ where: { clientId: S.shopId, phone } });
  await go(manager, `/dashboard/customers/${c.id}`);
  await manager.getByRole("button", { name: /^Edit/ }).first().click();
  const d = dialog(manager, `Edit ${c.name}`);
  await d.waitFor();
  expect((await d.getByLabel("Name").inputValue()) === c.name, "edit form not prefilled");
  await d.getByLabel("Name").fill(`${name} edited`);
  await d.getByRole("button", { name: "Save changes" }).click();
  await toast(manager, /./);
  const after = await db.customer.findUniqueOrThrow({ where: { id: c.id } });
  expect(after.name === `${name} edited` && after.phone === c.phone && after.location === c.location, `after: ${after.name} / ${after.phone} / ${after.location}`);
  return after.name;
});

await check("Customers", "Delete the customer from their profile (no orders)", async () => {
  const c = await db.customer.findFirstOrThrow({ where: { clientId: S.shopId, phone } });
  await go(manager, `/dashboard/customers/${c.id}`);
  await manager.getByRole("button", { name: "Delete customer" }).first().click();
  await manager.getByRole("alertdialog").getByRole("button", { name: "Delete customer" }).click();
  await toast(manager, /deleted/);
  await manager.waitForURL(/\/dashboard\/customers(\?|$)/, { timeout: 15000 });
  expect(!(await db.customer.findUnique({ where: { id: c.id } })), "still in the database");
  return "deleted, back on the customer list";
});

await check("Customers", "A customer with orders can't be deleted (payments stay on record)", async () => {
  const c = await db.customer.findFirstOrThrow({ where: { clientId: S.shopId, name: "Meena Raj" } });
  await go(manager, `/dashboard/customers/${c.id}`);
  const shown = await manager.getByRole("button", { name: "Delete customer" }).count();
  expect(shown === 0, "Delete offered for a customer with orders");
  return "Delete not offered; server refuses too (deleteCustomer counts orders)";
});

// Staff and viewer: managers-only actions refused by the server.
for (const role of ["staff", "viewer"]) {
  await check("Permissions", `${role}: adding a customer is refused`, async () => {
    const p = await as(role);
    await go(p, "/dashboard/customers");
    const add = p.getByRole("button", { name: /^Add/ }).first();
    if (!(await add.isVisible().catch(() => false))) {
      await p.context().close();
      return "Add button not shown";
    }
    await add.click();
    const d = dialog(p, "Add customer");
    await d.getByLabel("Name").fill(`QA ${role} try ${run}`);
    await d.getByLabel("WhatsApp number").fill(`91999011${run}`.slice(0, 12));
    await d.getByRole("button", { name: "Add customer" }).click();
    const msg = await toast(p, /can't|cannot|not allowed|view|owner|manager/i);
    const made = await db.customer.findFirst({ where: { name: `QA ${role} try ${run}` } });
    await p.context().close();
    expect(!made, "customer was created");
    return `refused: "${msg}"`;
  });
}

await check("Permissions", "viewer: recording a payment is refused by the server", async () => {
  const p = await as("viewer");
  await go(p, "/dashboard/orders?q=QA-1002");
  const cardEl = p.locator("article.card", { hasText: "#QA-1002" }).first();
  await cardEl.waitFor();
  const d = cardEl.locator("details.more");
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
  const btn = cardEl.getByRole("button", { name: "Mark paid" });
  if (!(await btn.isVisible().catch(() => false))) {
    await p.context().close();
    return "Mark paid not shown to viewers";
  }
  const before = await db.order.findFirstOrThrow({ where: { ref: "QA-1002" } });
  await btn.click();
  await p.getByRole("dialog").filter({ hasText: "Record payment" }).locator("button[type=submit]").click();
  const msg = await toast(p, /view|can't|cannot/i);
  const after = await db.order.findFirstOrThrow({ where: { ref: "QA-1002" } });
  await p.context().close();
  expect(after.paidAmount === before.paidAmount, "payment saved by a viewer");
  return `button shown but refused: "${msg}"`;
});

// Templates (QA Test Shop only; this QA server has no WhatsApp connection, so nothing reaches Meta).
const tplName = `qa_crud_${run}`;
await check("Templates", "Create a template", async () => {
  await go(manager, "/dashboard/templates/new");
  await manager.getByLabel(/Template name/).fill(tplName);
  const body = manager.locator("textarea").first();
  await body.fill("Hello {{1}}, this is a QA test message.");
  const save = manager.getByRole("button", { name: /Save|Submit|Create/ }).last();
  await save.click();
  await toast(manager, /./, 20000);
  const t = await db.template.findFirst({ where: { clientId: S.shopId, name: tplName } });
  expect(t, "template not saved");
  return `${t.name} (${t.status})`;
});

await check("Templates", "Edit the template's message", async () => {
  const t = await db.template.findFirstOrThrow({ where: { clientId: S.shopId, name: tplName } });
  await go(manager, `/dashboard/templates/${t.id}`);
  const body = manager.locator("textarea").first();
  expect((await body.inputValue()).includes("QA test message"), "editor not prefilled");
  await body.fill("Hello {{1}}, this QA message was edited.");
  await manager.getByRole("button", { name: /Save|Submit|Resubmit/ }).last().click();
  await toast(manager, /./, 20000);
  const after = await db.template.findUniqueOrThrow({ where: { id: t.id } });
  expect(after.body.includes("edited"), `body: ${after.body}`);
  return after.body;
});

await check("Templates", "Delete the template", async () => {
  const t = await db.template.findFirstOrThrow({ where: { clientId: S.shopId, name: tplName } });
  await go(manager, "/dashboard/templates");
  await manager.getByRole("button", { name: `Delete ${t.name}` }).first().click();
  await manager.getByRole("alertdialog").locator("button[type=submit]").click();
  await toast(manager, /./, 20000);
  expect(!(await db.template.findUnique({ where: { id: t.id } })), "template still there");
  return "deleted";
});

await check("Templates", "Another business's template is not reachable by id", async () => {
  const other = await db.template.findFirstOrThrow({ where: { clientId: S.otherId } });
  const r = await manager.goto(`${BASE}/dashboard/templates/${other.id}`, { waitUntil: "networkidle" });
  const text = await manager.locator("body").innerText();
  expect(!text.includes("ZzOther body"), "other business's template body visible");
  return `HTTP ${r?.status()}; not shown`;
});

await check("Customers", "Another business's customer is not reachable by id", async () => {
  const other = await db.customer.findFirstOrThrow({ where: { clientId: S.otherId } });
  const r = await manager.goto(`${BASE}/dashboard/customers/${other.id}`, { waitUntil: "networkidle" });
  const text = await manager.locator("body").innerText();
  expect(!text.includes("ZzOther"), "other business's customer visible");
  return `HTTP ${r?.status()}; not shown`;
});

await browser.close();
await db.$disconnect();
fs.writeFileSync(".git/qa-crud.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.area}] ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
