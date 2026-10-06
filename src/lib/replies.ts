import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

export type IncomingReply = {
  phone: string; // digits only
  text: string;
  kind: "text" | "button" | "media";
  waMessageId?: string;
  at?: Date;
  /** Meta phone number that received it; absent for the shared local session. */
  phoneNumberId?: string;
  /** Local session replies can belong to any client. */
  anyClient?: boolean;
};

/**
 * Saves a customer's reply against the right client. When several clients share the number
 * the reply came in on, it goes to the one that messaged this customer most recently.
 * Replies from numbers that aren't customers are ignored.
 */
export async function recordReply(r: IncomingReply) {
  if (!r.text.trim()) return;
  let where: Prisma.CustomerWhereInput = { phone: r.phone };
  if (!r.anyClient) {
    const owner = r.phoneNumberId ? await db.client.findUnique({ where: { waPhoneNumberId: r.phoneNumberId }, select: { id: true } }) : null;
    where = { ...where, ...(owner ? { clientId: owner.id } : { client: { waPhoneNumberId: null } }) };
  }
  const candidates = await db.customer.findMany({
    where,
    select: { id: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  if (!candidates.length) return;
  const customer = candidates.sort((a, b) => (b.messages[0]?.createdAt.getTime() ?? 0) - (a.messages[0]?.createdAt.getTime() ?? 0))[0];

  try {
    await db.reply.create({
      data: { customerId: customer.id, text: r.text.trim().slice(0, 4000), kind: r.kind, waMessageId: r.waMessageId, receivedAt: r.at ?? new Date() },
    });
  } catch (e) {
    // Webhooks retry; the same message id arriving twice is expected.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
}

/** Text and kind of a Cloud API inbound message. */
export function metaReplyContent(m: {
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
}): { text: string; kind: IncomingReply["kind"] } {
  if (m.text?.body) return { text: m.text.body, kind: "text" };
  const tapped = m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
  if (tapped) return { text: tapped, kind: "button" };
  const caption = m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? m.document?.filename;
  const label = { image: "Photo", video: "Video", audio: "Voice note", document: "Document", sticker: "Sticker", location: "Location" }[m.type ?? ""] ?? "Message";
  return { text: caption ? `${label}: ${caption}` : `[${label}]`, kind: "media" };
}
