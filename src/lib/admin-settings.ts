import "server-only";

// Admin panel › Settings: plan prices and admin logins. Callers pass who is acting; the server actions
// (app/dashboard/actions/admin-settings.ts) build it from the session and check the login is an admin first.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { sendEmail } from "./email";
import { linkOrigin, makeResetToken } from "./password-reset";
import { checkPrices } from "./plan-prices";

export type AdminActor = { isAdmin: boolean; name: string };
export type AdminResult = { ok: boolean; message: string };

/**
 * Saves new plan prices. They apply to subscriptions started from now on (My account, the website, the Razorpay
 * plan made for the new amount). Running subscriptions and paid periods keep the amount they were made with.
 */
export async function savePlanPrices(actor: AdminActor, input: unknown, now = new Date()): Promise<AdminResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can change plan prices." };
  const checked = checkPrices(input);
  if (!checked.ok) return checked;
  const data = { planPrices: checked.prices, planPricesAt: now, planPricesBy: actor.name.slice(0, 80) };
  await db.setting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return { ok: true, message: "Prices saved. New subscriptions use them from now; businesses already subscribed keep their price." };
}

/** How long an invite's "Set your password" link works. */
export const INVITE_HOURS = 72;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds an admin login and emails them a link to set a password (they can also sign in with Google on that
 * email). The new login has no password anyone knows until they set one.
 */
export async function inviteAdmin(actor: AdminActor, input: { name: string; email: string }): Promise<AdminResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only a Thabaal admin can add admins." };
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, message: "Enter their name." };
  if (!EMAIL.test(email)) return { ok: false, message: "Enter their email address." };
  const existing = await db.user.findUnique({ where: { email }, select: { role: true } });
  if (existing?.role === "ADMIN") return { ok: false, message: `${email} can already sign in here.` };
  // Never turn a business's login into an admin: that would hand one shop's staff every business.
  if (existing) return { ok: false, message: `${email} is already a business login. Use another email for admin access.` };

  const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
  const user = await db.user.create({ data: { email, name, passwordHash, role: "ADMIN", clientId: null } });
  const link = `${await linkOrigin()}/reset-password?token=${encodeURIComponent(await makeResetToken(user, INVITE_HOURS * 60))}`;
  const sent = await sendEmail({
    to: email,
    subject: "You can now sign in to the Thabaal admin panel",
    intro: `Hi ${name}, ${actor.name} added you as an admin of Thabaal. Set your password with the button below (it works once, for ${INVITE_HOURS} hours), or sign in with Google using ${email}.`,
    button: { label: "Set your password", url: link },
    rows: [],
  }).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  if (!sent.ok) {
    console.error("admin invite email failed:", sent.error);
    return { ok: true, message: `${name} is added, but the email didn't go. They can sign in with Google using ${email}, or use "Forgot password".` };
  }
  return { ok: true, message: `${name} is added. We emailed ${email} a link to set a password.` };
}
