import "server-only";
import crypto from "node:crypto";
import { put } from "@vercel/blob";
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

  // Always the portal's public address (never a preview or old deployment URL), so the link keeps working.
  void opts.origin;
  const base = APP_ORIGIN;

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
