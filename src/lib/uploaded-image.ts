import "server-only";
import crypto from "node:crypto";
import { put } from "@vercel/blob";
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
  const contentType = opts.contentType.includes("png") ? "image/png" : "image/jpeg";
  const ext = contentType === "image/png" ? "png" : "jpg";
  const safeName = (opts.filename ?? `header.${ext}`).replace(/[^\w.-]+/g, "-").slice(-80);

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(`templates/${safeName}`, buf, {
        access: "public",
        contentType,
        addRandomSuffix: true,
      });
      return blob.url;
    } catch (e) {
      console.warn("Vercel Blob unavailable, falling back to built-in DB image storage:", e instanceof Error ? e.message : e);
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

  const base =
    opts.origin?.replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://campaign-seven-ruddy.vercel.app";

  return `${base}/api/upload/${id}`;
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
