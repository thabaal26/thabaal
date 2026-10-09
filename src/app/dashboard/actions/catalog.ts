"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendCatalogueTo, updateCatalogProductItem } from "@/lib/catalog";
import { getScope, owned } from "@/lib/session";
import type { ActionResult } from "./templates";

/** Staff send the free catalogue message to a customer who wrote in the last 24 hours. */
export async function sendCatalogue(customerId: string): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change anything." };
  const c = await db.customer.findFirst({ where: { id: customerId, ...owned(scope) }, select: { id: true } });
  if (!c) return { ok: false, message: "Customer not found." };
  const r = await sendCatalogueTo(c.id);
  revalidatePath(`/dashboard/customers/${c.id}`);
  return r;
}

/** Update product price, stock availability, name or description in WhatsApp Catalog. */
export async function updateProduct(data: {
  id: string;
  retailerId: string;
  priceAmount?: number;
  inStock?: boolean;
  name?: string;
  description?: string;
}): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change products." };
  if (!scope.clientId) return { ok: false, message: "No client selected." };

  const res = await updateCatalogProductItem(scope.clientId, data);
  revalidatePath("/dashboard/catalogue");
  revalidatePath("/dashboard/orders");
  return res;
}
