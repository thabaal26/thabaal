"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope, ownedMessages } from "@/lib/session";
import type { ActionResult } from "./templates";

/**
 * Following up on replies is the client's own work, so client logins may do this
 * (only for their own customers) even though the rest of their portal is read-only.
 */
export async function setReplyHandled(id: string, handled: boolean): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change anything." };
  const r = await db.reply.updateMany({ where: { id, ...ownedMessages(scope) }, data: { handled } });
  if (!r.count) return { ok: false, message: "Reply not found." };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: handled ? "Marked as handled." : "Moved back to open." };
}

export async function handleAllReplies(): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change anything." };
  const r = await db.reply.updateMany({ where: { handled: false, ...ownedMessages(scope) }, data: { handled: true } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `${r.count} replies marked as handled.` };
}
