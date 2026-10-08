import "server-only";
import { db } from "./db";

/** Full https link for a path like /brands/thenan/banner.jpg, since WhatsApp downloads images by link. */
export function absoluteUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https:\/\//.test(path)) return path;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
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
