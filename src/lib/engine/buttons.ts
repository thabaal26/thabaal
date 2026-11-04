import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { sendCatalogueTo } from "../catalog";
import { offerReorder } from "../order-intake";
import { textInWindow } from "../payments";
import { receivingNumber } from "../replies";
import { nameOf } from "../wa-text";
import { pauseChat } from "./conversation";
import { fillReply, PAYLOAD_PREFIX, quickReplies, type ActionKind } from "./keys";

// A tapped template quick-reply button → the action the business saved for it (ButtonAction), per business mode:
//   legacy – nothing here; today's built-in replies answer (the default for every business),
//   shadow – the engine works out what it would do and logs it (EngineDecision), today's replies still answer,
//   engine – a mapped button runs its saved action instead; unmapped buttons still get today's replies.
// The tap is matched by our payload ("tb:<key>") or by the template message it answers (Meta's context.id), never by
// the label alone, and only for the business that owns the receiving number, on a signed webhook.

export type Mode = "legacy" | "shadow" | "engine";
export const MODES: Mode[] = ["legacy", "shadow", "engine"];
export const asMode = (m: string | null | undefined): Mode => (MODES.includes(m as Mode) ? (m as Mode) : "legacy");

type TapMessage = { id?: string; type?: string; button?: { text?: string; payload?: string }; context?: { id?: string } };
type Cust = { id: string; clientId: string; phone: string; name: string; optedOut: boolean; tags?: string[] | null };

export type ResolvedTap = { templateId: string; key: string; label: string; source: "payload" | "context" };

/** Which template button this tap is, for this business; null when it can't be told for sure. */
export async function resolveTap(clientId: string, m: TapMessage): Promise<ResolvedTap | null> {
  if (m.type !== "button") return null;
  const label = m.button?.text ?? "";
  const payload = m.button?.payload ?? "";
  const ctx = m.context?.id ? await db.message.findUnique({ where: { waMessageId: String(m.context.id) }, select: { templateId: true, customer: { select: { clientId: true } } } }) : null;
  // The message tapped must be this business's own template message.
  if (!ctx?.templateId || ctx.customer.clientId !== clientId) return null;
  const t = await db.template.findFirst({ where: { id: ctx.templateId, clientId }, select: { id: true, buttons: true } });
  if (!t) return null;
  const buttons = quickReplies(t.buttons);
  const byPayload = payload.startsWith(PAYLOAD_PREFIX) ? buttons.find((b) => b.key === payload.slice(PAYLOAD_PREFIX.length)) : undefined;
  if (byPayload) return { templateId: t.id, key: byPayload.key, label: byPayload.text, source: "payload" };
  // No payload of ours (sent before payloads were on): the button with this exact label on that template.
  const byLabel = buttons.filter((b) => b.text === label);
  return byLabel.length === 1 ? { templateId: t.id, key: byLabel[0].key, label: byLabel[0].text, source: "context" } : null;
}

/** Does the action and says so in a line for the log. */
async function run(c: Cust, action: ActionKind, value: string | null, replyText: string | null, shop: string) {
  const vars = { name: nameOf(c.name), shop };
  const say = (text: string, label: string) => textInWindow(c, fillReply(text, vars), label).catch(() => false);
  switch (action) {
    case "reply":
      await say(value ?? "", "Button reply");
      return "replied";
    case "handoff":
      // Staff answer: automatic replies pause for a day (or until staff resume them), and the chat stays open in Chats.
      await pauseChat(c.clientId, c.id, 24 * 60, "Customer asked for staff");
      await db.customer.update({ where: { id: c.id }, data: { tags: Array.from(new Set([...(c.tags ?? []), "needs-staff"])) } });
      await say(replyText || "Thanks! Someone from {shop} will reply to you here soon.", "Handed to staff");
      return "handed to staff";
    case "tag":
      await db.customer.update({ where: { id: c.id }, data: { tags: Array.from(new Set([...(c.tags ?? []), value ?? ""].filter(Boolean))) } });
      if (replyText) await say(replyText, "Button reply");
      return `tagged ${value}`;
    case "opt_out":
      if (value === "all") {
        // Told first: once opted out, nothing more can be sent.
        await say(replyText || "Done. You won't receive messages from {shop} anymore. Reply here anytime if you change your mind.", "Stopped messages");
        await db.customer.update({ where: { id: c.id }, data: { optedOut: true } });
        return "opted out of all messages";
      }
      await db.customer.update({ where: { id: c.id }, data: { tags: Array.from(new Set([...(c.tags ?? []), "no-offers"])) } });
      await say(replyText || "Done. You won't receive offers from {shop} anymore. Messages about your orders will still reach you.", "Offers stopped");
      return "stopped offers";
    case "builtin":
      if (value === "reorder" && (await offerReorder(c.id))) return "offered last order";
      await sendCatalogueTo(c.id);
      return "sent catalogue";
  }
}

/**
 * The engine's turn for a tapped template button. True when it answered (engine mode, mapped button): the webhook
 * then skips today's replies for this message. False in every other case, so nothing changes.
 */
export async function handleButtonTap(c: Cust, m: TapMessage, opts: { inboundId: string; phoneNumberId?: string; signed: boolean }): Promise<boolean> {
  if (!opts.signed || !opts.inboundId || m.type !== "button") return false;
  const client = await db.client.findUnique({ where: { id: c.clientId }, select: { name: true, automationMode: true } });
  const mode = asMode(client?.automationMode);
  if (mode === "legacy") return false;
  // Only for the business that owns the number the customer wrote to (never a guess between businesses).
  const { number } = await receivingNumber(opts.phoneNumberId);
  if (!number || number.clientId !== c.clientId) return false;
  const tap = await resolveTap(c.clientId, m);
  if (!tap) return false;
  const mapping = await db.buttonAction.findFirst({ where: { clientId: c.clientId, templateId: tap.templateId, buttonKey: tap.key, enabled: true } });
  if (!mapping) return false;
  const act = mode === "engine";
  // One decision per message: a second delivery of the same tap finds it and does nothing.
  try {
    await db.engineDecision.create({
      data: { clientId: c.clientId, customerId: c.id, inboundId: opts.inboundId, templateId: tap.templateId, buttonKey: tap.key, action: mapping.action, mode, executed: false, detail: `${tap.label} (${tap.source})` },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return act;
    throw e;
  }
  if (!act) return false;
  const done = await run(c, mapping.action as ActionKind, mapping.value, mapping.replyText, client?.name ?? "us");
  await db.engineDecision.update({ where: { inboundId: opts.inboundId }, data: { executed: true, detail: `${tap.label} (${tap.source}): ${done}` } });
  return true;
}
