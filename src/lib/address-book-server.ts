import "server-only";
import type { Prisma } from "@prisma/client";
import { parseAddressText } from "./address";
import { mergeAddresses, readAddresses, withAddress, type SavedAddress } from "./address-book";
import { db } from "./db";

/**
 * A customer's delivery addresses, newest first (up to 5): the saved list, plus, for customers from before the list,
 * the address on their profile and the addresses on their past orders.
 *
 * TEN-01: Explicitly scoped to client tenant context for strict defense-in-depth isolation.
 */
export async function addressBook(customerId: string, clientId?: string): Promise<SavedAddress[]> {
  if (!customerId?.trim()) return [];
  const c = await db.customer.findFirst({
    where: {
      id: customerId.trim(),
      ...(clientId?.trim() ? { clientId: clientId.trim() } : {}),
    },
    select: {
      addresses: true,
      locationRaw: true,
      location: true,
      deliveryAddress: true,
      client: { select: { homeCity: true } },
      orders: {
        where: {
          note: { not: null },
          status: { not: "CANCELLED" },
          ...(clientId?.trim() ? { clientId: clientId.trim() } : {}),
        },
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

/**
 * Call before a customer's latest address (locationRaw) changes: a customer from before the list gets the addresses
 * known so far (profile and past orders) written to it, so the one being replaced isn't lost.
 */
export async function keepKnownAddresses(customerId: string, clientId?: string) {
  if (!customerId?.trim()) return;
  const c = await db.customer.findFirst({
    where: { id: customerId.trim(), ...(clientId?.trim() ? { clientId: clientId.trim() } : {}) },
    select: { id: true, addresses: true },
  });
  if (!c || readAddresses(c.addresses).length) return;
  const known = await addressBook(c.id, clientId);
  if (known.length) {
    await db.customer.updateMany({
      where: { id: c.id, ...(clientId?.trim() ? { clientId: clientId.trim() } : {}) },
      data: { addresses: known as unknown as Prisma.InputJsonValue },
    });
  }
}

/** Puts an address on top of the customer's list (given or used now). The first save keeps their older addresses. */
export async function rememberAddress(
  customerId: string,
  entry: { text: string; area?: string | null; mapUrl?: string | null },
  clientId?: string
) {
  if (!entry.text.trim() || !customerId?.trim()) return;
  const c = await db.customer.findFirst({
    where: { id: customerId.trim(), ...(clientId?.trim() ? { clientId: clientId.trim() } : {}) },
    select: { id: true, addresses: true },
  });
  if (!c) return;
  const saved = readAddresses(c.addresses);
  const base = saved.length ? saved : await addressBook(c.id, clientId);
  const next = withAddress(base, entry);
  await db.customer.updateMany({
    where: { id: c.id, ...(clientId?.trim() ? { clientId: clientId.trim() } : {}) },
    data: { addresses: next as unknown as Prisma.InputJsonValue },
  });
}
