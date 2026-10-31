"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { disconnectSheet, rebuildSheet, syncClientSheet } from "@/lib/gsheet/sync";
import { requireManager } from "@/lib/session";
import type { SendResult } from "./send-helpers";

const done = (r: SendResult) => {
  revalidatePath("/dashboard/settings/sheet");
  return r;
};

/** Brings the sheet up to date now (it also updates by itself as things happen). */
export async function googleSheetSyncNow(): Promise<SendResult> {
  const s = await requireManager(true, { evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await syncClientSheet(s.clientId, 45_000);
  const link = await db.sheetLink.findUnique({ where: { clientId: s.clientId }, select: { lastError: true, status: true } });
  if (link?.status === "error" || link?.lastError) return done({ ok: false, message: link.lastError ?? "The sheet couldn't be updated." });
  if (!r.ran) return done({ ok: true, message: "An update is already running; the sheet will be current in a moment." });
  return done({ ok: true, message: r.more ? "Updated. There is more history to add; it continues by itself." : "Your sheet is up to date." });
}

/** Empties the sheet and writes everything again, e.g. after rows were deleted or edited in it by hand. */
export async function googleSheetRebuild(): Promise<SendResult> {
  const s = await requireManager(true, { evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  try {
    await rebuildSheet(s.clientId);
  } catch {
    return done({ ok: false, message: "Couldn't empty the sheet. Check it still exists, or connect again." });
  }
  const r = await syncClientSheet(s.clientId, 45_000);
  return done({ ok: true, message: r.more ? "Rebuilding: the sheet is filling up again and continues by itself." : "Rebuilt: the sheet has everything again." });
}

/** Stops the live sync and removes Thabaal's access to the Google account. The sheet stays the owner's. */
export async function googleSheetDisconnect(): Promise<SendResult> {
  const s = await requireManager(true, { evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  await disconnectSheet(s.clientId);
  return done({ ok: true, message: "Disconnected. Your sheet stays in your Google Drive; it just won't update any more." });
}
