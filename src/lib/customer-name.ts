// A customer's name, filled in by itself from what they share, so chats and orders don't stay "+91 98765 43210".
// Sources, strongest first: what staff type (always kept), the name in the WhatsApp address form, a "Name: …" line in
// an address they type, and their WhatsApp profile name. Anything found by itself only replaces a name that is still
// just their number: a real name is never overwritten (someone may order for their mother, with her name on the form).
// Pure helpers here; fillCustomerName and backfillCustomerNames touch the database.

import { Prisma } from "@prisma/client";
import { db } from "./db";

/** No real name yet: empty, their number ("+919876543210"), or only digits and signs. */
export function isPlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return !n || /^[+\d\s()-]+$/.test(n);
}

/**
 * A person's name from what WhatsApp or a form gives, or null when it isn't one: emoji and symbols are dropped,
 * spaces tidied, and it needs at least two letters (any script, so Tamil names work) and no more than 3 digits.
 * "~", "🌸", "9876543210" and "." are not names; "Mom ❤️" becomes "Mom".
 */
export function cleanPersonName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw
    .normalize("NFC")
    // Emoji leave invisible joiners and variation selectors behind; Tamil vowel signs (also marks) stay.
    .replace(/[︀-️‍⃣]/g, "")
    .replace(/[^\p{L}\p{M}\p{N} .'-]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.'-]+|[\s.'-]+$/g, "")
    .trim();
  if ((n.match(/\p{L}/gu) ?? []).length < 2) return null;
  if ((n.match(/\p{N}/gu) ?? []).length > 3) return null;
  return n.slice(0, 60).trim();
}

/** The name in a typed address when it is labelled: "Name: Ravi Kumar", "பெயர் - மீனா". Null when there's no label. */
export function nameFromText(text: string | null | undefined): string | null {
  const m = /(?:^|[\n,;])\s*(?:name|பெயர்)\s*[:\-–]\s*([^\n,;]{2,60})/iu.exec(text ?? "");
  return m ? cleanPersonName(m[1]) : null;
}

/** Puts a found name on the customer when they only have their number as a name. True when it changed. */
export async function fillCustomerName(customerId: string, candidate: string | null | undefined): Promise<boolean> {
  const name = cleanPersonName(candidate);
  if (!name) return false;
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  if (!c || !isPlaceholderName(c.name)) return false;
  // Only while it is still the placeholder read above (staff may have typed one a moment ago).
  const done = await db.customer.updateMany({ where: { id: customerId, name: c.name }, data: { name } });
  return done.count > 0;
}

/**
 * Customers from before this who still show as a number: the name from the WhatsApp address form they already sent
 * (kept with their saved address), else a "Name: …" line in a message of theirs. A few hundred per scheduler run.
 */
export async function backfillCustomerNames(limit = 300): Promise<number> {
  // Only those with something to read a name from, so the same nameless ones aren't read on every run.
  const rows = await db.customer.findMany({
    where: {
      AND: [
        { OR: [{ name: { startsWith: "+" } }, { name: "" }] },
        { OR: [{ deliveryAddress: { not: Prisma.DbNull } }, { replies: { some: { text: { contains: "name", mode: "insensitive" } } } }, { replies: { some: { text: { contains: "பெயர்" } } } }] },
      ],
    },
    select: { id: true, name: true, deliveryAddress: true, replies: { where: { kind: "text" }, orderBy: { receivedAt: "desc" }, take: 20, select: { text: true } } },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
  let filled = 0;
  for (const r of rows) {
    if (!isPlaceholderName(r.name)) continue;
    const formName = (r.deliveryAddress as { name?: unknown } | null)?.name;
    const found = cleanPersonName(typeof formName === "string" ? formName : null) ?? r.replies.map((x) => nameFromText(x.text)).find(Boolean) ?? null;
    if (found && (await fillCustomerName(r.id, found))) filled++;
  }
  return filled;
}
