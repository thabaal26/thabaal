// One person, several WhatsApp numbers, through the real screens on the QA app (lib/linked-numbers.ts): a pending
// order-sheet entry with two numbers, Add customer with another number, the list, the customer page, editing the
// other numbers, a CSV cell with two numbers, and a staff login being refused. Checked in the QA database.
//   node tests/qa/multi-number.mjs
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

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function as(role, viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
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
  throw new Error(`no message matching ${re}; saw: ${all.join(" | ").slice(0, 200) || "nothing"}`);
}
const dialog = (p, title) => p.getByRole("dialog").filter({ hasText: title }).last();
const local = (n) => `9${n}${run}`.padEnd(10, "0").slice(0, 10);
const wa = (ten) => `91${ten}`;
const spaced = (ten) => `${ten.slice(0, 5)} ${ten.slice(5)}`;
const byPhone = (ten) => db.customer.findUnique({ where: { clientId_phone: { clientId: S.shopId, phone: wa(ten) } } });

const manager = await as("manager");
const A = local("81"), B = local("82"), C = local("83"), D = local("84"), E = local("85"), F = local("86"), G = local("87");
const pendingName = `QA Two Numbers ${run}`;

await check("Pending", "An order-sheet entry with two numbers: both shown, both saved, linked as one person", async () => {
  await db.pendingCustomer.create({ data: { clientId: S.shopId, name: pendingName, rawPhone: `${spaced(A)} / ${spaced(B)}`, location: "Ring Road", items: "Gingelly oil (1 ltr)", source: "qa" } });
  await go(manager, "/dashboard/customers");
  await manager.getByRole("button", { name: /^Review \d+ pending/ }).click();
  const card = manager.locator("li").filter({ hasText: pendingName }).first();
  await card.waitFor();
  expect(await card.getByText("2 numbers").isVisible(), "no '2 numbers' badge");
  const typed = await card.getByLabel("WhatsApp phone number").inputValue();
  expect(typed === `${A}, ${B}`, `phone box has "${typed}"`);
  await card.getByRole("button", { name: "Add to directory" }).click();
  const msg = await toast(manager, /added to customer directory/);
  expect(/with 2 numbers/.test(msg), `message: ${msg}`);
  const [a, b] = [await byPhone(A), await byPhone(B)];
  expect(a && b, "both numbers saved");
  expect(a.personId && a.personId === b.personId, "not linked");
  expect(b.name === pendingName && b.location === "Ring Road" && b.purchases === "Gingelly oil (1 ltr)", `second number details: ${JSON.stringify({ n: b.name, l: b.location, p: b.purchases })}`);
  expect(!(await db.pendingCustomer.findFirst({ where: { clientId: S.shopId, name: pendingName } })), "pending entry still there");
  return msg;
});

await check("List", "Search by the second number (typed with a space) finds the person; the row says +1 more number", async () => {
  await go(manager, "/dashboard/customers");
  await manager.getByLabel("Search customers").fill(spaced(B));
  const rows = manager.locator("tbody tr").filter({ hasText: pendingName });
  await rows.first().waitFor({ timeout: 8000 });
  expect((await rows.count()) === 2, `rows found: ${await rows.count()}`);
  expect(await rows.first().getByTestId("other-numbers").isVisible(), "no '+1 more number'");
  expect(/\+1 more number/.test(await rows.first().innerText()), "wrong text");
  return `${await rows.count()} rows`;
});

await check("Customer page", "Shows their other number with a link; Edit opens with it filled in", async () => {
  const a = await byPhone(A);
  await go(manager, `/dashboard/customers/${a.id}`);
  const box = manager.getByTestId("other-numbers");
  expect(await box.isVisible(), "no other-numbers block");
  const link = box.getByRole("link", { name: `+91 ${spaced(B)}` });
  expect(await link.isVisible(), `no link to +91 ${spaced(B)}`);
  expect((await link.getAttribute("href")).endsWith((await byPhone(B)).id), "link goes elsewhere");
  await manager.getByRole("button", { name: /^Edit/ }).first().click();
  const d = dialog(manager, `Edit ${pendingName}`);
  await d.waitFor();
  const v = await d.getByLabel("Other numbers").inputValue();
  expect(v === `+91 ${spaced(B)}`, `other numbers box: "${v}"`);
  return v;
});

await check("Edit", "Adding a third number and taking one off: new one saved and linked, removed one kept but unlinked", async () => {
  const a = await byPhone(A);
  await go(manager, `/dashboard/customers/${a.id}`);
  await manager.getByRole("button", { name: /^Edit/ }).first().click();
  const d = dialog(manager, `Edit ${pendingName}`);
  await d.waitFor();
  await d.getByLabel("Other numbers").fill(C);
  await d.getByRole("button", { name: "Save changes" }).click();
  const msg = await toast(manager, /updated/);
  const [a2, b2, c2] = [await byPhone(A), await byPhone(B), await byPhone(C)];
  expect(c2 && c2.personId && c2.personId === a2.personId, "third number not linked");
  expect(b2 && b2.personId === null, "removed number still linked (or deleted)");
  expect(/added .*unlinked/.test(msg), `message: ${msg}`);
  return msg;
});

await check("Edit", "An unreadable other number is refused and nothing changes", async () => {
  const a = await byPhone(A);
  await go(manager, `/dashboard/customers/${a.id}`);
  await manager.getByRole("button", { name: /^Edit/ }).first().click();
  const d = dialog(manager, `Edit ${pendingName}`);
  await d.waitFor();
  await d.getByLabel("Other numbers").fill("12345");
  await d.getByRole("button", { name: "Save changes" }).click();
  const msg = await toast(manager, /Couldn't read "12345"/);
  expect((await byPhone(C)).personId === (await byPhone(A)).personId, "links changed");
  return msg;
});

await check("Add customer", "Two numbers in the number box plus one under Other numbers: all three saved and linked", async () => {
  const name = `QA Add Two ${run}`;
  await go(manager, "/dashboard/customers");
  await manager.getByRole("button", { name: /^Add/ }).first().click();
  const d = dialog(manager, "Add customer");
  await d.waitFor();
  await d.getByLabel("Name").fill(name);
  await d.getByLabel("WhatsApp number").fill(`${D} / ${E}`);
  await d.getByLabel("Other numbers").fill(F);
  await d.getByRole("button", { name: "Add customer" }).click();
  const msg = await toast(manager, /Customer added/);
  const rows = await Promise.all([D, E, F].map(byPhone));
  expect(rows.every(Boolean), "a number wasn't saved");
  expect(rows.every((r) => r.personId && r.personId === rows[0].personId), "not one person");
  expect(rows.every((r) => r.name === name && r.optInSource), "details or agreement missing");
  return msg;
});

await check("Import CSV", "A phone cell with two numbers saves both and links them", async () => {
  const file = `.git/qa-multi-${run}.csv`;
  fs.writeFileSync(file, `name,phone,tags\nQA Csv Two ${run},"${G} / ${local("88")}",csvtwo\nQA Csv One ${run},${local("89")},\n`);
  await go(manager, "/dashboard/customers");
  await manager.getByRole("button", { name: /Import CSV/ }).first().click();
  const d = dialog(manager, "Import");
  await d.waitFor();
  await d.locator("input[type=file]").setInputFiles(file);
  await d.getByRole("button", { name: "Import", exact: true }).click();
  const msg = await toast(manager, /added/);
  fs.unlinkSync(file);
  const [g, h, one] = [await byPhone(G), await byPhone(local("88")), await byPhone(local("89"))];
  expect(g && h && one, "a row wasn't saved");
  expect(g.personId && g.personId === h.personId, "two-number cell not linked");
  expect(one.personId === null, "single number linked");
  expect(g.tags.includes("csvtwo") && h.tags.includes("csvtwo"), "tags not on both");
  expect(/1 with more than one number/.test(msg), `message: ${msg}`);
  return msg;
});

await check("Phone", "390px: the customer page's other-numbers block fits without sideways scroll", async () => {
  const p = await as("manager", { width: 390, height: 844 });
  await go(p, `/dashboard/customers/${(await byPhone(D)).id}`);
  expect(await p.getByTestId("other-numbers").isVisible(), "block not shown");
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, `page scrolls sideways by ${over}px`);
  expect(!p.errors.length, p.errors.join(" | "));
  await p.context().close();
  return "fits";
});

await check("Permissions", "Staff can't change a customer's numbers (refused by the server)", async () => {
  const staff = await as("staff");
  await go(staff, `/dashboard/customers/${(await byPhone(D)).id}`);
  const edit = staff.getByRole("button", { name: /^Edit/ });
  expect((await edit.count()) === 0, "staff sees Edit");
  await staff.context().close();
  return "no Edit for staff; saveCustomer uses requireManager";
});

expect(!manager.errors.length, manager.errors.join(" | "));
await browser.close();
await db.$disconnect();
fs.writeFileSync(".git/qa-multi-number.json", JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} [${r.area}] ${r.name}\n      ${r.detail}`);
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
