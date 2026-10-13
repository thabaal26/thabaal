import "server-only";
import { db } from "./db";
import { affordableMessages } from "./wallet";
import { deliver, getSettings, templateSendable } from "./provider";
import { applyFailure, quietUntil } from "./rules";
import { senderFor } from "./senders";
import { explainError, metaError, TRY_LATER_KINDS } from "./meta-errors";
import { MetaError } from "./whatsapp";

const PER_TICK = 30; // keep each scheduler call short
const DAY = 86_400_000;
/** Orders older than the reminder day by more than this are skipped, so turning reminders on doesn't message every past buyer. */
const GRACE_DAYS = 7;

/**
 * Refill reminders: a set number of days after an order, send the client's chosen template once.
 * Skips customers who opted out, can't receive messages, or ordered again since.
 */
export async function sendRefillReminders(now = new Date()) {
  const clients = await db.client.findMany({
    where: { refillDays: { gt: 0 }, refillTemplateId: { not: null } },
    select: { id: true, refillDays: true, refillTemplateId: true, quietFrom: true, quietTo: true },
  });
  const settings = await getSettings();
  let sent = 0;

  for (const client of clients) {
    const template = await db.template.findUnique({ where: { id: client.refillTemplateId! } });
    if (!template || !templateSendable(settings, template)) continue;
    if (template.category === "MARKETING" && quietUntil(client, now)) continue;
    // Thabaal-wallet clients with no balance left: reminders wait for a recharge.
    if ((await affordableMessages(client.id, template.category)) <= 0) continue;

    const due = new Date(now.getTime() - client.refillDays! * DAY);
    const orders = await db.order.findMany({
      where: {
        clientId: client.id,
        status: { not: "CANCELLED" },
        reminderSentAt: null,
        createdAt: { lte: due, gte: new Date(due.getTime() - GRACE_DAYS * DAY) },
        customer: { optedOut: false, unreachable: false },
      },
      include: { customer: true },
      orderBy: { createdAt: "asc" },
      take: PER_TICK,
    });

    const { number, cfg } = await senderFor(client.id, null);
    for (const o of orders) {
      // Claim it first so overlapping scheduler calls can't send twice.
      const claimed = await db.order.updateMany({ where: { id: o.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (!claimed.count) continue;
      const newer = await db.order.count({ where: { customerId: o.customerId, createdAt: { gt: o.createdAt }, status: { not: "CANCELLED" } } });
      if (newer) continue; // they've already reordered

      try {
        const res = await deliver(settings, template, o.customer, cfg);
        await db.message.create({
          data: {
            customerId: o.customerId, templateId: template.id, templateName: template.name, body: res.text, status: "SENT",
            waMessageId: res.id, simulated: res.simulated, provider: res.provider, sentAt: new Date(),
            senderId: res.provider === "META" ? (number?.id ?? null) : null,
          },
        });
        sent++;
      } catch (e) {
        const code = e instanceof MetaError ? (e.code ?? null) : null;
        const kind = metaError(code)?.kind;
        // Token, account, speed or Meta outage: not the customer's fault. Give the reminder back so a
        // later run sends it, and stop this client's reminders for now instead of failing them all.
        if (kind && TRY_LATER_KINDS.includes(kind)) {
          await db.order.update({ where: { id: o.id }, data: { reminderSentAt: null } });
          console.error(`Reorder reminders paused for client ${client.id}: ${explainError(code, e instanceof Error ? e.message : String(e))}`);
          break;
        }
        await db.message.create({
          data: { customerId: o.customerId, templateId: template.id, templateName: template.name, status: "FAILED", provider: settings.provider, errorCode: code, error: `Reorder reminder: ${explainError(code, e instanceof Error ? e.message : String(e))}`, failedAt: new Date() },
        });
        await applyFailure(o.customerId, code);
      }
    }
  }
  return sent;
}
