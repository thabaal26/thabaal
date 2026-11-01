import "server-only";
import type { Prisma } from "@prisma/client";
import { parseAddressText } from "./address";
import { mergeAddresses, readAddresses, withAddress, type SavedAddress } from "./address-book";
import { db } from "./db";

/**
 * A customer's delivery addresses, newest first (up to 5): the saved list, plus, for customers from before the list,
 * the address on their profile and the addresses on their past orders.
 */
export async function addressBook(customerId: string): Promise<SavedAddress[]> {
  const c = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      addresses: true,
      locationRaw: true,
      location: true,
      deliveryAddress: true,
      client: { select: { homeCity: true } },
      orders: {
        where: { note: { not: null }, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { note: true, createdAt: true, mapUrl: true },
      },
    },
  });
  if (!c) return [];
  const saved = readAddresses(c.addresses);
  const latest = c.locationRaw?.trim() || "";
  const pin = (c.deliveryAddress as { mapUrl?: unknown } | null)?.mapUrl;
  // The profile's address is the latest one given; from before the list it isn't in it yet.
  const profile: SavedAddress[] = latest
    ? [{ text: latest, area: c.location, mapUrl: typeof pin === "string" ? pin : null, usedAt: saved.some((s) => s.text === latest) ? new Date(0).toISOString() : new Date().toISOString() }]
    : [];
  const past: SavedAddress[] = [];
  for (const o of c.orders) {
    // A hand-entered order's note is "address · note": the address is the first part.
    const text = (o.note ?? "").split(" · ")[0].trim();
    if (!text) continue;
    const parsed = parseAddressText(text, c.client.homeCity);
    if (!parsed.isLikelyAddress) continue;
    past.push({ text, area: parsed.area, mapUrl: o.mapUrl, usedAt: o.createdAt.toISOString() });
  }
  return mergeAddresses(saved, profile, past);
}

/** Puts an address on top of the customer's list (given or used now). The first save keeps their older addresses. */
export async function rememberAddress(customerId: string, entry: { text: string; area?: string | null; mapUrl?: string | null }) {
  if (!entry.text.trim()) return;
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { addresses: true } });
  if (!c) return;
  const saved = readAddresses(c.addresses);
  const base = saved.length ? saved : await addressBook(customerId);
  const next = withAddress(base, entry);
  await db.customer.update({ where: { id: customerId }, data: { addresses: next as unknown as Prisma.InputJsonValue } });
}
