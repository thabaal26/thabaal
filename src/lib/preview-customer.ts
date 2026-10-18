import "server-only";
import { db } from "@/lib/db";
import { SAMPLE_CUSTOMER, type CustomerLike } from "@/lib/template";

/**
 * Who template previews are shown for: the business's most recently active customer who can get messages,
 * so the preview shows real names and places. A business with no customers yet gets the sample customer.
 * (Only previews: the examples sent to Meta for review stay the sample ones.)
 */
export async function previewCustomer(clientId: string | null | undefined): Promise<CustomerLike> {
  if (!clientId) return SAMPLE_CUSTOMER;
  const c = await db.customer
    .findFirst({
      where: { clientId, optedOut: false, unreachable: false },
      orderBy: { updatedAt: "desc" },
      select: { name: true, phone: true, location: true, purchases: true },
    })
    .catch(() => null);
  return c?.name ? { name: c.name, phone: c.phone, location: c.location, purchases: c.purchases } : SAMPLE_CUSTOMER;
}
