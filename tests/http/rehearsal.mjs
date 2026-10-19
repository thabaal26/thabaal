// Phase 1 gate: onboard three different businesses through the real admin screens, on the test database, and check
// each one works on its own: no WhatsApp borrowed, its own order numbers, its business type's fields, wallet billing,
// every page loading on desktop and phone. Local only (needs Chrome): node tests/run.mjs --http --rehearsal
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3200";
const PW = process.env.PLAYWRIGHT_CORE ?? "C:/Users/step1/pwtmp/node_modules/playwright-core/index.js";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const pw = await import(new URL(`file:///${PW}`).href);
const chromium = pw.chromium ?? pw.default.chromium;
const db = new PrismaClient();
const results = [];
const check = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const CLIENTS = [
  { name: "Fresh Mart", city: "Chennai", type: "retail", prefix: "FM", field: "Birthday", wallet: true },
  { name: "Spice Route Kitchen", city: "Coimbatore", type: "restaurant", prefix: "SRK", field: "Food preference", wallet: false },
  { name: "Glow Salon", city: "Bangalore", type: "service", prefix: "GS", field: "Preferred time", wallet: false },
];
const PAGES = ["/dashboard", "/dashboard/customers", "/dashboard/settings/fields", "/dashboard/orders", "/dashboard/replies", "/dashboard/campaigns", "/dashboard/campaigns/new", "/dashboard/templates", "/dashboard/catalogue", "/dashboard/wallet", "/dashboard/report", "/dashboard/settings"];

const admin = await db.user.create({ data: { email: "admin@rehearsal.test", name: "Rehearsal Admin", passwordHash: "x", role: "ADMIN", access: "MANAGER" } });
const token = await new SignJWT({ sub: admin.id, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const b = await chromium.launch({ executablePath: CHROME });
const errors = [];
const ctxFor = async (cookies, vp = { width: 1280, height: 900 }) => {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.addCookies(cookies.map(([name, value]) => ({ name, value, url: BASE })));
  return ctx;
};
const text = (p) => p.evaluate(() => document.body.innerText);

try {
  // 1. The admin adds the three businesses through the New client form.
  const a = await (await ctxFor([["wp_session", token]])).newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  for (const c of CLIENTS) {
    await a.goto(BASE + "/dashboard/clients", { waitUntil: "networkidle", timeout: 120000 });
    await a.getByRole("button", { name: "New client" }).click();
    await a.locator("#client-name").fill(c.name);
    await a.locator("#client-city").fill(c.city);
    await a.locator("#client-type").selectOption(c.type);
    await a.locator("form:has(#client-name) button[type=submit]").click();
    await a.waitForTimeout(2500);
    const row = await db.client.findUnique({ where: { name: c.name } });
    check(`${c.name}: created as ${c.type} in ${c.city}`, Boolean(row && row.homeCity === c.city && row.businessType === c.type));
    check(`${c.name}: order numbers start ${c.prefix}-1001`, row?.orderPrefix === c.prefix, row?.orderPrefix ?? "none");
    c.id = row?.id;
  }

  for (const c of CLIENTS) {
    if (!c.id) continue;
    const ctx = await ctxFor([["wp_session", token], ["wp_client", c.id]]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${c.name} ${p.url()}: ${String(e).slice(0, 160)}`));
    // 2. Every main page loads for this business.
    let bad = [];
    for (const u of PAGES) {
      const r = await p.goto(BASE + u, { waitUntil: "networkidle", timeout: 120000 });
      const t = await text(p);
      if (r.status() !== 200 || /Application error|Something went wrong|Internal Server Error/i.test(t) || p.url().includes("/login")) bad.push(`${u} ${r.status()}`);
    }
    check(`${c.name}: ${PAGES.length} pages load`, !bad.length, bad.join(", "));
    // 3. It never borrows another business's WhatsApp: the sidebar says it isn't connected.
    await p.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    check(`${c.name}: shows "WhatsApp not connected" until its own number is added`, (await text(p)).includes("WhatsApp not connected"));
    // 4. Its business type's starter fields are there.
    await p.goto(BASE + "/dashboard/settings/fields", { waitUntil: "networkidle" });
    check(`${c.name}: starter field "${c.field}" ready`, (await p.locator(`input[value="${c.field}"]`).count()) > 0 || (await text(p)).includes(c.field));
    // 5. Catalogue: a clear setup message, never someone else's products.
    await p.goto(BASE + "/dashboard/catalogue", { waitUntil: "networkidle" });
    const cat = await text(p);
    check(`${c.name}: catalogue asks to connect, shows no other shop's products`, /No catalogue connected yet|connect/i.test(cat) && !/Groundnut|Gingelly|Thenan/i.test(cat));
    // 6. Wallet billing, for the business that uses it.
    if (c.wallet) {
      await p.goto(BASE + "/dashboard/wallet", { waitUntil: "networkidle" });
      await p.getByText("Thabaal wallet", { exact: true }).click();
      await p.getByRole("button", { name: "Save billing" }).click();
      await p.waitForTimeout(2500);
      const row = await db.client.findUnique({ where: { id: c.id }, select: { billingMode: true } });
      await p.reload({ waitUntil: "networkidle" });
      check(`${c.name}: wallet billing on, campaigns wait for money`, row?.billingMode === "wallet" && (await text(p)).includes("Campaigns are stopped"));
    }
    // 7. Phone layout: nothing wider than the screen.
    const ph = await (await ctxFor([["wp_session", token], ["wp_client", c.id]], { width: 390, height: 844 })).newPage();
    await ph.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    const w = await ph.evaluate(() => document.documentElement.scrollWidth);
    check(`${c.name}: fits a phone screen`, w <= 392, `${w}px`);
    await ph.screenshot({ path: `.git/rehearsal-${c.prefix}.png`, fullPage: false });
  }
  check("no script errors in the browser", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await b.close();
  await db.$disconnect();
}
const failed = results.filter((r) => !r.pass);
console.log(`\nRehearsal: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
