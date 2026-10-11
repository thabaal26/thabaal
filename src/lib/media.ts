import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import type { MetaComponent } from "./template";
import { getStoredPublicImage, storePublicImage } from "./uploaded-image";

const CANONICAL_HOST = "campaign-seven-ruddy.vercel.app";

/** Full https link for a path like /brands/thenan/banner.jpg, and rewrites stale preview domains. */
export function absoluteUrl(rawPath: string | null | undefined) {
  if (!rawPath) return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? CANONICAL_HOST;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.hostname === "whatsapp-portal-six.vercel.app" || u.hostname === "localhost") {
        return `https://${host}${u.pathname}${u.search}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }
  return trimmed.startsWith("/") && host ? `https://${host}${trimmed}` : null;
}

/**
 * Resolves the raw binary bytes and verified MIME type for a header image URL or path:
 * 1. Reads directly from PostgreSQL ("PortalUploadedImage") for /api/upload/[id] URLs
 * 2. Reads directly from local /public filesystem if the file exists in /public
 * 3. Falls back to HTTP fetch over the network
 */
export async function resolveImageBytes(
  urlOrPath: string,
): Promise<{ bytes: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; filename: string } | null> {
  const clean = urlOrPath.trim();
  if (!clean) return null;

  let pathname = clean;
  try {
    if (/^https?:\/\//i.test(clean)) {
      pathname = new URL(clean).pathname;
    }
  } catch {
    // keep as-is
  }

  const detectFormat = (
    buf: Buffer,
    fallbackName = "header",
  ): { bytes: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; filename: string } => {
    const isPdf = buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    const isPng = buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isWebp =
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50;
    const mimeType = isPdf ? "application/pdf" : isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
    const ext = isPdf ? "pdf" : isPng ? "png" : isWebp ? "webp" : "jpg";
    const base = path.basename(fallbackName).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-") || "attachment";
    return { bytes: buf, mimeType, filename: `${base}.${ext}` };
  };

  // 1. Direct DB lookup for /api/upload/[id]
  const uploadMatch = pathname.match(/^\/api\/upload\/([^/?#]+)$/);
  if (uploadMatch) {
    const stored = await getStoredPublicImage(decodeURIComponent(uploadMatch[1]));
    if (stored?.data) {
      return detectFormat(Buffer.from(stored.data), uploadMatch[1]);
    }
  }

  // 2. Direct local /public file lookup (0ms, no external HTTP dependencies)
  if (pathname.startsWith("/") && !pathname.startsWith("/api/")) {
    const rel = pathname.replace(/^\/+/, "");
    const publicRoot = path.resolve(process.cwd(), "public");
    const candidate = path.resolve(publicRoot, rel);
    if (candidate.startsWith(publicRoot)) {
      try {
        const fileBuf = await readFile(candidate);
        if (fileBuf.byteLength > 0) {
          return detectFormat(fileBuf, rel);
        }
      } catch {
        // Not a local public file, proceed to HTTP fetch
      }
    }
  }

  // 3. Network fetch with normalized URL
  const targetUrl = absoluteUrl(clean) ?? clean;
  if (/^https?:\/\//i.test(targetUrl)) {
    try {
      const res = await fetch(targetUrl, { cache: "no-store" });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 0) {
          return detectFormat(Buffer.from(ab), pathname);
        }
      }
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * The image an image-header template sends: its own, else the client's default image, else their banner.
 * Null when there's none, which WhatsApp would reject (error 132012).
 */
export async function headerImageFor(t: { clientId: string; headerType: string; headerMediaUrl: string | null }) {
  if (t.headerType !== "IMAGE") return null;
  if (t.headerMediaUrl?.trim()) return absoluteUrl(t.headerMediaUrl.trim()) ?? t.headerMediaUrl.trim();
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
  const localRel = `/${name.replace(/_/g, "-")}.jpg`;
  const localResolved = await resolveImageBytes(localRel);
  if (localResolved) return absoluteUrl(localRel);

  const sample = components.find((c) => c.type === "HEADER" && c.format === "IMAGE")?.example?.header_handle?.[0];
  if (!sample?.startsWith("https://")) return null;
  try {
    const r = await fetch(sample, { cache: "no-store" });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return null;
    return await storePublicImage({
      bytes: await r.arrayBuffer(),
      contentType: type,
      filename: `${name}.${type.includes("png") ? "png" : "jpg"}`,
    });
  } catch (e) {
    console.warn(`Could not copy the sample image for ${name}`, e);
    return null;
  }
}
