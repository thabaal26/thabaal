import "server-only";
import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { headers } from "next/headers";
import { APP_ORIGIN } from "./app-host";
import { db } from "./db";

let tableEnsured = false;

async function ensureUploadedImageTable() {
  if (tableEnsured) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PortalUploadedImage" (
      "id" TEXT PRIMARY KEY,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tableEnsured = true;
}

/**
 * Stores a public template header image: tries Vercel Blob first, and automatically falls back
 * to PostgreSQL ("PortalUploadedImage") served at /api/upload/[id] so uploads always work
 * out-of-the-box without requiring external Blob tokens or manual file commits.
 */
export async function storePublicImage(opts: {
  bytes: ArrayBuffer | Buffer;
  contentType: string;
  filename?: string;
  origin?: string;
}): Promise<string> {
  const buf = Buffer.isBuffer(opts.bytes) ? opts.bytes : Buffer.from(opts.bytes);
  const ct = opts.contentType.toLowerCase();
  const contentType = ct.includes("pdf")
    ? "application/pdf"
    : ct.includes("png")
      ? "image/png"
      : ct.includes("webp")
        ? "image/webp"
        : "image/jpeg";
  const ext =
    contentType === "application/pdf"
      ? "pdf"
      : contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
  const safeName = (opts.filename ?? `header.${ext}`).replace(/[^\w.-]+/g, "-").slice(-80);

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.NEW_BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    try {
      const blob = await put(`templates/${safeName}`, buf, {
        access: "public",
        contentType,
        addRandomSuffix: true,
        token: blobToken,
      });
      return blob.url;
    } catch (e) {
      console.warn("Vercel Blob unavailable, falling back to built-in DB media storage:", e instanceof Error ? e.message : e);
    }
  }

  await ensureUploadedImageTable();
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 24);
  const id = `${hash}.${ext}`;

  await db.$executeRaw`
    INSERT INTO "PortalUploadedImage" ("id", "mimeType", "data")
    VALUES (${id}, ${contentType}, ${buf})
    ON CONFLICT ("id") DO UPDATE SET "mimeType" = EXCLUDED."mimeType", "data" = EXCLUDED."data"
  `;

  return `${await storageOrigin(opts.origin)}/api/upload/${id}`;
}

/**
 * The address that serves what was just stored in this database. In production that is always the portal's public
 * address (never an old or deployment URL), so the link keeps working. Anywhere else (a preview, a QA or test copy)
 * the file sits in that copy's own database, so a www.thabaal.in link would answer 404 there: those get their own
 * address. (Photos uploaded from another copy and linked to www.thabaal.in were why some product photos broke.)
 */
async function storageOrigin(given?: string): Promise<string> {
  if (process.env.VERCEL_ENV === "production" || process.env.THABAAL_ENV === "production") return APP_ORIGIN;
  if (given && /^https?:\/\/[^/]+$/.test(given)) return given;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https")}://${host}`;
  } catch {
    // Outside a request (scripts, tests).
  }
  return APP_ORIGIN;
}

/** The stored-image id of a link to /api/upload/<id> (on any of the portal's addresses), or null. */
export function uploadedImageId(url: string | null | undefined): string | null {
  const m = /^https?:\/\/[^/]+\/api\/upload\/([\w-]+\.(?:jpg|png|webp|pdf))$/i.exec(url ?? "");
  return m ? m[1] : null;
}

/** Of these stored-image ids, the ones the database doesn't have (their links answer 404). Empty on a read error. */
export async function missingUploadedImages(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Set();
  try {
    await ensureUploadedImageTable();
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PortalUploadedImage" WHERE "id" = ANY(${unique})`;
    const have = new Set(rows.map((r) => r.id));
    return new Set(unique.filter((id) => !have.has(id)));
  } catch {
    return new Set();
  }
}

export async function getStoredPublicImage(id: string): Promise<{ mimeType: string; data: Buffer } | null> {
  try {
    await ensureUploadedImageTable();
    const rows = await db.$queryRaw<{ mimeType: string; data: Buffer }[]>`
      SELECT "mimeType", "data" FROM "PortalUploadedImage" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
