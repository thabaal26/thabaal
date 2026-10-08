import "server-only";
import { db } from "./db";
import { deliver, getSettings, templateSendable } from "./provider";
import { applyFailure, quietUntil } from "./rules";
import { senderFor } from "./senders";
import { MetaError } from "./whatsapp";

// Automatic tags from what customers do, kept up to date by the scheduler:
//   customer   – has at least one order
//   lapsed     – their last order is older than the client's lapsedDays (default 60)
//   interested – tapped a button (e.g. "Order now") and hasn't ordered since
// Tags are only added or removed by these rules, so staff's own tags are never touched.

const LIVE = `o.status <> 'CANCELLED'`;

export async function refreshLifecycleTags() {
  await db.$executeRawUnsafe(`
    UPDATE "Customer" c SET tags = array_append(c.tags, 'customer')
    WHERE NOT ('customer' = ANY(c.tags)) AND EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId" = c.id AND ${LIVE})`);

  // Lapsed: last order older than the client's window. Ordering again clears it, and re-arms the win-back.
  await db.$executeRawUnsafe(`
    UPDATE "Customer" c SET tags = array_append(c.tags, 'lapsed')
    FROM "Client" cl
    WHERE cl.id = c."clientId" AND NOT ('lapsed' = ANY(c.tags))
      AND (SELECT max(o."createdAt") FROM "Order" o WHERE o."customerId" = c.id AND ${LIVE}) < now() - make_interval(days => cl."lapsedDays")`);
  await db.$executeRawUnsafe(`
    UPDATE "Customer" c SET tags = array_remove(c.tags, 'lapsed'), "winbackSentAt" = NULL
    FROM "Client" cl
    WHERE cl.id = c."clientId" AND 'lapsed' = ANY(c.tags)
      AND (SELECT max(o."createdAt") FROM "Order" o WHERE o."customerId" = c.id AND ${LIVE}) >= now() - make_interval(days => cl."lapsedDays")`);

  // Interested: tapped a button in the last 30 days with no order since.
  await db.$executeRawUnsafe(`
    UPDATE "Customer" c SET tags = array_append(c.tags, 'interested')
    WHERE NOT ('interested' = ANY(c.tags))
      AND EXISTS (SELECT 1 FROM "Reply" r WHERE r."customerId" = c.id AND r.kind = 'button' AND r."receivedAt" > now() - interval '30 days'
                  AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId" = c.id AND ${LIVE} AND o."createdAt" > r."receivedAt"))`);
  await db.$executeRawUnsafe(`
    UPDATE "Customer" c SET tags = array_remove(c.tags, 'interested')
    WHERE 'interested' = ANY(c.tags)
      AND NOT EXISTS (SELECT 1 FROM "Reply" r WHERE r."customerId" = c.id AND r.kind = 'button' AND r."receivedAt" > now() - interval '30 days'
                      AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId" = c.id AND ${LIVE} AND o."createdAt" > r."receivedAt"))`);
}

const PER_TICK = 30;
const PER_DAY = 200; // spreads a big first batch of lapsed customers over several days

/** Sends the client's win-back template once to each lapsed customer. */
export async function sendWinbacks(now = new Date()) {
  const clients = await db.client.findMany({
    where: { winbackTemplateId: { not: null } },
    select: { id: true, winbackTemplateId: true, quietFrom: true, quietTo: true },
  });
  const settings = await getSettings();
  let sent = 0;
  for (const client of clients) {
    const template = await db.template.findUnique({ where: { id: client.winbackTemplateId! } });
    if (!template || !templateSendable(settings, template)) continue;
    if (template.category === "MARKETING" && quietUntil(client, now)) continue;
    const today = await db.customer.count({ where: { clientId: client.id, winbackSentAt: { gte: new Date(now.getTime() - 86_400_000) } } });
    const room = Math.min(PER_TICK, PER_DAY - today);
    if (room <= 0) continue;

    const due = await db.customer.findMany({
      where: { clientId: client.id, tags: { has: "lapsed" }, winbackSentAt: null, optedOut: false, unreachable: false },
      take: room,
    });
    const { number, cfg } = await senderFor(client.id, null);
    for (const c of due) {
      const claimed = await db.customer.updateMany({ where: { id: c.id, winbackSentAt: null }, data: { winbackSentAt: now } });
      if (!claimed.count) continue;
      try {
        const res = await deliver(settings, template, c, cfg);
        await db.message.create({
          data: {
            customerId: c.id, templateId: template.id, templateName: template.name, body: res.text, status: "SENT", waMessageId: res.id,
            simulated: res.simulated, provider: res.provider, sentAt: new Date(), senderId: res.provider === "META" ? (number?.id ?? null) : null,
          },
        });
        sent++;
      } catch (e) {
        const code = e instanceof MetaError ? (e.code ?? null) : null;
        await db.message.create({
          data: { customerId: c.id, templateId: template.id, templateName: template.name, status: "FAILED", provider: settings.provider, errorCode: code, error: `Win-back: ${e instanceof Error ? e.message : String(e)}`, failedAt: new Date() },
        });
        await applyFailure(c.id, code);
      }
    }
  }
  return sent;
}
