"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/login-guard";
import { ensureOrderPrefix } from "@/lib/orders";
import { createSession } from "@/lib/session";

export type SignupState = { error?: string; values?: { business: string; city: string; name: string; email: string; agreed: boolean } } | undefined;

/** A city name: letters, spaces, dots, apostrophes and hyphens (same rule as adding a client in the admin panel). */
const CITY = /^[\p{L}][\p{L} .'-]{1,39}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SIGNUPS_PER_IP = 5;
const WINDOW_MS = 60 * 60_000;

/**
 * A new business creates its own account: the business, and its first login as Manager. The business starts
 * with planRequired on and no paid period, so only Home, My account and Settings open until the first payment
 * is verified (lib/plan-access.ts). The new owner goes straight to the package screen.
 */
export async function signup(_: SignupState, form: FormData): Promise<SignupState> {
  const business = String(form.get("business") ?? "").trim().replace(/\s+/g, " ");
  const city = String(form.get("city") ?? "").trim().replace(/\s+/g, " ");
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const agreed = form.get("terms") === "on";
  const values = { business, city, name, email, agreed };

  if (business.length < 2 || business.length > 60) return { error: "Enter your business name (2 to 60 characters).", values };
  if (!CITY.test(city)) return { error: "Enter just the city you deliver from, e.g. Chennai.", values };
  if (name.length < 2 || name.length > 60) return { error: "Enter your name.", values };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address.", values };
  if (password.length < 8) return { error: "Password must be at least 8 characters.", values };
  if (password.length > 200) return { error: "That password is too long.", values };
  if (!agreed) return { error: "Please accept the Terms and Privacy Policy to continue.", values };

  // Stops one address from filling the system with accounts: a few sign-ups an hour.
  const ip = await clientIp();
  const key = `signup:${ip}`;
  const recent = await db.loginAttempt.count({ where: { key, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } } });
  if (recent >= SIGNUPS_PER_IP) return { error: "Too many accounts were created from this network. Please try again in an hour.", values };

  if (await db.user.findUnique({ where: { email } })) {
    return { error: "This email already has an account. Sign in instead, or use a different email.", values };
  }
  if (await db.client.findUnique({ where: { name: business } })) {
    return { error: "A business with this name is already on Thabaal. If it's yours, ask its owner to add you; otherwise add your area to the name.", values };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let userId: string;
  try {
    const created = await db.$transaction(async (tx) => {
      const client = await tx.client.create({ data: { name: business, planRequired: true, homeCity: city } });
      return tx.user.create({ data: { name, email, passwordHash, role: "CLIENT", access: "MANAGER", clientId: client.id }, select: { id: true, clientId: true } });
    });
    userId = created.id;
    await ensureOrderPrefix(created.clientId!).catch(() => null);
  } catch {
    // A second sign-up with the same email or business name slipped in between the checks above and the save.
    return { error: "That email or business name was just taken. Please check and try again.", values };
  }

  await db.loginAttempt.create({ data: { key } });
  await createSession(userId);
  redirect("/dashboard/account?pay=now");
}
