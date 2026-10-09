"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { csvUrl, syncSheet } from "@/lib/sheets";
import { requireOrderAccess } from "@/lib/session";
import type { SendResult } from "./send-helpers";

/** Saves the Customers and Orders tab links and syncs right away, so mistakes show up immediately. */
export async function saveSheetLinks(customersUrl: string, ordersUrl?: string): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!s.clientId) return { ok: false, message: "Pick a client in the sidebar first." };
  const cUrl = customersUrl.trim();
  const oUrl = (ordersUrl ?? "").trim();
  const links = [cUrl, oUrl].filter(Boolean);
  if (links.some((l) => !csvUrl(l))) {
    return { ok: false, message: "Paste a valid Google Sheets link (it contains /spreadsheets/d/… or your Google Sheet share link)." };
  }
  // If only one link is provided, use it for both so a single share link syncs both Customers and Orders
  const finalCust = cUrl || oUrl || null;
  const finalOrd = oUrl ? oUrl : cUrl || null;

  await db.client.update({
    where: { id: s.clientId },
    data: { sheetCustomersUrl: finalCust, sheetOrdersUrl: finalOrd },
  });
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
