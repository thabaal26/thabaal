// Orders on another number, in a real browser against the QA app (tests/qa/serve.mjs): Payments › Payment settings ›
// How orders work saves the main number (not the connected one), shows the Chat to Order link, and that link opens
// WhatsApp with the main number; a message or a cart to the connected number is saved in Chats but makes no order;
// Duplicate turns a flyer template into a Tamil-poster and an English-poster copy with a Call to Order button and a
// Chat to Order reply button (no link button: WhatsApp would show its web address under the picture), same message. Puts the QA shop back after.
//   node tests/qa/orders-elsewhere.mjs [tamilPoster.jpg] [englishPoster.jpg]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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

// Any two JPGs do; by default the posters kept next to the repo (../thenan-templates).
const posters = [process.argv[2] ?? "../thenan-templates/tamil-poster.jpg", process.argv[3] ?? "../thenan-templates/english-poster.jpg"].map((p) => path.resolve(p));
for (const p of posters) expect(fs.existsSync(p), `missing ${p}`);

const MAIN = "918925390439";
const BODY = "🚚 Thenan Cold Pressed Oils manufactures:\n\n• 100% Pure — 10 different types of Oils\n• Ghee and Paneer from cow's milk\n• 13 other different staple products\n\n🚚 Right to your doorstep @ Madurai —\nOur vehicle with all the products!\nWe ship across India 📦\n\nwww.thenanoils.com";
const run = Date.now().toString().slice(-6);
const phones = ["1", "2"].map((k) => `9195${run}0${k}`);
const shop = await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { name: true, paySettings: true } });
const number = await db.whatsAppNumber.findFirstOrThrow({ where: { clientId: S.shopId }, select: { phoneNumberId: true, displayPhone: true, businessAccountId: true } });
const flyer = await db.template.create({
  data: {
    clientId: S.shopId,
    businessAccountId: number.businessAccountId,
    name: `qa_doorstep_flyer_${run}`,
    category: "MARKETING",
    language: "en",
    status: "APPROVED",
    headerType: "IMAGE",
    headerMediaUrl: "https://www.thabaal.in/api/upload/qa-flyer.jpg",
    body: BODY,
    buttons: [{ type: "PHONE_NUMBER", text: "Call to Order", phone: `+${MAIN}` }, { type: "QUICK_REPLY", text: "View Price List" }],
  },
});
const made = [];
const cleanup = async () => {
  await db.client.update({ where: { id: S.shopId }, data: { paySettings: shop.paySettings ?? {} } });
  await db.template.deleteMany({ where: { id: { in: [flyer.id, ...made] } } });
  const ids = (await db.customer.findMany({ where: { clientId: S.shopId, phone: { in: phones } }, select: { id: true } })).map((c) => c.id);
  await db.message.deleteMany({ where: { customerId: { in: ids } } });
  await db.reply.deleteMany({ where: { customerId: { in: ids } } });
  await db.order.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
};

async function hook(from, message) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "qa", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: number.phoneNumberId, display_phone_number: "919990001999" }, contacts: [{ wa_id: from, profile: { name: "Elsewhere Q" } }], messages: [{ from, id: `wamid.qa.else.${from}.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), ...message }] } }] }],
  });
  const sig = "sha256=" + crypto.createHmac("sha256", S.metaSecret).update(body).digest("hex");
  const r = await fetch(`${BASE}/api/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
  expect(r.status === 200, `webhook ${r.status}`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const toast = async () => (await page.locator("[role=status], [role=alert]").allInnerTexts()).join(" | ");
const card = () => page.getByTestId("order-handling");
const openSettings = async () => {
  await page.goto(`${BASE}/dashboard/revenue?tab=set`, { waitUntil: "networkidle" });
  await card().waitFor();
};

try {
  await check(1, "How orders work: one way at a time, the connected number is refused as the main number", async () => {
    await openSettings();
    expect(await card().getByRole("radio", { name: /Orders and payments on this number/ }).isChecked(), "not on 'this number' by default");
    await card().getByRole("radio", { name: /Send customers to your main number/ }).check();
    expect(/How it works/.test(await card().innerText()), "no explanation of the flow");
    if (number.displayPhone) {
      await page.locator("#oh-phone").fill(number.displayPhone);
      await card().getByRole("button", { name: "Save" }).click();
      await page.waitForTimeout(1200);
      expect(/connected to thabaal/i.test(await toast()), `no refusal: ${await toast()}`);
    }
    return number.displayPhone ? "connected number refused" : "QA number has no display phone";
  });

  await check(2, "the main number saves; the card says to use a Reply button (no thabaal link to copy)", async () => {
    await page.locator("#oh-phone").fill("89253 90439");
    await card().getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(1500);
    const s = (await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { paySettings: true } })).paySettings;
    expect(s?.orderPhone === MAIN, `saved ${s?.orderPhone}`);
    await openSettings();
    const text = await card().innerText();
    expect(/Reply button named Chat to Order/.test(text), "no Reply button advice");
    expect(!/thabaal\.in/.test(text) && !(await page.locator("#oh-link").count()), "a thabaal link is still shown");
    return "Reply button advised";
  });

  await check(9, "order by calling: saves, and the card explains View Products and the price list", async () => {
    await page.locator("#oh-by").selectOption("call");
    expect(/Reply button named View Products/.test(await card().innerText()), "steps don't follow the choice");
    await card().getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(1500);
    const s = (await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { paySettings: true } })).paySettings;
    expect(s?.orderBy === "call" && s?.orderPhone === MAIN, `saved ${s?.orderBy} ${s?.orderPhone}`);
    expect(/asked to call \+918925390439/.test(await toast()), `toast: ${await toast()}`);
    await openSettings();
    expect((await page.locator("#oh-by").inputValue()) === "call", "choice not kept");
    expect(/price list/.test(await card().innerText()), "no price list step");
    return "call";
  });

  await check(3, "the Chat to Order link opens WhatsApp with the main number, the order typed in; an unknown shop is 404", async () => {
    const r = await fetch(`${BASE}/go/${S.shopId}`, { redirect: "manual" });
    expect(r.status === 302, `status ${r.status}`);
    const to = new URL(r.headers.get("location") ?? "");
    expect(`${to.origin}${to.pathname}` === `https://wa.me/${MAIN}`, String(to));
    expect(to.searchParams.get("text") === `Hi ${shop.name}, I'd like to order.`, `text ${to.searchParams.get("text")}`);
    expect((await fetch(`${BASE}/go/doesnotexist1234`, { redirect: "manual" })).status === 404, "unknown shop not 404");
    // WhatsApp's link preview doesn't follow the redirect: it gets the shop's own name, never thabaal's sign-in page.
    const bot = await fetch(`${BASE}/go/${S.shopId}`, { redirect: "manual", headers: { "user-agent": "WhatsApp/2.23.20.0 A" } });
    const html = await bot.text();
    expect(bot.status === 200, `preview ${bot.status}`);
    expect(html.includes(`<meta property="og:title" content="${shop.name} · Chat to Order">`), "no shop title in the preview");
    expect(!/thabaal|sign in/i.test(html.replace(/<meta property="og:image"[^>]*>/, "")), "preview mentions thabaal");
    expect(html.includes(`url=https://wa.me/${MAIN}`), "preview page doesn't go on to WhatsApp");
    return String(to);
  });

  await check(4, "a message to the connected number is saved in Chats; no order", async () => {
    await hook(phones[0], { type: "text", text: { body: "Hi, I want 2 litre groundnut oil" } });
    const c = await db.customer.findUnique({ where: { clientId_phone: { clientId: S.shopId, phone: phones[0] } }, select: { id: true, replies: { select: { text: true } } } });
    expect(c?.replies.some((x) => /groundnut/.test(x.text)), "reply not saved");
    expect((await db.order.count({ where: { customerId: c.id } })) === 0, "an order was made");
    return "saved, no order";
  });

  await check(5, "a catalogue cart to the connected number is not saved as an order", async () => {
    await hook(phones[1], { type: "order", order: { catalog_id: "qa-cat", product_items: [{ product_retailer_id: "QA-OIL-1L", quantity: 2, item_price: 300, currency: "INR" }] } });
    const c = await db.customer.findUnique({ where: { clientId_phone: { clientId: S.shopId, phone: phones[1] } }, select: { id: true, replies: { select: { text: true } } } });
    expect(c?.replies.some((x) => /Placed an order from the catalogue/.test(x.text)), "cart not in Chats");
    expect((await db.order.count({ where: { customerId: c.id } })) === 0, "the cart became an order");
    return "in Chats, no order";
  });

  for (const [i, [poster, label]] of [[posters[0], "tamil"], [posters[1], "english"]].entries()) {
    await check(6 + i, `Duplicate: the ${label} poster copy keeps the message, Call to Order and a Chat to Order reply button`, async () => {
      errors.length = 0;
      await page.goto(`${BASE}/dashboard/templates/new?from=${flyer.id}`, { waitUntil: "networkidle" });
      const name = `qa_doorstep_${label}_poster_${run}`;
      await page.locator('input[placeholder="weekend_offer"]').fill(name);
      await page.locator('input[type="file"][accept="image/jpeg,image/png"]').setInputFiles(poster);
      await page.waitForFunction((orig) => { const v = document.querySelector('input[aria-label="Image link"]')?.value ?? ""; return v !== orig && /\/api\/upload\//.test(v); }, flyer.headerMediaUrl, { timeout: 20_000 });
      // The QA app hands out http://localhost upload links; live ones are https://www.thabaal.in, which Meta needs.
      const uploaded = await page.locator('input[aria-label="Image link"]').inputValue();
      await page.locator('input[aria-label="Image link"]').fill(uploaded.replace(/^http:\/\/localhost:\d+/, "https://www.thabaal.in"));
      await page.getByRole("button", { name: "Remove button 2" }).click();
      await page.getByRole("button", { name: /^Reply$/ }).click();
      await page.getByLabel("Button 2 label").fill("Chat to Order");
      await page.getByRole("button", { name: "Create template" }).first().click();
      await page.waitForURL(/\/dashboard\/templates\/(?!new)/, { timeout: 20_000 }).catch(() => {});
      const t = await db.template.findFirst({ where: { clientId: S.shopId, name } });
      expect(t, `not saved: ${await toast()}`);
      made.push(t.id);
      expect(t.body === BODY, "message changed");
      expect(t.headerType === "IMAGE" && /^https:\/\/www\.thabaal\.in\/api\/upload\//.test(t.headerMediaUrl ?? ""), `header ${t.headerMediaUrl}`);
      const b = t.buttons;
      expect(b.length === 2 && b[0].type === "PHONE_NUMBER" && b[0].text === "Call to Order" && b[0].phone === `+${MAIN}`, `call ${JSON.stringify(b[0])}`);
      expect(b[1].type === "QUICK_REPLY" && b[1].text === "Chat to Order" && !b[1].url, `chat ${JSON.stringify(b[1])}`);
      expect(!errors.length, `script error: ${errors[0]}`);
      await page.screenshot({ path: `.git/shots-elsewhere/template-${label}.png`, fullPage: false }).catch(() => {});
      return `${name} · ${t.status}`;
    });
  }

  await check(8, "back to orders and payments on this number", async () => {
    await openSettings();
    await card().getByRole("radio", { name: /Orders and payments on this number/ }).check();
    await card().getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(1500);
    const s = (await db.client.findUniqueOrThrow({ where: { id: S.shopId }, select: { paySettings: true } })).paySettings;
    expect(!s?.orderPhone, `still ${s?.orderPhone}`);
    return "off";
  });
} finally {
  await browser.close();
  await cleanup();
  await db.$disconnect();
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
