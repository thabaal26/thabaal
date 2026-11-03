// One person, several WhatsApp numbers. Each number stays its own Customer row: WhatsApp keeps chats, opt-outs,
// "can't receive" and Meta's holds per number, so they must too. Rows with the same personId are the same person:
// the customer page lists the other numbers, adding or leaving out one number in a campaign does the same to all of
// them, and campaigns send to every number (each number gets the offer; each one's own state still applies).
import { db } from "./db";
import { isInternalLoyaltyTag } from "./loyalty";

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
    select: { id: true, name: true, phone: true, optedOut: true, unreachable: true, purchases: true, tags: true },
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

/* ---------- One person's totals: orders, sheet purchases and points on every number ---------- */

/** The order fields loyalty needs (lib/loyalty.ts loyaltyFromOrders). */
export const LOYALTY_ORDER_SELECT = { id: true, total: true, status: true, paidAt: true, paymentMethod: true, internalNote: true, pointsRedeemed: true } as const;

/** What was written on the order sheets for each number, once: a linked number copies it, so the same text counts once. */
export function mergePurchases(list: readonly (string | null | undefined)[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of list) {
    const key = p?.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p!.trim());
  }
  return out.length ? out.join(", ") : null;
}

type LoyaltyInput = { id: string; personId: string | null; purchases?: string | null; tags?: string[] | null; orders: { id?: string }[] };

/**
 * These customers' loyalty inputs for the whole person (one query for all): orders of every number, their sheet
 * purchases once, and points given or used by hand on any number (loyalty-bonus tags). The rest of each row,
 * its own tags included, stays as it is. Rows without other numbers come back unchanged.
 */
export async function asPeople<T extends LoyaltyInput>(rows: T[]): Promise<T[]> {
  const people = [...new Set(rows.map((r) => r.personId).filter((p): p is string => Boolean(p)))];
  if (!people.length) return rows;
  const all = await db.customer.findMany({ where: { personId: { in: people } }, select: { id: true, personId: true, purchases: true, tags: true, orders: { select: LOYALTY_ORDER_SELECT } } });
  return rows.map((r) => {
    const others = all.filter((o) => o.personId === r.personId && o.id !== r.id);
    if (!r.personId || !others.length) return r;
    return {
      ...r,
      purchases: mergePurchases([r.purchases, ...others.map((o) => o.purchases)]),
      tags: [...(r.tags ?? []), ...others.flatMap((o) => o.tags.filter(isInternalLoyaltyTag))],
      orders: [...r.orders, ...others.flatMap((o) => o.orders)] as T["orders"],
    };
  });
}

/** One customer's loyalty inputs for the whole person (see asPeople). */
export async function asPerson<T extends LoyaltyInput>(row: T): Promise<T> {
  return (await asPeople([row]))[0];
}
