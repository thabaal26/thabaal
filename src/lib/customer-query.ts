import "server-only";
import type { Prisma } from "@prisma/client";
import { customersWithProducts } from "./product-scope";

export type ScopeLike = { clientId?: string | null; isAdmin?: boolean };
const owned = (s: ScopeLike) => (s.clientId ? { clientId: s.clientId } : {});

export type CustomerFilters = { q?: string; tag?: string; area?: string; archivedOnly?: boolean; includeArchived?: boolean };

/** Reads the Customers page filters from its URL search params. */
export function customerFilters(sp: Record<string, string | string[] | undefined>): Required<CustomerFilters> {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const archivedOnly = sp.tab === "archived" || sp.archived === "true";
  const includeArchived = sp.includeArchived === "true";
  return { q: one(sp.q).trim(), tag: one(sp.tag), area: one(sp.area), archivedOnly, includeArchived };
}

/**
 * The customers the Customers page lists for these filters; the CSV export uses the same
 * query, so a download always matches what's on screen.
 *  tag: a tag, or "__optout" for opted-out customers
 *  area: "region:Madurai city", "loc:Sellur" or "none" (no location noted)
 *  q: part of a name, or digits of a phone number
 *  tag "product:<catalogue name>": customers who ordered or noted buying that catalogue product
 */
export async function customerWhere(scope: ScopeLike, { q = "", tag = "", area = "", archivedOnly = false, includeArchived = false }: CustomerFilters): Promise<Prisma.CustomerWhereInput> {
  const productFilter = tag.startsWith("product:") ? tag.slice(8).trim() : "";
  const buyers = productFilter && scope.clientId ? await customersWithProducts(scope.clientId, [productFilter]) : [];
  const digits = q.replace(/\D/g, "");
  return {
    ...owned(scope),
    ...(archivedOnly
      ? { deletedAt: { not: null } }
      : includeArchived
        ? {}
        : { deletedAt: null }),
    ...(tag === "__optout"
      ? { optedOut: true }
      : productFilter
        ? { id: { in: buyers } }
        : tag
          ? { tags: { has: tag } }
          : {}),
    ...(area === "none" ? { location: null } : area.startsWith("region:") ? { region: area.slice(7) } : area.startsWith("loc:") ? { location: area.slice(4) } : {}),
    ...(q && {
      AND: [
        {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { purchases: { contains: q, mode: "insensitive" } },
            { phone: { contains: digits || q } },
          ],
        },
      ],
    }),
  };
}
