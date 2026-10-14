"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, requireUser, revokeSessions } from "@/lib/session";
import type { ActionResult } from "./templates";

export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const me = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) return { ok: false, message: "Current password is wrong." };
  if (next.length < 8) return { ok: false, message: "New password must be at least 8 characters." };
  await db.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  // Log out every other device, then give this one a fresh login so the person changing it stays in.
  await revokeSessions(me.id);
  await createSession(me.id);
  return { ok: true, message: "Password changed. Other devices signed in with this account are logged out." };
}
