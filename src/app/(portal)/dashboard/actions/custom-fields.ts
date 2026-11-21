"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { MAX_FIELDS, readFields, type CustomField } from "@/lib/custom-fields";
import { requireManager } from "@/lib/session";
import type { ActionResult } from "./templates";

/** Saves the extra fields this client keeps on customers and orders. */
export async function saveCustomFields(fields: CustomField[]): Promise<ActionResult> {
  const s = await requireManager(true, { evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  const clean = readFields(fields);
  if (clean.length !== fields.filter((f) => f.label?.trim()).length) {
    return { ok: false, message: "Each field needs a name used once, and choice lists need at least one choice." };
  }
  for (const on of ["customer", "order"] as const) {
    if (clean.filter((f) => f.on === on).length > MAX_FIELDS) return { ok: false, message: `Up to ${MAX_FIELDS} fields for ${on}s.` };
  }
  await db.client.update({ where: { id: s.clientId }, data: { customFields: clean } });
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/orders");
  return { ok: true, message: "Fields saved." };
}
