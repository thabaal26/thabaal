// Orders: waiting orders first, in a real browser against the QA app (tests/qa/serve.mjs). The first card is an order
// still needing work (outlined), delivered and cancelled ones fold under "Delivered and cancelled (N)"; status chips pick
// several statuses at once (and "All" clears them); a link with one list (?show=topack) shows a removable chip; no match
// shows "Clear filters"; phones keep date / payment / source in a Filters bottom sheet; on a computer the bar stays at the
// top while the list scrolls. Reads only (no orders change).
//   node tests/qa/orders-priority.mjs
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

const orders = await db.order.findMany({ where: { clientId: S.shopId }, select: { ref: true, number: true, status: true } });
const statusOf = new Map(orders.map((o) => [o.ref ?? `RG-${o.number}`, o.status]));
const finished = orders.filter((o) => o.status === "DELIVERED" || o.status === "CANCELLED").length;
/** The order refs of the cards in a list, in order ("#QA-1001 · Meena Raj" → QA-1001). */
const refsIn = async (loc) => (await loc.locator("article.card h2").allInnerTexts()).map((t) => (t.match(/#\s*([A-Z0-9-]+)/) ?? [])[1]).filter(Boolean);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function newPage(width, height, mobile = false) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
const page = await newPage(1440, 900);

try {
  await check(1, "All: waiting orders first, the first one outlined; delivered and cancelled folded with their count", async () => {
    await page.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
    const shown = await refsIn(page.locator("#ol"));
    expect(shown.length > 0, "no cards");
    const bad = shown.filter((r) => ["DELIVERED", "CANCELLED"].includes(statusOf.get(r)));
    expect(bad.length === 0, `finished orders in the main list: ${bad.join(", ")}`);
    expect((await page.locator("#ol .ord-first").count()) === 1, "first card not outlined");
    const fold = page.getByTestId("orders-done");
    expect((await fold.getAttribute("open")) === null, "finished orders open by default");
    const label = await fold.locator(":scope > summary").innerText();
    expect(label.includes(`(${finished})`), `fold label "${label}", expected ${finished}`);
    await fold.locator(":scope > summary").click();
    const inFold = await refsIn(fold);
    expect(inFold.length === finished && inFold.every((r) => ["DELIVERED", "CANCELLED"].includes(statusOf.get(r))), `fold has ${inFold.join(",")}`);
    return `${shown.length} waiting first (${shown[0]}), ${finished} folded`;
  });

  await check(2, "Chips pick several statuses at once; the address keeps them; All clears", async () => {
    await page.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
    const chips = page.locator("#oc");
    await chips.getByRole("button", { name: /^Received/ }).click();
    await chips.getByRole("button", { name: /^Delivered/ }).click();
    expect((await chips.getByRole("button", { name: /^Received/ }).getAttribute("aria-pressed")) === "true", "Received not pressed");
    expect((await chips.getByRole("button", { name: /^Delivered/ }).getAttribute("aria-pressed")) === "true", "Delivered not pressed");
    expect((await chips.getByRole("button", { name: /^All/ }).getAttribute("aria-pressed")) === "false", "All still pressed");
    await page.waitForFunction(() => /show=new(%2C|,)done/.test(location.search));
    const shown = await refsIn(page.locator("#ol"));
    const statuses = [...new Set(shown.map((r) => statusOf.get(r)))];
    expect(shown.length > 0 && statuses.every((st) => st === "NEW" || st === "CONFIRMED" || st === "DELIVERED") && statuses.includes("DELIVERED"), `statuses ${statuses.join(",")}`);
    expect((await page.getByTestId("orders-done").count()) === 0, "fold shown while statuses are picked");
    await chips.getByRole("button", { name: /^All/ }).click();
    expect((await chips.getByRole("button", { name: /^Received/ }).getAttribute("aria-pressed")) === "false", "All didn't clear");
    return `Received + Delivered → ${shown.length} (${statuses.join(", ")})`;
  });

  await check(3, "A link with one list (?show=topack) shows it as a chip that can be removed", async () => {
    await page.goto(`${BASE}/dashboard/orders?show=topack`, { waitUntil: "networkidle" });
    const chip = page.locator("#oc").getByRole("button", { name: "Clear this filter" });
    expect((await chip.innerText()).includes("To pack"), "no To pack chip");
    await chip.click();
    expect((await page.locator("#oc").getByRole("button", { name: /^All/ }).getAttribute("aria-pressed")) === "true", "not back to All");
    return "ok";
  });

  await check(4, "Nothing matches: a friendly line and Clear filters, which brings everything back", async () => {
    await page.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
    await page.getByRole("searchbox", { name: "Search orders" }).fill("zzz-no-such-order");
    const empty = page.locator("#oe");
    await empty.waitFor();
    await empty.getByRole("button", { name: "Clear filters" }).click();
    await page.locator("#ol article.card").first().waitFor();
    expect((await page.getByRole("searchbox", { name: "Search orders" }).inputValue()) === "", "search not cleared");
    return "ok";
  });

  await check(5, "Computer: the search and chips bar stays at the top while the list scrolls", async () => {
    await page.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(400);
    const top = await page.locator(".ord-bar").evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(top >= -1 && top <= 4, `bar top ${top}`);
    return `bar top ${top}px after scrolling`;
  });

  await check(6, "Phone: chips in one row, Filters opens a bottom sheet; a payment filter there narrows the list", async () => {
    const m = await newPage(390, 844, true);
    await m.goto(`${BASE}/dashboard/orders`, { waitUntil: "networkidle" });
    expect(!(await m.locator("#fp").isVisible()), "payment dropdown still in the toolbar");
    const before = (await refsIn(m.locator("#ol"))).length;
    await m.getByRole("button", { name: /^Filters/ }).click();
    const sheet = m.getByRole("dialog", { name: "Filters" });
    await sheet.waitFor();
    await sheet.getByLabel("Payment").selectOption("paid");
    await sheet.getByRole("button", { name: /^Show \d+ orders/ }).click();
    await sheet.waitFor({ state: "detached" });
    const after = await refsIn(m.locator("#ol"));
    expect((await m.getByRole("button", { name: /^Filters/ }).innerText()).includes("1"), "no count on Filters");
    const sx = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(sx <= 0, `side scroll ${sx}`);
    const oneRow = await m.locator("#oc").evaluate((el) => getComputedStyle(el).flexWrap === "nowrap");
    expect(oneRow, "chips wrap on the phone");
    await m.screenshot({ path: ".git/shots-orders-phone.png" });
    await m.context().close();
    return `${before} → ${after.length} with Payment: paid`;
  });

  await check(7, "No script errors", async () => {
    expect(!errors.length, errors.slice(0, 2).join(" | "));
    return "none";
  });
} finally {
  await browser.close();
  await db.$disconnect();
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
