"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { mine, requireManager } from "@/lib/session";
import type { ActionResult } from "./templates";

/** Meta's tiers, lowest first. A new number on WhatsApp's Cloud API starts at 250. */
const TIERS = ["TIER_250", "TIER_2K", "TIER_10K", "TIER_100K", "TIER_UNLIMITED"] as const;

/**
 * The business's Meta limit as WhatsApp Manager shows it (Account tools → Messaging limits), for when Meta can't be
 * asked. It's shared by all the business's numbers, like Meta's. When Meta answers, its value replaces this one.
 */
export async function setMetaLimit(clientId: string, tier: string): Promise<ActionResult> {
  const s = await requireManager(true, { evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!mine(s, clientId)) return { ok: false, message: "That business isn't yours." };
  if (!(TIERS as readonly string[]).includes(tier)) return { ok: false, message: "Pick one of Meta's limits." };
  const r = await db.whatsAppNumber.updateMany({ where: { clientId }, data: { messagingTier: tier } });
  if (!r.count) return { ok: false, message: "Add a WhatsApp number first." };
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Meta limit saved. It updates by itself when Meta says it changed." };
}
