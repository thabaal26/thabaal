import "server-only";
import { put } from "@vercel/blob";
import { db } from "./db";
import type { MetaComponent } from "./template";

/** Full https link for a path like /brands/thenan/banner.jpg, since WhatsApp downloads images by link. */
export function absoluteUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https:\/\//.test(path)) return path;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "campaign-seven-ruddy.vercel.app";
  return path.startsWith("/") && host ? `https://${host}${path}` : null;
}

/**
 * The image an image-header template sends: its own, else the client's default image, else their banner.
 * Null when there's none, which WhatsApp would reject (error 132012).
 */
export async function headerImageFor(t: { clientId: string; headerType: string; headerMediaUrl: string | null }) {
  if (t.headerType !== "IMAGE") return null;
  if (t.headerMediaUrl?.trim()) return t.headerMediaUrl.trim();
  const c = await db.client.findUnique({ where: { id: t.clientId }, select: { defaultImageUrl: true, bannerUrl: true } });
  return absoluteUrl(c?.defaultImageUrl) ?? absoluteUrl(c?.bannerUrl);
}

/**
 * The picture for an image template synced from Meta, so it doesn't fall back to the common image:
 * our own /public image named after the template (thenan_deepavali_vilakku → /thenan-deepavali-vilakku.jpg),
 * else the sample Meta approved it with, copied to our storage because Meta's sample links expire.
 * Null when neither can be found.
 */
export async function syncedHeaderImage(name: string, components: MetaComponent[]) {
  const own = absoluteUrl(`/${name.replace(/_/g, "-")}.jpg`);
  if (own) {
    const r = await fetch(own, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (r?.ok && r.headers.get("content-type")?.startsWith("image/")) return own;
  }
  const sample = components.find((c) => c.type === "HEADER" && c.format === "IMAGE")?.example?.header_handle?.[0];
  if (!sample?.startsWith("https://") || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const r = await fetch(sample, { cache: "no-store" });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return null;
    const blob = await put(`templates/${name}.${type.includes("png") ? "png" : "jpg"}`, await r.arrayBuffer(), { access: "public", contentType: type, addRandomSuffix: true });
    return blob.url;
  } catch (e) {
    console.warn(`Could not copy the sample image for ${name}`, e);
    return null;
  }
}
