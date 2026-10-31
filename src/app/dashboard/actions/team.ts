"use server";

// Settings › Staff logins: the business owner (or a manager) adds logins for their staff, up to the plan's staff
// logins, and removes them. Every login added here has the same access: Staff (orders, dispatch, replies).
// Only while the plan is paid (requireManager refuses while locked).

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager, requireUser } from "@/lib/session";
import { planCapacityBlock } from "@/lib/subscription";
import type { ActionResult } from "./templates";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addStaffLogin(input: { name: string; email: string; password: string }): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  if (s.viewOnly) return { ok: false, message: "This view is read-only." };
  const name = String(input.name ?? "").trim().slice(0, 80);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(input.password ?? "");
  if (!name) return { ok: false, message: "Enter the person's name." };
  if (!EMAIL.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (password.length < 8) return { ok: false, message: "The password must be at least 8 characters." };
  if (password.length > 200) return { ok: false, message: "That password is too long." };
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return { ok: false, message: `${email} already has a thabaal login. Use another email.` };
  const block = await planCapacityBlock(s.clientId, "staff");
  if (block) return { ok: false, message: block };
  await db.user.create({ data: { name, email, role: "CLIENT", access: "STAFF", clientId: s.clientId, passwordHash: await bcrypt.hash(password, 12) } });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: `Login created for ${name}. They sign in with ${email} and the password you set.` };
}

export async function removeStaffLogin(userId: string): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  if (s.viewOnly) return { ok: false, message: "This view is read-only." };
  const me = await requireUser();
  const logins = await db.user.findMany({ where: { clientId: s.clientId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const target = logins.find((u) => u.id === userId);
  if (!target) return { ok: false, message: "Login not found." };
  if (target.id === logins[0]?.id) return { ok: false, message: "The owner's login can't be removed here." };
  if (target.id === me.id) return { ok: false, message: "You can't remove your own login." };
  await db.user.delete({ where: { id: target.id } });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: `${target.name || "The login"} can no longer sign in.` };
}
