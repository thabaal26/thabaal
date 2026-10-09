"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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

/** Upload product image file to public/uploads/catalog */
export async function uploadProductImage(formData: FormData): Promise<{ ok: boolean; url?: string; message?: string }> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change products." };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, message: "No image file provided." };
  if (!file.type.startsWith("image/")) return { ok: false, message: "Only image files (JPG, PNG, WebP) are allowed." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: "Image must be under 5MB." };

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `prod-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads", "catalog");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }
    await writeFile(join(uploadDir, filename), buffer);
    return { ok: true, url: `/uploads/catalog/${filename}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to upload image." };
  }
}

/** Update product price, stock availability, name, image or description in WhatsApp Catalog. */
export async function updateProduct(data: {
  id: string;
  retailerId: string;
  priceAmount?: number;
  inStock?: boolean;
  name?: string;
  description?: string;
  imageUrl?: string | null;
}): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change products." };
  if (!scope.clientId) return { ok: false, message: "No client selected." };

  const res = await updateCatalogProductItem(scope.clientId, data);
  revalidatePath("/dashboard/catalogue");
  revalidatePath("/dashboard/orders");
  return res;
}
