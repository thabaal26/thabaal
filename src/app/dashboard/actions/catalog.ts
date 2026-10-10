"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createCatalogProductItem, deleteCatalogProductItem, sendCatalogueTo, updateCatalogProductItem } from "@/lib/catalog";
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

/**
 * Stores a product photo in Vercel Blob and returns its public link. Public because Meta downloads
 * catalogue photos itself; the server's own disk is read-only on Vercel and can't be reached by Meta.
 */
export async function uploadProductImage(formData: FormData): Promise<{ ok: boolean; url?: string; message?: string }> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change products." };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, message: "No image file provided." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { ok: false, message: "Only JPG, PNG or WebP images can be used." };
  if (file.size > 4 * 1024 * 1024) return { ok: false, message: "Image must be under 4 MB." };

  try {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const blob = await put(`catalog/product.${ext}`, file, { access: "public", contentType: file.type, addRandomSuffix: true });
    return { ok: true, url: blob.url };
  } catch (e) {
    console.error("Product image upload failed", e);
    return { ok: false, message: "Couldn't store the photo. Paste an image link (https://…) instead, or try again." };
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
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change products." };
  if (!scope.clientId) return { ok: false, message: "No client selected." };

  const res = await updateCatalogProductItem(scope.clientId, data);
  refresh();
  return res;
}

/** Add a product to the client's WhatsApp catalogue. */
export async function createProduct(data: { retailerId: string; name: string; priceAmount: number; inStock: boolean; description: string; imageUrl: string | null }): Promise<ActionResult> {
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
