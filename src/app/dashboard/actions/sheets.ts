"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { explainBadHook, parseSheetHook, testSheetPush } from "@/lib/google-sheets-live";
import { csvUrl, syncSheet } from "@/lib/sheets";
import { requireManager, requireOrderAccess } from "@/lib/session";
import type { SendResult } from "./send-helpers";

/** Saves the Customers and Orders tab links and syncs right away, so mistakes show up immediately. */
export async function saveSheetLinks(customersUrl: string, ordersUrl?: string): Promise<SendResult> {
  const s = await requireOrderAccess({ evenIfLocked: true });
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

/** Sends one test event to the live-log sheet and reports the script's answer. */
export async function testSheetConnection(): Promise<SendResult> {
  const s = await requireOrderAccess({ evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!s.clientId) return { ok: false, message: "Pick a client in the sidebar first." };
  return testSheetPush(s.clientId);
}

/**
 * Links this business's own live-log sheet (its Apps Script /exec link) and the secret the script checks.
 * An empty secret keeps the saved one; `clearSecret` removes it. An empty link unlinks the sheet.
 */
export async function saveSheetHook(link: string, secret: string, clearSecret = false): Promise<SendResult> {
  const s = await requireManager(true, { evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  const raw = link.trim();
  const url = raw ? parseSheetHook(raw) : null;
  if (raw && !url) return { ok: false, message: `${explainBadHook(raw)}. Use Deploy → Manage deployments → Web app URL (ends in /exec).` };
  const key = secret.trim();
  if (key && !/^[A-Za-z0-9_-]{16,128}$/.test(key)) return { ok: false, message: "The secret should be 16 to 128 letters, digits, - or _. Press Generate for a good one." };
  await db.client.update({
    where: { id: s.clientId },
    data: {
      sheetHookUrl: url,
      ...(!url ? { sheetHookSecret: null } : key ? { sheetHookSecret: key } : clearSecret ? { sheetHookSecret: null } : {}),
    },
  });
  revalidatePath("/dashboard/settings/sheet");
  if (!url) return { ok: true, message: "Live-log sheet unlinked. Events from this business no longer go to any sheet." };
  return { ok: true, message: key ? "Sheet linked with the new secret. Put the same secret in the script (Project Settings → Script properties → SECRET), then send a test." : "Sheet link saved." };
}

export async function syncNow(): Promise<SendResult> {
  const s = await requireOrderAccess({ evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!s.clientId) return { ok: false, message: "Pick a client in the sidebar first." };
  const r = await syncSheet(s.clientId);
  revalidatePath("/dashboard", "layout");
  if (!r) return { ok: true, message: "Sheet links saved (none set, so nothing to sync)." };
  return { ok: r.ok, message: r.note };
}
