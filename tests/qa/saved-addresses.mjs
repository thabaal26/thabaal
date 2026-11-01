// Saved delivery addresses in a real browser against the QA app (tests/qa/serve.mjs): a customer with two saved
// addresses; on their order, Change shows a dropdown of both, the pick goes on the order; a typed new address is
// saved too; New order for the same number offers all of them. Adds its own customer and removes it after.
//   node tests/qa/saved-addresses.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core");
const S = JSON.parse(fs.readFileSync(".git/qa-state.json", "utf8"));
if (!/localhost/.test(S.base) || !/localhost|127\.0\.0\.1/.test(S.dbUrl)) throw new Error("QA only");
const BASE = S.base;
const db = new PrismaClient({ datasources: { db: { url: S.dbUrl } } });
const results = [];
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
async function check(no, name, fn) {
  try {
    results.push({ no, name, pass: true, detail: (await fn()) ?? "" });
  } catch (e) {
    results.push({ no, name, pass: false, detail: String(e.message || e.stack || e).split("\n")[0].slice(0, 300) });
  }
}

const run = Date.now().toString().slice(-6);
const PHONE = `9197${run}11`.slice(0, 12);
const REF = `QA-ADDR-${run}`;
const HOME = "12, 3rd Street, Anna Nagar, Madurai - 625020";
const OFFICE = "45, Bypass Road, KK Nagar, Madurai - 625020";
const NEW = "8, Lake View Road, Sellur, Madurai - 625002";
const now = Date.now();
const cust = await db.customer.create({
  data: {
    clientId: S.shopId,
    name: "QA Two Homes",
    phone: PHONE,
    locationRaw: HOME,
    location: "Anna Nagar",
    addresses: [
      { text: HOME, area: "Anna Nagar", usedAt: new Date(now).toISOString() },
      { text: OFFICE, area: "KK Nagar", usedAt: new Date(now - 86_400_000).toISOString() },
    ],
  },
});
const order = await db.order.create({ data: { ref: REF, clientId: S.shopId, customerId: cust.id, status: "CONFIRMED", paymentMethod: "cod", total: 360, items: [{ id: "x", name: "QA Ghee", quantity: 1, price: 300 }], note: HOME } });
const book = async () => ((await db.customer.findUniqueOrThrow({ where: { id: cust.id } })).addresses ?? []).map((a) => a.text);
const cleanup = async () => {
  await db.order.deleteMany({ where: { customerId: cust.id } });
  await db.customer.delete({ where: { id: cust.id } });
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const m = await ctx.newPage();
m.on("pageerror", (e) => errors.push(String(e.message)));
const card = () => m.locator("article.card", { hasText: REF });
const picker = () => card().locator(`#ads-${order.id}`);
async function toast(re) {
  await m.locator('[role="status"] > div', { hasText: re }).last().waitFor({ timeout: 15_000 }).catch(() => {});
  return (await m.locator('[role="status"]').allInnerTexts()).join(" | ").replace(/\s+/g, " ");
}
async function openChange() {
  await m.goto(`${BASE}/dashboard/orders?q=${encodeURIComponent(REF)}`, { waitUntil: "networkidle" });
  await card().getByRole("button", { name: /^Change$|Add or change address/ }).first().click();
  await picker().waitFor({ timeout: 15_000 });
}

await check(1, "Change on the order shows a dropdown with both saved addresses", async () => {
  await openChange();
  const opts = await picker().locator("option").allInnerTexts();
  expect(opts.length === 3, "options: " + opts.join(" / "));
  expect(opts[1].includes("Latest") && opts[1].includes("Anna Nagar") && opts[2].includes("Bypass Road"), "options: " + opts.join(" / "));
  expect((await picker().inputValue()) === HOME, "the order's address is selected");
  return `${opts.length - 1} saved`;
});

await check(2, "pick the other address and save: it goes on the order and to the top of the list", async () => {
  await picker().selectOption(OFFICE);
  expect((await card().locator("#ad").inputValue()) === OFFICE, "box not filled");
  await card().getByRole("button", { name: "Save", exact: true }).click();
  await toast(/delivery address/i);
  const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(o.note === OFFICE, "order note: " + o.note);
  const list = await book();
  expect(list[0] === OFFICE && list.length === 2, "list: " + list.join(" / "));
  return "office";
});

await check(3, "type a new address by hand: saved on the order and added to the list (old ones kept)", async () => {
  await openChange();
  await picker().selectOption("");
  await card().locator("#ad").fill(NEW);
  await card().getByRole("button", { name: "Save", exact: true }).click();
  await toast(/delivery address/i);
  const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(o.note === NEW, "order note: " + o.note);
  const list = await book();
  expect(list.length === 3 && list[0] === NEW && list.includes(HOME) && list.includes(OFFICE), "list: " + list.join(" / "));
  return "3 saved";
});

await check(4, "New order for that number offers all saved addresses; the pick is the order's address", async () => {
  await m.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
  await m.locator('button[aria-haspopup="dialog"]', { hasText: "New order" }).click();
  await m.fill("#nop", PHONE.slice(2));
  await m.locator("#noas").waitFor({ timeout: 15_000 });
  const opts = await m.locator("#noas option").allInnerTexts();
  expect(opts.length === 4, "options: " + opts.join(" / "));
  await m.selectOption("#noas", HOME);
  expect((await m.inputValue("#noa")) === HOME, "address box: " + (await m.inputValue("#noa")));
  await m.selectOption("#nos", "custom");
  await m.fill("#noc2", "QA Jar");
  await m.fill("#nop2", "100");
  await m.click("#noadd");
  await m.getByRole("button", { name: "Save order" }).click();
  await toast(/Order .* added/);
  const o = await db.order.findFirst({ where: { customerId: cust.id, id: { not: order.id } }, orderBy: { createdAt: "desc" } });
  expect(o && (o.note ?? "").startsWith(HOME), "new order note: " + o?.note);
  expect((await book())[0] === HOME, "used address on top");
  return `${opts.length - 1} offered`;
});

await check(5, "no browser errors", async () => {
  expect(!errors.length, errors.join(" | ").slice(0, 300));
  return "none";
});

await cleanup();
await browser.close();
await db.$disconnect();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
