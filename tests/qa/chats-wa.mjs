// Chats in WhatsApp's layout, in a real browser against the QA app (tests/qa/serve.mjs): the chat list (initials,
// unread count, our ticks, search, filters inside the list), the open chat (header, bubbles with tails, ticks, day
// line), contact info, the ⋮ menu, the composer (emoji, Enter sends, closed window → template), Create order
// filling the number on Orders, and phones (list first, a chat full screen, back). Screenshots in four looks go to
// .git/shots-chats-*.png. Removes what it made.
//   node tests/qa/chats-wa.mjs
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
const ago = (min) => new Date(Date.now() - min * 60_000);
const mk = (k, name, extra = {}) => db.customer.create({ data: { clientId: S.shopId, phone: `9194${run}${k}`, name, ...extra } });
const tpl = await db.template.findFirstOrThrow({ where: { clientId: S.shopId, status: "APPROVED" } });
const chatty = await mk("01", `Meena Kumari ${run}`, { tags: ["vip", "madurai"], location: "Sellur" });
const closed = await mk("02", `Old Chat ${run}`);
const payer = await mk("03", `Paid Claim ${run}`);
const sentOnly = await mk("04", `Poster Only ${run}`);
const ids = [chatty.id, closed.id, payer.id, sentOnly.id];
await db.message.create({ data: { customerId: chatty.id, templateId: tpl.id, templateName: tpl.name, status: "READ", sentAt: ago(50), readAt: ago(45), body: "QA poster: oils 10% off" } });
await db.reply.create({ data: { customerId: chatty.id, text: "View Products", kind: "button", receivedAt: ago(40) } });
await db.reply.create({ data: { customerId: chatty.id, text: "Groundnut oil 1L evlo?", kind: "text", receivedAt: ago(39) } });
await db.message.create({ data: { customerId: chatty.id, templateName: "Typed reply", status: "DELIVERED", sentAt: ago(30), body: "₹360 madam" } });
await db.reply.create({ data: { customerId: chatty.id, text: "Ok 2 venum", kind: "text", receivedAt: ago(5) } });
await db.order.create({ data: { ref: `QA-W${run}`, clientId: S.shopId, customerId: chatty.id, items: [{ id: "QA-1", name: "Ghee", quantity: 1, price: 150 }], total: 150, status: "DELIVERED", paidAt: ago(3000) } });
await db.reply.create({ data: { customerId: closed.id, text: "Thanks", kind: "text", receivedAt: ago(60 * 50), handled: true } });
await db.reply.create({ data: { customerId: payer.id, text: "Paid ₹360 by UPI", kind: "text", receivedAt: ago(20) } });
await db.order.create({
  data: { ref: `QA-P${run}`, clientId: S.shopId, customerId: payer.id, items: [{ id: "QA-2", name: "Groundnut oil 1L", quantity: 1, price: 360 }], total: 360, status: "CONFIRMED", paymentClaimedAt: new Date(), paymentRequestedAt: new Date() },
});
await db.message.create({ data: { customerId: sentOnly.id, templateId: tpl.id, templateName: tpl.name, status: "FAILED", sentAt: ago(10), error: "131026", body: "QA poster" } });
const cleanup = async () => {
  await db.order.deleteMany({ where: { customerId: { in: ids } } });
  await db.message.deleteMany({ where: { customerId: { in: ids } } });
  await db.reply.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function newPage({ width = 1440, height = 900, theme = null, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
  if (theme)
    await ctx.addInitScript((t) => {
      try {
        if (t === "dark") localStorage.setItem("theme", "dark");
        if (t === "night") localStorage.setItem("thabaal-theme", "night");
      } catch {}
    }, theme);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}
const page = await newPage();
const list = () => page.getByRole("navigation", { name: "Customer conversations" });
const convo = (name) => page.getByRole("region", { name: new RegExp(`Conversation with ${name}`) });
const toast = async () => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" | ");

try {
  await check(1, "List rows: initials, unread count, 'You sent:' with ticks, 'Tapped:'", async () => {
    await page.goto(`${BASE}/dashboard/replies`, { waitUntil: "networkidle" });
    const row = list().getByRole("link", { name: new RegExp(chatty.name) });
    expect((await row.locator(".wa-av").innerText()).trim() === "MK", `initials ${await row.locator(".wa-av").innerText()}`);
    expect((await row.locator(".wa-badge").innerText()).trim() === "3", `badge ${await row.locator(".wa-badge").count()}`);
    const sent = list().getByRole("link", { name: new RegExp(sentOnly.name) });
    const st = await sent.innerText();
    expect(/You sent:/.test(st) && /Not delivered/.test(st) && (await sent.locator(".wa-badge").count()) === 0, `sent row: ${st}`);
    return `${(await row.innerText()).replace(/\s+/g, " ")} | ${st.replace(/\s+/g, " ")}`;
  });

  await check(2, "Search finds by name and by number; filters sit inside the list", async () => {
    const box = page.getByRole("searchbox", { name: "Search chats" });
    await box.fill(`Meena Kumari ${run}`);
    expect((await list().getByRole("link").count()) === 1, "name search");
    await box.fill(`94${run}03`);
    const n = await list().getByRole("link").count();
    expect(n === 1 && /Paid Claim/.test(await list().innerText()), `number search ${n}`);
    await box.fill("");
    const f = page.locator(".wa-list .wa-filters").getByRole("link", { name: /Open/ });
    await f.click();
    await page.waitForURL(/show=open/);
    await page.waitForLoadState("networkidle");
    expect((await f.getAttribute("aria-current")) === "true", "Open not current");
    expect((await list().getByRole("link", { name: new RegExp(closed.name) }).count()) === 0, "handled chat in Open");
    return "ok";
  });

  await check(3, "Open chat: header, free-reply pill, bubbles with tails, read ticks, day line", async () => {
    await page.goto(`${BASE}/dashboard/replies?r=${chatty.id}`, { waitUntil: "networkidle" });
    const c = convo(chatty.name);
    expect(/Free replies · \d+h \d+m left/.test(await c.locator(".wa-win").innerText()), `pill ${await c.locator(".wa-win").innerText()}`);
    const msgs = c.locator(".wa-msgs > li");
    const kinds = await msgs.evaluateAll((els) => els.map((e) => e.className));
    expect(kinds.some((k) => /wa-day/.test(k)), "no day line");
    // out (poster) → in (tap) → in (text) → out (typed) → in: tails on the first of each run only.
    const runs = kinds.filter((k) => !/wa-day/.test(k));
    expect(runs.join(",") === "out first,in first,in,out first,in first", `runs ${runs.join(",")}`);
    const read = await c.locator(".wa-msgs .read").count();
    expect(read === 1, `read ticks ${read}`);
    expect(/Tapped a button/.test(await c.innerText()), "tap label");
    return runs.join(",");
  });

  await check(4, "Contact info: opens from the header, shows tags, area and latest order; Escape closes", async () => {
    await page.locator(".wa-who").click();
    const info = page.getByRole("complementary", { name: "Contact info" });
    await info.waitFor();
    const t = await info.innerText();
    expect(/vip/.test(t) && /Sellur/.test(t) && new RegExp(`QA-W${run}`).test(t) && /Delivered/.test(t), `info: ${t.slice(0, 200)}`);
    await page.screenshot({ path: ".git/shots-chats-info.png" });
    await page.keyboard.press("Escape");
    await info.waitFor({ state: "detached" });
    return "ok";
  });

  await check(5, "⋮ menu: items, Create order has the number, Mark handled saves", async () => {
    await page.getByRole("button", { name: "More chat options" }).click();
    const menu = page.locator(".wa-ch .wa-menu");
    const t = await menu.innerText();
    expect(/Contact info/.test(t) && /Send catalogue/.test(t) && /Send template/.test(t) && /Create order/.test(t), `menu: ${t}`);
    expect(new RegExp(`phone=9194${run}01`).test(await menu.getByRole("menuitem", { name: "Create order" }).getAttribute("href")), "phone not in link");
    await menu.getByRole("button", { name: "Mark handled" }).click();
    for (let i = 0; i < 30; i++) {
      if ((await db.reply.count({ where: { customerId: chatty.id, handled: false } })) === 0) break;
      await page.waitForTimeout(300);
    }
    expect((await db.reply.count({ where: { customerId: chatty.id, handled: false } })) === 0, `not handled; toast ${await toast()}`);
    await page.keyboard.press("Escape");
    return "handled";
  });

  await check(6, "Composer: emoji goes in, Enter sends, the message shows in the chat", async () => {
    await page.goto(`${BASE}/dashboard/replies?r=${chatty.id}`, { waitUntil: "networkidle" });
    const box = page.getByRole("textbox", { name: "Your reply" });
    await box.fill(`QA hello ${run} `);
    await page.getByRole("button", { name: "Emoji" }).click();
    await page.getByRole("button", { name: "🙏" }).click();
    expect((await box.inputValue()).endsWith("🙏"), `value ${await box.inputValue()}`);
    await box.press("Enter");
    let m = null;
    for (let i = 0; i < 40 && !m; i++) {
      m = await db.message.findFirst({ where: { customerId: chatty.id, body: { contains: `QA hello ${run}` } } });
      if (!m) await page.waitForTimeout(300);
    }
    expect(m, `not sent; toast ${await toast()}`);
    // The QA app has no WhatsApp number, so the send is logged as failed: the toast says why and the text stays
    // in the box to try again; after a refresh the failed message shows in the chat.
    if (m.status === "FAILED") {
      expect((await box.inputValue()).includes(`QA hello ${run}`), "text lost after a failed send");
      await page.reload({ waitUntil: "networkidle" });
      const last = page.locator(".wa-msgs > li").last();
      const lt = await last.innerText();
      expect(lt.includes(`QA hello ${run}`) && /Not delivered/.test(lt) && (await last.locator(".wa-b.bad").count()) === 1, `last bubble: ${lt}`);
      return `failed send shown as Not delivered (${(m.error ?? "").slice(0, 60)})`;
    }
    await page.waitForFunction((t) => document.querySelector(".wa-msgs")?.textContent?.includes(t), `QA hello ${run}`, { timeout: 15000 }).catch(async (e) => {
      await page.screenshot({ path: ".git/shots-chats-send-fail.png" });
      throw new Error(`${e.message.split("\n")[0]}; status ${m.status}; last bubble: ${(await page.locator(".wa-msgs > li").last().innerText()).slice(0, 80)}`);
    });
    expect((await box.inputValue()) === "", "box not cleared");
    return `sent (${m.status})`;
  });

  await check(7, "Closed window: no message box, Send template offered", async () => {
    await page.goto(`${BASE}/dashboard/replies?r=${closed.id}`, { waitUntil: "networkidle" });
    const c = convo(closed.name);
    expect((await c.getByRole("textbox", { name: "Your reply" }).count()) === 0, "box shown");
    expect(await c.getByRole("link", { name: "Send template" }).first().isVisible(), "no template link");
    expect(/Free replies closed/.test(await c.locator(".wa-win").innerText()), "pill");
    return "ok";
  });

  await check(8, "Says paid: the chip opens Record payment", async () => {
    await page.goto(`${BASE}/dashboard/replies?r=${payer.id}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Payment received: confirm" }).first().click();
    const sh = page.getByRole("dialog").filter({ hasText: "Record payment" }).last();
    await sh.waitFor();
    await page.keyboard.press("Escape");
    return "opened";
  });

  await check(9, "Create order opens New order on Orders with the number filled in", async () => {
    await page.goto(`${BASE}/dashboard/orders?new=1&phone=9194${run}01`, { waitUntil: "networkidle" });
    const v = await page.locator('input[type=tel][autocomplete=tel]').first().inputValue().catch(() => "");
    expect(v.replace(/\D/g, "").endsWith(`94${run}01`), `phone field "${v}"`);
    return v;
  });

  await check(10, "Desktop: list and chat scroll on their own; the page doesn't scroll sideways", async () => {
    await page.goto(`${BASE}/dashboard/replies?r=${chatty.id}`, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const wa = document.querySelector(".wa-app").getBoundingClientRect();
      const comp = document.querySelector(".wa-comp").getBoundingClientRect();
      return { waBottom: wa.bottom, compBottom: comp.bottom, vh: innerHeight, sx: document.documentElement.scrollWidth - innerWidth };
    });
    expect(m.sx <= 0, `side scroll ${m.sx}`);
    expect(Math.abs(m.waBottom - m.compBottom) < 3, `composer not at bottom ${JSON.stringify(m)}`);
    return JSON.stringify(m);
  });

  // Four looks: light, the app's Dark, the website's night theme, a 390px phone.
  for (const theme of [null, "dark", "night"]) {
    const p2 = await newPage({ theme });
    await p2.goto(`${BASE}/dashboard/replies?r=${chatty.id}`, { waitUntil: "networkidle" });
    await p2.screenshot({ path: `.git/shots-chats-${theme ?? "light"}.png` });
    await p2.context().close();
  }

  // A tablet (bottom tabs, side-by-side layout).
  {
    const t = await newPage({ width: 1000, height: 800 });
    await t.goto(`${BASE}/dashboard/replies?r=${chatty.id}`, { waitUntil: "networkidle" });
    await t.screenshot({ path: ".git/shots-chats-tablet.png" });
    await t.context().close();
  }

  await check(11, "Phone 390px: list first, a chat opens full screen, back returns to the list", async () => {
    const m = await newPage({ width: 390, height: 844, mobile: true });
    await m.goto(`${BASE}/dashboard/replies`, { waitUntil: "networkidle" });
    const chat = m.locator(".wa-chat");
    expect(!(await chat.isVisible()), "chat shown before picking");
    await m.screenshot({ path: ".git/shots-chats-phone-list.png" });
    const row = m.getByRole("navigation", { name: "Customer conversations" }).getByRole("link", { name: new RegExp(chatty.name) });
    await row.click({ timeout: 10000 }).catch((e) => {
      throw new Error(e.message.split("\n").filter((l) => /intercept|visible|stable|retrying|waiting/.test(l)).slice(-4).join(" / "));
    });
    await m.waitForURL(new RegExp(`r=${chatty.id}`));
    await m.waitForLoadState("networkidle");
    const box = await chat.boundingBox();
    expect(box && box.x === 0 && box.y === 0 && Math.round(box.width) === 390, `chat box ${JSON.stringify(box)}`);
    const comp = await m.locator(".wa-comp").boundingBox();
    expect(comp && comp.y + comp.height <= 845, `composer off screen ${JSON.stringify(comp)}`);
    // Nothing covers it: the back arrow and the message box are on top (not the app's top bar or bottom tabs).
    const onTop = await m.evaluate(() =>
      [".wa-back", ".wa-comp textarea"].map((sel) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    );
    expect(onTop.every(Boolean), `covered: back ${onTop[0]}, box ${onTop[1]}`);
    const sx = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(sx <= 0, `side scroll ${sx}`);
    await m.screenshot({ path: ".git/shots-chats-phone-chat.png" });
    await m.getByRole("button", { name: "All chats" }).click();
    expect(!(await chat.isVisible()), "still in chat after back");
    await m.goto(`${BASE}/dashboard/replies?r=${payer.id}`, { waitUntil: "networkidle" });
    expect(await chat.isVisible(), "link with ?r= didn't open the chat");
    await m.context().close();
    return "ok";
  });

  await check(12, "No script errors", async () => {
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
