"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APP_ORIGIN } from "@/lib/app-host";
import { db } from "@/lib/db";
import { sendEmail, THABAAL_INBOX } from "@/lib/email";
import { clearLoginFailures, clientIp } from "@/lib/login-guard";
import { RESET_MINUTES, makeResetToken, readResetToken } from "@/lib/password-reset";
import { destroySession, revokeSessions } from "@/lib/session";

export type ForgotState = { sent?: boolean; error?: string; email?: string } | undefined;
export type ResetState = { error?: string } | undefined;

const WINDOW_MS = 15 * 60_000;
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;

/** Where links in emails point. Production always uses the real site, never the request's Host header. */
async function origin() {
  if (process.env.NODE_ENV === "production") return APP_ORIGIN;
  const h = await headers();
  return `http://${h.get("host") ?? "localhost:3000"}`;
}

/**
 * "Forgot password": emails a 30-minute, one-time link to the account's own address.
 * The answer is the same whether or not the email has an account, so the form can't be used to find accounts.
 */
export async function requestPasswordReset(_: ForgotState, form: FormData): Promise<ForgotState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the email you sign in with.", email };

  // Limit how often links can be asked for, per email and per network address.
  const ip = await clientIp();
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { key: `reset:email:${email}`, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { key: `reset:ip:${ip}`, createdAt: { gte: since } } }),
  ]);
  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP) {
    return { error: "Too many reset requests. Wait 15 minutes and try again.", email };
  }
  await db.loginAttempt.createMany({ data: [{ key: `reset:email:${email}` }, { key: `reset:ip:${ip}` }] });

  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, passwordHash: true } });
  if (user) {
    const link = `${await origin()}/reset-password?token=${encodeURIComponent(await makeResetToken(user))}`;
    const sent = await sendEmail({
      to: user.email,
      subject: "Reset your Thabaal password",
      intro: `Hi ${user.name || "there"}, someone asked to reset the password for ${user.email}. The button below works once, for ${RESET_MINUTES} minutes. If it wasn't you, ignore this email; your password stays the same.`,
      button: { label: "Set a new password", url: link },
      rows: [],
    });
    if (!sent.ok) {
      console.error("password reset email failed:", sent.error);
      // Tell Thabaal so someone can help this person; the link itself is never sent anywhere else.
      await sendEmail({
        to: THABAAL_INBOX,
        subject: "Password reset email could not be sent",
        rows: [
          ["Login", user.email],
          ["Error", sent.error ?? "unknown"],
          ["What to do", "Set a new password for them from the admin panel (client → Setup → Logins → Reset password)."],
        ],
      }).catch(() => {});
    }
  }
  return { sent: true, email };
}

/** Sets the new password from a reset link, then ends every existing login of that account. */
export async function resetPassword(_: ResetState, form: FormData): Promise<ResetState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  if (password.length < 8) return { error: "Use 8 or more characters." };
  if (password.length > 200) return { error: "That password is too long." };
  if (password !== again) return { error: "The two passwords don't match." };

  const user = await readResetToken(token);
  if (!user) return { error: "This link has expired or was already used. Ask for a new one." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await revokeSessions(user.id);
  await destroySession(); // any old login cookie in this browser is now stale; start clean at /login
  await clearLoginFailures(user.email);
  // A heads-up to the account owner, in case it wasn't them.
  await sendEmail({
    to: user.email,
    subject: "Your Thabaal password was changed",
    intro: `The password for ${user.email} was just changed, and every device signed in to this account was signed out. If this wasn't you, contact Thabaal right away.`,
    rows: [],
  }).catch(() => {});

  redirect("/login?reset=done");
}
