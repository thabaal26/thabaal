import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Which client's customers a message to this Meta number concerns: the client that owns the
 * number, or (for the env-configured number) every client without numbers of its own.
 */
export async function receivingNumber(phoneNumberId?: string) {
  const number = phoneNumberId ? await db.whatsAppNumber.findUnique({ where: { phoneNumberId }, select: { id: true, clientId: true } }) : null;
  const customers: Prisma.CustomerWhereInput = number ? { clientId: number.clientId } : { client: { numbers: { none: {} } } };
  return { number, customers };
}

export type IncomingReply = {
  phone: string; // digits only
  text: string;
  kind: "text" | "button" | "media" | "order";
  waMessageId?: string;
  at?: Date;
  /** Meta phone number that received it; absent for the shared local session. */
  phoneNumberId?: string;
  /** Local session replies can belong to any client. */
  anyClient?: boolean;
  /** A photo, voice note or file on Meta's servers, downloaded when someone views it. */
  media?: { id: string; type: string };
};

const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"];

/**
 * Saves a customer's reply against the right client. When several clients share the number
 * the reply came in on, it goes to the one that messaged this customer most recently.
 * Replies from numbers that aren't customers are ignored.
 */
export async function recordReply(r: IncomingReply) {
  if (!r.text.trim()) return null;
  let where: Prisma.CustomerWhereInput = { phone: r.phone };
  let senderId: string | null = null;
  if (!r.anyClient) {
    const { number, customers } = await receivingNumber(r.phoneNumberId);
    where = { ...where, ...customers };
    senderId = number?.id ?? null;
  }
  const candidates = await db.customer.findMany({
    where,
    select: { id: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  if (!candidates.length) return null;
  const customer = candidates.sort((a, b) => (b.messages[0]?.createdAt.getTime() ?? 0) - (a.messages[0]?.createdAt.getTime() ?? 0))[0];

  try {
    await db.reply.create({
      data: { customerId: customer.id, senderId, text: r.text.trim().slice(0, 4000), kind: r.kind, mediaId: r.media?.id, mediaType: r.media?.type, waMessageId: r.waMessageId, receivedAt: r.at ?? new Date() },
    });
  } catch (e) {
    // Webhooks retry; the same message id arriving twice is expected.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  return db.customer.findUnique({ where: { id: customer.id }, select: { id: true, clientId: true } });
}

/** Text and kind of a Cloud API inbound message. */
export function metaReplyContent(m: {
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { type?: string; button_reply?: { title?: string }; list_reply?: { title?: string }; call_permission_reply?: { response?: string } };
  image?: { caption?: string };
  order?: { product_items?: { quantity?: number | string }[] };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  reaction?: { emoji?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string } }[];
}): { text: string; kind: IncomingReply["kind"]; media?: IncomingReply["media"] } {
  if (m.text?.body) return { text: m.text.body, kind: "text" };
  // An emoji reaction to one of our messages; an empty emoji means they removed it.
  if (m.type === "reaction") return { text: m.reaction?.emoji ? `Reacted ${m.reaction.emoji}` : "", kind: "media" };
  if (m.type === "location") {
    const l = m.location;
    const where = [l?.name, l?.address].filter(Boolean).join(", ");
    return { text: `Location: ${where || `${l?.latitude}, ${l?.longitude}`}${l?.latitude != null ? ` (https://maps.google.com/?q=${l.latitude},${l.longitude})` : ""}`, kind: "media" };
  }
  if (m.type === "contacts") return { text: `Shared contact: ${m.contacts?.map((c) => c.name?.formatted_name).filter(Boolean).join(", ") || "unnamed"}`, kind: "media" };
  if (m.type === "order") {
    const n = (m.order?.product_items ?? []).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
    return { text: `Placed an order from the catalogue (${n} item${n === 1 ? "" : "s"})`, kind: "order" };
  }
  if (m.interactive?.type === "call_permission_reply")
    return { text: m.interactive.call_permission_reply?.response === "accept" ? "Allowed you to call them on WhatsApp" : "Declined calls on WhatsApp", kind: "button" };
  const tapped = m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
  if (tapped) return { text: tapped, kind: "button" };
  const caption = m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? m.document?.filename;
  const label =
    { image: "Photo", video: "Video", audio: "Voice note", document: "Document", sticker: "Sticker", location: "Location",
      interactive: "Tapped a WhatsApp button", unsupported: "A message type WhatsApp can't show here", request_welcome: "Opened the chat", system: "WhatsApp notice" }[m.type ?? ""] ??
    (m.type ? `Message (${m.type})` : "Message");
  const file = m.type ? (m as Record<string, { id?: string } | undefined>)[m.type] : undefined;
  const media = file?.id && MEDIA_TYPES.includes(m.type!) ? { id: file.id, type: m.type! } : undefined;
  return { text: caption ? `${label}: ${caption}` : `[${label}]`, kind: "media", media };
}

/** When typed messages stop being allowed (24 hours after the customer last wrote); null if that has passed or they never wrote. */
export function replyWindowEnd(lastReplyAt: Date | undefined) {
  if (!lastReplyAt) return null;
  const end = new Date(lastReplyAt.getTime() + 24 * 3_600_000);
  return end.getTime() > Date.now() ? end : null;
}
