// My account › plan payment is a single auto-pay subscription (Razorpay), in a real browser against the QA app
// (tests/qa/serve.mjs). No UPI QR, no "I have already paid", no UTR form. Each subscription state (subscribed,
// cancelled, failing) shows the right card and buttons. The QA app runs with a fake rzp_test_ key, so pressing
// Subscribe reaches Razorpay's API and is refused: nothing can be charged. Puts the QA data back.
//   node tests/qa/subscription-ui.mjs
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
    results.push({ no, name, pass: false, detail: String(e.message ?? e).split("\n")[0].slice(0, 300) });
  }
}

const SUB_ID = "sub_QAsubscriptionUI1";
const setSub = async (status) => {
  await db.razorpayRecord.deleteMany({ where: { rzpId: SUB_ID } });
  if (status)
    await db.razorpayRecord.create({
      data: { kind: "subscription", rzpId: SUB_ID, purpose: "plan", clientId: S.shopId, plan: "growth", cycle: "m", amountPaise: 199900, status, createdBy: "QA" },
    });
};
// Never leave QA subscriptions behind from an earlier failed run.
await db.razorpayRecord.deleteMany({ where: { clientId: S.shopId, kind: "subscription" } });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.addCookies([{ name: "wp_session", value: S.tokens.manager, url: BASE }]);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message)));
const body = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const account = async (tab) => {
  await p.goto(`${BASE}/dashboard/account`, { waitUntil: "networkidle" });
  if (tab) await p.getByRole("tab", { name: tab }).click();
};
const MANUAL = /Pay by UPI|I have already paid|UPI reference number|Send for checking|Scan with GPay|Pay now by UPI|I have paid/;

await check(1, "no manual payment anywhere on My account (all four tabs)", async () => {
  for (const tab of [null, "Change plan", "Payments and invoices", "Business and help"]) {
    await account(tab);
    const t = await body();
    const m = t.match(MANUAL);
    expect(!m, `found "${m?.[0]}" on ${tab ?? "My plan"}`);
  }
  return "no UPI QR, UTR or 'already paid'";
});

await check(2, "choosing a plan opens Subscribe: plan, first charge, renews until you cancel", async () => {
  await account("Change plan");
  await p.locator(".plan").nth(1).getByRole("button").click();
  const dlg = p.getByRole("dialog", { name: "Subscribe to a plan" });
  await dlg.waitFor({ timeout: 10000 });
  const t = (await dlg.innerText()).replace(/\s+/g, " ");
  expect(/You are subscribing to/.test(t) && /First charge/.test(t) && /until you cancel/.test(t), "summary rows missing: " + t.slice(0, 200));
  await dlg.getByRole("button", { name: "Continue" }).click();
  const t2 = (await dlg.innerText()).replace(/\s+/g, " ");
  expect(/Subscribe with auto-pay/.test(t2) && /Auto-pay with Razorpay/.test(t2), "step 2 missing: " + t2.slice(0, 200));
  expect(!MANUAL.test(t2) && (await dlg.locator("img, input").count()) === 0, "QR or UTR input still in the dialog");
  await dlg.screenshot({ path: ".git/qa-subscribe-dialog.png" });
  return t2.match(/Subscribe · ₹[\d,]+|Set up auto-pay/)?.[0] ?? "button";
});

await check(3, "Subscribe goes to the server and Razorpay (fake test key is refused, nothing charged, no record kept)", async () => {
  const dlg = p.getByRole("dialog", { name: "Subscribe to a plan" });
  await dlg.getByRole("button", { name: /Subscribe ·|Set up auto-pay/ }).click();
  await p.waitForTimeout(4000);
  const rec = await db.razorpayRecord.count({ where: { clientId: S.shopId, kind: "subscription" } });
  expect(rec === 0, "a subscription record was saved without Razorpay");
  const t = await body();
  return /Authentication|Razorpay|Couldn't|isn't available/i.test(t) ? "refused by Razorpay as expected" : "no message seen";
});

await check(4, "subscribed: green card, Cancel subscription, no Subscribe in the header, plan card says Subscribed", async () => {
  await setSub("active");
  await account();
  const t = await body();
  expect(/Subscribed · auto-pay is on/.test(t), "card missing");
  expect(await p.getByRole("button", { name: "Cancel subscription" }).isVisible(), "no cancel button");
  expect(!(await p.getByRole("button", { name: "Subscribe with auto-pay" }).count()), "header still offers Subscribe");
  await p.locator(".card", { hasText: "Subscribed · auto-pay is on" }).first().screenshot({ path: ".git/qa-sub-on.png" });
  await p.getByRole("tab", { name: "Change plan" }).click();
  const btn = p.getByRole("button", { name: "Subscribed · auto-pay on" });
  expect((await btn.count()) === 1 && (await btn.isDisabled()), "Growth monthly card is not shown as subscribed");
  return "ok";
});

await check(5, "cancel dialog explains access stays, then the server is asked to cancel (fake key refused, state unchanged)", async () => {
  await account();
  await p.getByRole("button", { name: "Cancel subscription" }).click();
  const dlg = p.getByRole("dialog", { name: "Cancel subscription" });
  await dlg.waitFor({ timeout: 10000 });
  const t = (await dlg.innerText()).replace(/\s+/g, " ");
  expect(/nothing more is charged/.test(t) && /Keep subscription/.test(t), "wording: " + t.slice(0, 200));
  await dlg.screenshot({ path: ".git/qa-cancel-dialog.png" });
  await dlg.getByRole("button", { name: "Cancel subscription" }).click();
  await p.waitForTimeout(4000);
  const r = await db.razorpayRecord.findUnique({ where: { rzpId: SUB_ID } });
  expect(r?.status === "active", "status changed without Razorpay agreeing: " + r?.status);
  return "Razorpay must confirm before anything changes";
});

await check(6, "cancelled: access until period end, Resubscribe, no cancel button", async () => {
  await setSub("cancelling");
  await account();
  const t = await body();
  expect(/Subscription cancelled/.test(t) && /Nothing more will be charged/.test(t), "card text");
  expect(await p.getByRole("button", { name: "Resubscribe" }).isVisible(), "no Resubscribe");
  expect(!(await p.getByRole("button", { name: "Cancel subscription" }).count()), "cancel still shown");
  await p.getByRole("button", { name: "Resubscribe" }).click();
  await p.getByRole("dialog", { name: "Subscribe to a plan" }).waitFor({ timeout: 10000 });
  return "Resubscribe opens Growth · monthly";
});

await check(7, "failing (halted): red card, Set up auto-pay again and Cancel", async () => {
  await setSub("halted");
  await account();
  const t = await body();
  expect(/the last charge didn't go through/.test(t), "card text");
  expect(await p.getByRole("button", { name: "Set up auto-pay again" }).isVisible(), "no set-up-again");
  expect(await p.getByRole("button", { name: "Cancel subscription" }).isVisible(), "no cancel");
  return "ok";
});

await check(8, "a phone-width page has no sideways scroll", async () => {
  await setSub("active");
  await p.setViewportSize({ width: 390, height: 860 });
  await account();
  const w = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await p.screenshot({ path: ".git/qa-sub-mobile.png", fullPage: false });
  expect(w <= 1, `overflows by ${w}px`);
  return "fits";
});

await check(9, "no browser errors", async () => {
  expect(!errors.length, errors.join(" | ").slice(0, 300));
  return "none";
});

await setSub(null);
await browser.close();
await db.$disconnect();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.no}. ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
