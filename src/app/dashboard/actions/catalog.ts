"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendCatalogueTo } from "@/lib/catalog";
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
