"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope, owned } from "@/lib/session";
import { sendToCustomer } from "./send";
import type { SendResult } from "./send-helpers";

/**
 * Sends the client's refill template to one customer now, from the refill calendar. Marks their
 * latest paid order as reminded so the automatic reminder doesn't send it a second time.
 * Quiet hours and the marketing gap come back as a question (`soft`) the page asks before forcing.
 */
export async function sendRefillNudge(customerId: string, force = false): Promise<SendResult> {
  const s = await getScope();
  const c = await db.customer.findFirst({
    where: { id: customerId, ...owned(s) },
    select: { id: true, client: { select: { refillTemplateId: true } } },
  });
  if (!c) return { ok: false, message: "Customer not found." };
  if (!c.client.refillTemplateId) return { ok: false, message: "Pick a reorder reminder template first (Campaigns → Reorder reminders)." };

  const r = await sendToCustomer(c.id, c.client.refillTemplateId, null, force);
  if (r.ok) {
    const last = await db.order.findFirst({
      where: { customerId: c.id, status: { not: "CANCELLED" }, OR: [{ paidAt: { not: null } }, { status: { in: ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"] } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (last) await db.order.update({ where: { id: last.id }, data: { reminderSentAt: new Date() } });
  }
  revalidatePath("/dashboard/refills");
  return r;
}
