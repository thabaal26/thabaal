"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createCatalogProductItem, deleteCatalogProductItem, sendCatalogueTo, updateCatalogProductItem } from "@/lib/catalog";
import { getScope, owned } from "@/lib/session";
import { storePublicImage } from "@/lib/uploaded-image";
import type { ActionResult } from "./templates";
import { trackPress } from "@/lib/usage";

/** Staff send the free catalogue message to a customer who wrote in the last 24 hours. */
export async function sendCatalogue(customerId: string): Promise<ActionResult> {
  trackPress("catalogue.send");
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change anything." };
  const c = await db.customer.findFirst({ where: { id: customerId, ...owned(scope) }, select: { id: true } });
  if (!c) return { ok: false, message: "Customer not found." };
  const r = await sendCatalogueTo(c.id);
  revalidatePath(`/dashboard/customers/${c.id}`);
  return r;
}

/**
 * Stores a product photo or reply attachment (JPG/PNG/WebP/PDF) in Vercel Blob (with automatic
 * PostgreSQL fallback at /api/upload/[id]) and returns its public link.
 */
export async function uploadProductImage(formData: FormData): Promise<{ ok: boolean; url?: string; message?: string }> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not upload files." };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, message: "No file provided." };
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
    return { ok: false, message: "Only JPG, PNG, WebP images or PDF files can be used." };
  }
  if (file.size > 4 * 1024 * 1024) return { ok: false, message: "File must be under 4 MB." };

  try {
    const url = await storePublicImage({
      bytes: await file.arrayBuffer(),
      contentType: file.type,
      filename: file.name,
    });
    return { ok: true, url };
  } catch (e) {
    console.error("File upload failed", e);
    return { ok: false, message: "Couldn't store the file. Paste a public link (https://…) instead, or try again." };
  }
}

const refresh = () => {
  revalidatePath("/dashboard/catalogue");
  revalidatePath("/dashboard/orders");
};

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
  trackPress("product.save");
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change products." };
  if (!scope.clientId) return { ok: false, message: "No client selected." };

  const res = await updateCatalogProductItem(scope.clientId, data);
  refresh();
  return res;
}

/** Add a product to the client's WhatsApp catalogue. */
export async function createProduct(data: { retailerId: string; name: string; priceAmount: number; inStock: boolean; description: string; imageUrl: string | null }): Promise<ActionResult> {
  trackPress("product.save");
  const scope = await getScope();
  if (!scope.canManage) return { ok: false, message: "Only managers can add products." };
  if (!scope.clientId) return { ok: false, message: "No client selected." };
  const client = await db.client.findUnique({ where: { id: scope.clientId }, select: { name: true, website: true, supportPhone: true } });
  if (!client) return { ok: false, message: "Client not found." };
  // Meta requires a product link; the client's website, else a chat link to their support number.
  const phone = client.supportPhone?.replace(/\D/g, "");
  const link = client.website?.trim() || (phone ? `https://wa.me/${phone}` : "https://www.whatsapp.com/");

  const res = await createCatalogProductItem(scope.clientId, { ...data, brand: client.name, link });
  refresh();
  return res;
}

/** Remove a product from the client's WhatsApp catalogue. */
export async function deleteProduct(retailerId: string): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.canManage) return { ok: false, message: "Only managers can delete products." };
  if (!scope.clientId) return { ok: false, message: "No client selected." };
  const res = await deleteCatalogProductItem(scope.clientId, retailerId);
  refresh();
  return res;
}
