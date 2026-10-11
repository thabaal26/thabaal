import "server-only";
import type { Prisma } from "@prisma/client";
import { owned, type Scope } from "./session";

export type CustomerFilters = { q?: string; tag?: string; area?: string };

/** Reads the Customers page filters from its URL search params. */
export function customerFilters(sp: Record<string, string | string[] | undefined>): Required<CustomerFilters> {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  return { q: one(sp.q).trim(), tag: one(sp.tag), area: one(sp.area) };
}

/**
 * The customers the Customers page lists for these filters; the CSV export uses the same
 * query, so a download always matches what's on screen.
 *  tag: a tag, or "__optout" for opted-out customers
 *  area: "region:Madurai city", "loc:Sellur" or "none" (no location noted)
 *  q: part of a name, or digits of a phone number
 */
export function customerWhere(scope: Scope, { q = "", tag = "", area = "" }: CustomerFilters): Prisma.CustomerWhereInput {
  const productFilter = tag.startsWith("product:") ? tag.slice(8).trim() : "";
  const productSlug = productFilter ? productFilter.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";
  const digits = q.replace(/\D/g, "");
  return {
    ...owned(scope),
    ...(tag === "__optout"
      ? { optedOut: true }
      : productFilter
        ? {
            OR: [
              { purchases: { contains: productFilter, mode: "insensitive" } },
              ...(productSlug ? [{ tags: { has: productSlug } }] : []),
            ],
          }
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
