"use server";

import { revalidatePath } from "next/cache";
import { audienceWhere, cleanFilter, type AudienceFilter } from "@/lib/audiences";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import type { SendResult } from "./send-helpers";

/** How many customers the filter matches right now, for the live count while building it. */
export async function countAudience(filter: AudienceFilter): Promise<{ ok: boolean; n: number }> {
  const s = await requireAdmin(true);
  if ("denied" in s) return { ok: false, n: 0 };
  return { ok: true, n: await db.customer.count({ where: await audienceWhere(s.clientId, filter) }) };
}

export async function saveAudience(name: string, filter: AudienceFilter): Promise<SendResult> {
  const s = await requireAdmin(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const n = name.trim().slice(0, 60);
  if (!n) return { ok: false, message: "Give the audience a name." };
  const f = cleanFilter(filter);
  if (!Object.keys(f).length) return { ok: false, message: 'Add at least one condition. For everyone, pick "All customers" in the campaign.' };
  await db.audience.upsert({ where: { clientId_name: { clientId: s.clientId, name: n } }, create: { clientId: s.clientId, name: n, filter: f }, update: { filter: f } });
  revalidatePath("/dashboard/customers/audiences");
  return { ok: true, message: `Saved "${n}". Pick it under "Send to" in any campaign.` };
}

export async function deleteAudience(id: string): Promise<SendResult> {
  const s = await requireAdmin(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const inUse = await db.campaign.count({ where: { clientId: s.clientId, audienceTag: `aud:${id}`, active: true } });
  if (inUse) return { ok: false, message: `${inUse} active campaign${inUse > 1 ? "s use" : " uses"} this audience. Change or pause ${inUse > 1 ? "them" : "it"} first.` };
  await db.audience.deleteMany({ where: { id, clientId: s.clientId } });
  revalidatePath("/dashboard/customers/audiences");
  return { ok: true, message: "Audience deleted." };
}
