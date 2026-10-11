"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { fetchMetaLiveStatus, setMetaAccountBalance } from "@/lib/meta-balance";
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

/** Syncs the live Meta WhatsApp prepaid balance with Meta Business Suite. */
export async function syncMetaAccountBalanceAction(wabaId: string, balance: number): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const val = Number(balance);
  if (isNaN(val) || val < 0 || val > 10_000_000) {
    return { ok: false, message: "Please enter a valid prepaid balance amount in rupees." };
  }
  const user = await requireUser();
  const updated = await setMetaAccountBalance(wabaId, val, user.name, s.clientId);
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `Meta balance synced: ₹${updated.liveBalance.toFixed(2)} on ${updated.accountName}.`,
  };
}

/** Verifies live Meta Cloud API connectivity, health for all sending numbers, and live pricing analytics. */
export async function refreshMetaLiveStatusAction(clientId: string): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const status = await fetchMetaLiveStatus(clientId);
  revalidatePath("/dashboard");
  if (status.liveConnected) {
    const costNote = typeof status.liveCost30d === "number" ? ` · 30d Meta spend: ₹${status.liveCost30d.toFixed(2)}` : "";
    return {
      ok: true,
      message: `Meta Cloud API synced (${status.numbersSynced ?? 1} number${(status.numbersSynced ?? 1) === 1 ? "" : "s"}): ${status.wabaName} · Quality: ${status.qualityRating}${costNote}`,
    };
  }
  return { ok: false, message: status.reason ?? "Could not reach Meta Cloud API. Check API credentials." };
}


