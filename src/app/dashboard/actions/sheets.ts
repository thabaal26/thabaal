"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { csvUrl, syncSheet } from "@/lib/sheets";
import { requireOrderAccess } from "@/lib/session";
import type { SendResult } from "./send-helpers";

/** Saves the Customers and Orders tab links and syncs right away, so mistakes show up immediately. */
export async function saveSheetLinks(customersUrl: string, ordersUrl: string): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!s.clientId) return { ok: false, message: "Pick a client in the sidebar first." };
  const links = [customersUrl.trim(), ordersUrl.trim()];
  if (links.some((l) => l && !csvUrl(l))) return { ok: false, message: "Paste the full Google Sheets link of each tab (it contains /spreadsheets/d/…)." };
  await db.client.update({ where: { id: s.clientId }, data: { sheetCustomersUrl: links[0] || null, sheetOrdersUrl: links[1] || null } });
  return syncNow();
}

export async function syncNow(): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!s.clientId) return { ok: false, message: "Pick a client in the sidebar first." };
  const r = await syncSheet(s.clientId);
  revalidatePath("/dashboard", "layout");
  if (!r) return { ok: true, message: "Sheet links saved (none set, so nothing to sync)." };
  return { ok: r.ok, message: r.note };
}
