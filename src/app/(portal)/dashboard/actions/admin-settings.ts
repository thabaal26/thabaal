"use server";

// Admin panel › Settings: plan prices and admin logins (lib/admin-settings.ts). Admins only.

import { revalidatePath } from "next/cache";
import { inviteAdmin, savePlanPrices, type AdminResult } from "@/lib/admin-settings";
import { requireAdmin, requireUser } from "@/lib/session";

async function admin() {
  const scope = await requireAdmin();
  if ("denied" in scope) return null;
  const user = await requireUser();
  return { isAdmin: true, name: user.name || user.email };
}

export async function updatePlanPrices(input: unknown): Promise<AdminResult> {
  const who = await admin();
  if (!who) return { ok: false, message: "Only Thabaal can change plan prices." };
  const r = await savePlanPrices(who, input);
  if (r.ok) {
    // Everywhere a price is shown: the website, My account, the lock screen and the admin panel.
    revalidatePath("/", "layout");
  }
  return r;
}

export async function inviteAdminLogin(input: { name: string; email: string }): Promise<AdminResult> {
  const who = await admin();
  if (!who) return { ok: false, message: "Only a Thabaal admin can add admins." };
  const r = await inviteAdmin(who, input);
  if (r.ok) revalidatePath("/admin/settings");
  return r;
}
