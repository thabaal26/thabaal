// One person, several WhatsApp numbers. Each number stays its own Customer row: WhatsApp keeps chats, opt-outs,
// "can't receive" and Meta's holds per number, so they must too. Rows with the same personId are the same person:
// the customer page lists the other numbers, adding or leaving out one number in a campaign does the same to all of
// them, and campaigns send to every number (each number gets the offer; each one's own state still applies).
import { db } from "./db";

/** These customers and every other number of the same people (for adding or leaving out a person in a campaign). */
export async function withSamePerson(clientId: string, ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return [];
  const people = await db.customer.findMany({ where: { clientId, id: { in: [...ids] }, personId: { not: null } }, select: { personId: true } });
  if (!people.length) return [...new Set(ids)];
  const linked = await db.customer.findMany({ where: { clientId, personId: { in: people.map((p) => p.personId!) } }, select: { id: true } });
  return [...new Set([...ids, ...linked.map((c) => c.id)])];
}

/** Makes these customers one person (joining any numbers already linked to either). Returns the personId. */
export async function linkCustomers(clientId: string, ids: readonly string[]): Promise<string | null> {
  const unique = [...new Set(ids)];
  const rows = await db.customer.findMany({ where: { clientId, id: { in: unique } }, select: { id: true, personId: true } });
  if (rows.length < 2) return null;
  const groups = [...new Set(rows.map((r) => r.personId).filter((p): p is string => Boolean(p)))];
  const personId = groups[0] ?? rows.find((r) => r.id === unique[0])?.id ?? rows[0].id;
  await db.customer.updateMany({
    where: { clientId, OR: [{ id: { in: rows.map((r) => r.id) } }, ...(groups.length ? [{ personId: { in: groups } }] : [])] },
    data: { personId },
  });
  return personId;
}

/** Takes one number out of its person (the row and its history stay). A person left with one number is single again. */
export async function unlinkCustomer(clientId: string, id: string) {
  const c = await db.customer.findFirst({ where: { id, clientId }, select: { personId: true } });
  if (!c?.personId) return;
  await db.customer.update({ where: { id }, data: { personId: null } });
  const left = await db.customer.findMany({ where: { clientId, personId: c.personId }, select: { id: true } });
  if (left.length === 1) await db.customer.update({ where: { id: left[0].id }, data: { personId: null } });
}

/** The person's other numbers (not this row), oldest first. */
export async function otherNumbers(clientId: string, c: { id: string; personId: string | null }) {
  if (!c.personId) return [];
  return db.customer.findMany({
    where: { clientId, personId: c.personId, id: { not: c.id } },
    select: { id: true, name: true, phone: true, optedOut: true, unreachable: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Makes `phones` this customer's other numbers. A new number becomes a customer with the same name, area, purchases,
 * tags and agreement; a number already saved is linked as it is (its name, chats and orders stay); a linked number
 * no longer listed is unlinked (kept, with its history). Returns what changed, for the message to the owner.
 */
export async function setOtherNumbers(clientId: string, mainId: string, phones: readonly string[]) {
  const main = await db.customer.findFirstOrThrow({ where: { id: mainId, clientId } });
  const wanted = [...new Set(phones)].filter((p) => p !== main.phone);
  const current = await otherNumbers(clientId, main);
  const ids: string[] = [];
  const added: string[] = [];
  const joined: { name: string; phone: string }[] = [];
  for (const phone of wanted) {
    const known = await db.customer.findUnique({ where: { clientId_phone: { clientId, phone } }, select: { id: true, name: true } });
    if (known) {
      ids.push(known.id);
      if (!current.some((o) => o.id === known.id)) joined.push({ name: known.name, phone });
      continue;
    }
    const created = await db.customer.create({
      data: {
        clientId,
        phone,
        name: main.name,
        location: main.location,
        locationRaw: main.locationRaw,
        region: main.region,
        purchases: main.purchases,
        // Points earned stay with the number that earned them; the rest of the tags (groups, products) carry over.
        tags: main.tags.filter((t) => !t.trim().toLowerCase().startsWith("loyalty-bonus:")),
        optInSource: main.optInSource ?? "Same person as another saved number",
        optInAt: new Date(),
      },
      select: { id: true },
    });
    ids.push(created.id);
    added.push(phone);
  }
  const removed = current.filter((o) => !wanted.includes(o.phone));
  for (const o of removed) await unlinkCustomer(clientId, o.id);
  if (ids.length) await linkCustomers(clientId, [main.id, ...ids]);
  return { added, joined, removed: removed.map((o) => o.phone) };
}

/** "Saved with 2 numbers" style summary of setOtherNumbers, or "" when nothing changed. */
export function numbersNote(r: { added: string[]; joined: { name: string; phone: string }[]; removed: string[] }, show: (p: string) => string) {
  const parts = [
    r.added.length && `added ${r.added.map(show).join(", ")}`,
    r.joined.length && `linked ${r.joined.map((j) => `${show(j.phone)} (saved as ${j.name})`).join(", ")}`,
    r.removed.length && `unlinked ${r.removed.map(show).join(", ")} (kept as separate customers)`,
  ].filter(Boolean);
  return parts.length ? ` Other numbers: ${parts.join("; ")}.` : "";
}
