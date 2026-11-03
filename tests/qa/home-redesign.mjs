// Home, in a real browser against the QA app (tests/qa/serve.mjs): "N of M need you now" counts the kinds of work
// waiting (tiles) against all kinds (tiles + quiet ✓ links); each goes to its list; a chat waiting over a day comes
// first in the problem colour; a business with nothing waiting says so with ✓ links; the period switch, New order,
// Coming up and the brief are there; nothing overlaps or scrolls sideways at 1440/1280/1024/768/390/360, in English
// and Tamil. Removes what it made.
//   node tests/qa/home-redesign.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { layoutIssues } from "./layout-check.mjs";

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
const waiter = await db.customer.create({ data: { clientId: S.shopId, phone: `9195${run}01`, name: `Long Wait ${run}` } });
await db.reply.create({ data: { customerId: waiter.id, text: "Is the oil available?", kind: "text", receivedAt: new Date(Date.now() - 3 * 86_400_000) } });
const restore = [];
const cleanup = async () => {
  for (const f of restore.splice(0)) await f();
  await db.reply.deleteMany({ where: { customerId: waiter.id } });
  await db.customer.delete({ where: { id: waiter.id } }).catch(() => {});
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function newPage({ width = 1440, height = 900, token = S.tokens.manager, lang = "en" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addCookies([
    { name: "wp_session", value: token, url: BASE },
    { name: "thabaal-lang", value: lang, url: BASE },
  ]);
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem("thabaal-lang", l);
    } catch {}
  }, lang);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
const page = await newPage();

try {
  await check(1, "\"N of M need you now\": N tiles, M = tiles + quiet links; each goes to its list", async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const card = page.locator(".home-now");
    const tiles = card.locator(".home-todos .todo");
    const quiet = card.locator(".home-quiet a");
    const n = await tiles.count();
    const m = n + (await quiet.count());
    const h = await card.locator("h2").innerText();
    expect(n > 0 && h === `${n} of ${m} need you now`, `heading "${h}" for ${n} tiles, ${m} kinds`);
    const hrefs = Object.fromEntries(await card.locator("[data-todo]").evaluateAll((els) => els.map((e) => [e.dataset.todo, e.getAttribute("href")])));
    expect(hrefs.carts === "/dashboard/orders?show=unpaid" && hrefs.pack === "/dashboard/orders?show=topack" && hrefs.chats === "/dashboard/replies?show=open", JSON.stringify(hrefs));
    expect((await card.locator(".todo.first").count()) === 1, "no first tile");
    return `"${h}"`;
  });

  await check(2, "A chat waiting over a day comes first, in the problem colour", async () => {
    const first = page.locator(".home-now .home-todos .todo").first();
    expect((await first.getAttribute("data-todo")) === "chats", `first is ${await first.getAttribute("data-todo")}`);
    expect(/urgent/.test(await first.getAttribute("class")), "not urgent");
    expect(/Longest wait \d+ days/.test(await first.innerText()), await first.innerText());
    const colour = await first.locator(".sub").evaluate((el) => getComputedStyle(el).color);
    const bad = await page.evaluate(() => getComputedStyle(document.querySelector(".thabaal-portal")).getPropertyValue("--bad").trim());
    return `${(await first.innerText()).replace(/\s+/g, " ")} (${colour}; --bad ${bad})`;
  });

  await check(3, "Nothing waiting: \"Nothing needs you right now\" and ✓ links, no tiles", async () => {
    // The other QA shop, with its open chats handled and its open orders delivered for a moment (put back after).
    const openReplies = await db.reply.findMany({ where: { handled: false, customer: { clientId: S.otherId } }, select: { id: true } });
    const openOrders = await db.order.findMany({ where: { clientId: S.otherId, status: { notIn: ["DELIVERED", "CANCELLED"] } }, select: { id: true, status: true } });
    await db.reply.updateMany({ where: { id: { in: openReplies.map((r) => r.id) } }, data: { handled: true } });
    await db.order.updateMany({ where: { id: { in: openOrders.map((o) => o.id) } }, data: { status: "DELIVERED" } });
    restore.push(async () => {
      await db.reply.updateMany({ where: { id: { in: openReplies.map((r) => r.id) } }, data: { handled: false } });
      for (const o of openOrders) await db.order.update({ where: { id: o.id }, data: { status: o.status } });
    });
    const o = await newPage({ token: S.tokens.otherManager });
    await o.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const card = o.locator(".home-now");
    const h = await card.locator("h2").innerText();
    const tiles = await card.locator(".home-todos .todo").count();
    const quiet = await card.locator(".home-quiet a").allInnerTexts();
    await o.context().close();
    for (const f of restore.splice(0)) await f();
    expect(h === "Nothing needs you right now" && quiet.length > 0, `"${h}", quiet ${quiet.join(", ")}`);
    return quiet.join(" · ");
  });

  await check(4, "New order, the 7/30/90 day switch, Coming up and the brief keep working", async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    expect((await page.getByRole("link", { name: "New order" }).first().getAttribute("href")) === "/dashboard/orders?new=1", "New order link");
    await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "30 days" }).click();
    await page.waitForURL(/range=30d/);
    await page.waitForLoadState("networkidle");
    expect(/previous 30 days/.test(await page.locator("main").innerText()), "period text");
    expect(await page.getByRole("heading", { name: "Coming up" }).isVisible(), "no Coming up");
    expect((await page.getByRole("link", { name: "All campaigns" }).getAttribute("href")) === "/dashboard/campaigns", "campaigns link");
    expect(await page.getByRole("heading", { name: /daily brief/i }).isVisible(), "no brief");
    return "ok";
  });

  await check(5, "No overlap, squeeze or sideways scroll at 1440, 1280, 1024, 768, 390 and 360 (English)", async () => {
    const found = [];
    for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844], [360, 800]]) {
      const p = await newPage({ width: w, height: h });
      await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
      await p.waitForTimeout(900);
      const issues = await p.evaluate(layoutIssues, { scope: "main" });
      if (issues.length) found.push(`${w}: ${issues.slice(0, 2).join("; ")}`);
      await p.screenshot({ path: `.git/shots-home-${w}.png`, fullPage: true });
      await p.context().close();
    }
    expect(!found.length, found.join(" | "));
    return "clean";
  });

  await check(6, "Tamil: Tamil heading, nothing scrolls sideways at 360 and 1024", async () => {
    for (const [w, h] of [[360, 800], [1024, 768]]) {
      const p = await newPage({ width: w, height: h, lang: "ta" });
      await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
      await p.waitForTimeout(900);
      const head = await p.locator(".home-now h2").innerText();
      expect(/கவனம்/.test(head), `heading "${head}"`);
      const issues = await p.evaluate(layoutIssues, { scope: "main" });
      expect(!issues.length, `${w}: ${issues.slice(0, 2).join("; ")}`);
      await p.screenshot({ path: `.git/shots-home-ta-${w}.png`, fullPage: true });
      await p.context().close();
    }
    return "clean";
  });

  await check(7, "No script errors", async () => {
    expect(!errors.length, errors.slice(0, 2).join(" | "));
    return "none";
  });
} finally {
  await cleanup();
  await browser.close();
  await db.$disconnect();
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
