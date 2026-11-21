"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { BUILT_IN, cleanOverrides, OPTIONS, type AppearanceKey } from "@/lib/appearance";
import type { ActionResult } from "./templates";

const refresh = () => revalidatePath("/dashboard", "layout");

const describe = (o: Record<string, string>) =>
  (Object.keys(o) as AppearanceKey[]).map((k) => OPTIONS[k].find((x) => x.id === o[k])?.label ?? o[k]).join(" · ");

/** The portal-wide default look. Only choices that differ from Thabaal's built-in look are kept. */
export async function savePortalAppearance(value: unknown): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const clean = cleanOverrides(value);
  const stored = Object.fromEntries(Object.entries(clean).filter(([k, v]) => BUILT_IN[k as AppearanceKey] !== v));
  await db.setting.upsert({
    where: { id: 1 },
    update: { appearance: Object.keys(stored).length ? stored : Prisma.DbNull },
    create: { id: 1, appearance: Object.keys(stored).length ? stored : Prisma.DbNull },
  });
  refresh();
  return { ok: true, message: Object.keys(stored).length ? "Saved the portal's default look. Clients without their own look now use it." : "The portal default is back to Thabaal's standard look." };
}

/** One client's own look: only the keys given override the portal default ("Use default" leaves a key out). */
export async function saveClientAppearance(clientId: string, overrides: unknown): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return { ok: false, message: "Client not found." };
  const clean = cleanOverrides(overrides);
  await db.client.update({
    where: { id: clientId },
    // The older icon columns go back to their defaults: this client's look is now fully described here.
    data: { appearance: Object.keys(clean).length ? clean : Prisma.DbNull, iconPack: "hugeicons", iconLook: "3d" },
  });
  refresh();
  return {
    ok: true,
    message: Object.keys(clean).length ? `${client.name}'s own look: ${describe(clean)}.` : `${client.name} now follows the portal default look.`,
  };
}
