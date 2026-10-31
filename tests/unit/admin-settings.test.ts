// Admin panel › Settings: the price rules (lib/plan-prices.ts) and inviting admins (lib/admin-settings.ts).
// Saving prices to the database is tested in subscription.test.ts, next to the plan payments it changes.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "../../src/lib/db";
import { inviteAdmin } from "../../src/lib/admin-settings";
import { checkPrices, DEFAULT_PRICES, isDefault, plansWith, readPrices, savePercent } from "../../src/lib/plan-prices";
import { pricePaise } from "../../src/lib/subscription-core";

describe("plan price rules", () => {
  test("1. nothing saved means the prices in the code", () => {
    assert.deepEqual(readPrices(null), DEFAULT_PRICES);
    assert.deepEqual(readPrices("nonsense"), DEFAULT_PRICES);
    assert.equal(DEFAULT_PRICES.growth.m, 2999);
    assert.equal(isDefault(readPrices(undefined)), true);
  });

  test("2. a saved price replaces the code's; a broken plan row falls back as a whole", () => {
    const p = readPrices({ growth: { m: 3499, q: 9447, y: 33590 }, business: { m: 5999, q: 100, y: 59990 }, starter: { m: "x" } });
    assert.deepEqual(p.growth, { m: 3499, q: 9447, y: 33590 });
    assert.deepEqual(p.business, DEFAULT_PRICES.business, "3 months cheaper than 1 month: ignored");
    assert.deepEqual(p.starter, DEFAULT_PRICES.starter);
    assert.equal(isDefault(p), false);
  });

  test("3. typed prices: whole rupees, longer is dearer in total but never dearer per month", () => {
    const ok = checkPrices({ starter: { m: "1,299", q: "3,499", y: "₹12,499" }, growth: DEFAULT_PRICES.growth, business: DEFAULT_PRICES.business });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.deepEqual(ok.prices.starter, { m: 1299, q: 3499, y: 12499 });
    const bad = (starter: unknown) => checkPrices({ ...DEFAULT_PRICES, starter });
    assert.equal(bad({ m: 1199.5, q: 3237, y: 11510 }).ok, false, "paise");
    assert.equal(bad({ m: 0, q: 3237, y: 11510 }).ok, false, "zero");
    assert.equal(bad({ m: 1199, q: 1000, y: 11510 }).ok, false, "3 months under 1 month");
    assert.equal(bad({ m: 1199, q: 3800, y: 11510 }).ok, false, "3 months over 3 × monthly");
    assert.equal(bad({ m: 1199, q: 3237, y: 15000 }).ok, false, "12 months over 12 × monthly");
    assert.equal(checkPrices({ starter: DEFAULT_PRICES.starter }).ok, false, "every plan needed");
  });

  test("4. the plan list and charges use the prices given", () => {
    const prices = { ...DEFAULT_PRICES, growth: { m: 3499, q: 9447, y: 33590 } };
    const g = plansWith(prices).find((p) => p.k === "growth")!;
    assert.equal(g.p.m, 3499);
    assert.equal(g.lim.staff, 3, "limits and features unchanged");
    assert.equal(pricePaise("growth", "q", prices), 944_700);
    assert.equal(pricePaise("growth", "q"), 809_700, "without prices: the code's");
    assert.equal(savePercent(DEFAULT_PRICES.starter, "q"), 10);
    assert.equal(savePercent(DEFAULT_PRICES.starter, "y"), 20);
  });
});

describe("inviting an admin", () => {
  const admin = { isAdmin: true, name: "Stephan" };
  const email = () => `admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;

  test("5. only an admin can invite, and only with a name and email", async () => {
    assert.equal((await inviteAdmin({ isAdmin: false, name: "Owner" }, { name: "X", email: email() })).ok, false);
    assert.equal((await inviteAdmin(admin, { name: "", email: email() })).ok, false);
    assert.equal((await inviteAdmin(admin, { name: "X", email: "not-an-email" })).ok, false);
  });

  test("6. the new login is an admin with a password nobody knows, and can't be added twice", async () => {
    const e = email();
    const r = await inviteAdmin(admin, { name: "Madhumita G", email: e.toUpperCase() });
    assert.equal(r.ok, true, r.message);
    assert.match(r.message, /didn't go/, "tests never send email (RESEND_API_KEY is blank in tests/run.mjs)");
    const u = await db.user.findUniqueOrThrow({ where: { email: e } });
    assert.equal(u.role, "ADMIN");
    assert.equal(u.clientId, null);
    assert.equal(await bcrypt.compare("", u.passwordHash), false);
    assert.match(u.passwordHash, /^\$2[ab]\$12\$/);
    const again = await inviteAdmin(admin, { name: "Madhumita G", email: e });
    assert.equal(again.ok, false);
    assert.equal(await db.user.count({ where: { email: e } }), 1);
  });

  test("7. a business's login is never turned into an admin", async () => {
    const c = await db.client.create({ data: { name: `Invite shop ${Date.now()}` } });
    const e = email();
    await db.user.create({ data: { email: e, name: "Shop staff", passwordHash: "x", role: "CLIENT", clientId: c.id } });
    const r = await inviteAdmin(admin, { name: "Shop staff", email: e });
    assert.equal(r.ok, false);
    const u = await db.user.findUniqueOrThrow({ where: { email: e } });
    assert.equal(u.role, "CLIENT");
    assert.equal(u.clientId, c.id);
  });
});
