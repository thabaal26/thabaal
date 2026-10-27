"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clearLoginFailures, clientIp, loginBlockedFor, recordLoginFailure } from "@/lib/login-guard";
import { clientAccess } from "@/lib/plan-access";
import { createSession, destroySession } from "@/lib/session";

export async function login(_: { error?: string; email?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const ip = await clientIp();
  const wait = await loginBlockedFor(email, ip);
  if (wait) return { error: `Too many wrong tries. Wait ${wait} minute${wait === 1 ? "" : "s"} and try again, or use Continue with Google.`, email };

  const user = await db.user.findUnique({ where: { email } });
  // Compare against a dummy hash when the user is missing so timing doesn't reveal accounts.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5V1Y6c0O7aZzv6Yg6nH2c0y5vVQ0g4S");
  if (!user || !ok) {
    await recordLoginFailure(email, ip);
    return { error: "Email or password is incorrect.", email };
  }

  await clearLoginFailures(email);
  await createSession(user.id);
  // A business that has never paid goes straight to choosing a package; everyone else lands on Home.
  if (user.clientId && user.access === "MANAGER") {
    const access = await clientAccess(user.clientId).catch(() => null);
    if (access?.state === "new" && !access.pending) redirect("/dashboard/account?pay=now");
  }
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
