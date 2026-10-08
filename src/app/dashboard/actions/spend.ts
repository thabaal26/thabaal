"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager, requireUser } from "@/lib/session";
import type { ActionResult } from "./templates";

/** Records money added to the WhatsApp account in Meta's billing, so the dashboard can estimate what's left. */
export async function addTopUp(amount: number, note: string): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const value = Math.round(Number(amount) * 100) / 100;
  if (!(value > 0) || value > 10_000_000) return { ok: false, message: "Enter the amount you added, in rupees." };
  const user = await requireUser();
  await db.topUp.create({ data: { clientId: s.clientId, amount: value, note: note.trim().slice(0, 200) || null, addedBy: user.name } });
  revalidatePath("/dashboard");
  return { ok: true, message: `Recorded ₹${value.toLocaleString("en-IN")} added.` };
}

export async function deleteTopUp(id: string): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await db.topUp.deleteMany({ where: { id, clientId: s.clientId } });
  if (!r.count) return { ok: false, message: "Top-up not found." };
  revalidatePath("/dashboard");
  return { ok: true, message: "Top-up removed." };
}
