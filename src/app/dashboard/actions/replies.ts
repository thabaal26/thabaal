"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope, ownedMessages } from "@/lib/session";
import type { ActionResult } from "./templates";
import { trackPress } from "@/lib/usage";

/**
 * Following up on replies is the client's own work, so client logins may do this
 * (only for their own customers) even though the rest of their portal is read-only.
 */
export async function setReplyHandled(id: string, handled: boolean): Promise<ActionResult> {
  trackPress("chat.done");
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change anything." };
  const target = await db.reply.findFirst({
    where: { id, ...ownedMessages(scope) },
    select: { id: true, customerId: true },
  });
  if (!target) return { ok: false, message: "Reply not found." };

  if (handled) {
    // One thread per customer: marking handled closes all open replies from this customer at once.
    const r = await db.reply.updateMany({
      where: { customerId: target.customerId, handled: false, ...ownedMessages(scope) },
      data: { handled: true },
    });
    revalidatePath("/dashboard", "layout");
    return {
      ok: true,
      message: r.count > 1 ? `Marked conversation (${r.count} messages) as handled.` : "Marked conversation as handled.",
    };
  }

  await db.reply.update({ where: { id: target.id }, data: { handled: false } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Moved conversation back to open." };
}

export async function handleAllReplies(): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change anything." };
  const r = await db.reply.updateMany({ where: { handled: false, ...ownedMessages(scope) }, data: { handled: true } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `${r.count} replies marked as handled.` };
}

/** Marks the conversations behind these replies handled (one group on the Priority board). */
export async function handleRepliesOf(replyIds: string[]): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change anything." };
  const ids = [...new Set(replyIds)].slice(0, 500);
  if (!ids.length) return { ok: true, message: "Nothing to mark." };
  const targets = await db.reply.findMany({ where: { id: { in: ids }, ...ownedMessages(scope) }, select: { customerId: true } });
  const customerIds = [...new Set(targets.map((t) => t.customerId))];
  if (!customerIds.length) return { ok: false, message: "Those chats weren't found." };
  const r = await db.reply.updateMany({ where: { customerId: { in: customerIds }, handled: false, ...ownedMessages(scope) }, data: { handled: true } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `${customerIds.length} chat${customerIds.length === 1 ? "" : "s"} marked as handled (${r.count} message${r.count === 1 ? "" : "s"}).` };
}
