import "server-only";
import crypto from "node:crypto";
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
      "isPublic" BOOLEAN NOT NULL DEFAULT false,
      "clientId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.$executeRawUnsafe(`ALTER TABLE "PortalUploadedImage" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
  await db.$executeRawUnsafe(`ALTER TABLE "PortalUploadedImage" ADD COLUMN IF NOT EXISTS "clientId" TEXT`).catch(() => {});
  tableEnsured = true;
}

/**
 * Stores a public template header image or attachment directly in PostgreSQL ("PortalUploadedImage")
 * served at /api/upload/[id]. Self-hosted on VPS, zero external dependencies or Blob tokens needed.
 */
export async function storePublicImage(opts: {
  bytes: ArrayBuffer | Buffer;
  contentType: string;
  filename?: string;
  origin?: string;
  isPublic?: boolean;
  clientId?: string;
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

  await ensureUploadedImageTable();
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 24);
  const id = `${hash}.${ext}`;
  // Private by default per Batch 1 media security rules. Only explicitly requested template headers are public.
  const isPublic = opts.isPublic ?? false;
  const clientId = opts.clientId ?? null;

  await db.$executeRaw`
    INSERT INTO "PortalUploadedImage" ("id", "mimeType", "data", "isPublic", "clientId")
    VALUES (${id}, ${contentType}, ${buf}, ${isPublic}, ${clientId})
    ON CONFLICT ("id") DO UPDATE SET "mimeType" = EXCLUDED."mimeType", "data" = EXCLUDED."data", "isPublic" = EXCLUDED."isPublic", "clientId" = COALESCE(EXCLUDED."clientId", "PortalUploadedImage"."clientId")
  `;

  return `${await storageOrigin(opts.origin)}/api/upload/${id}`;
}

/**
 * Promotes an uploaded image to public access ONLY when all ownership and lifecycle conditions are met (F-04):
 * 1. Image exists and is strictly owned by the specified tenant (never unassigned null-tenant).
 * 2. An APPROVED template owned by this tenant legitimately references this exact image header.
 * 3. The template is in APPROVED status (Meta-approved). Draft, pending, or rejected templates remain private.
 */
export async function markTemplateImagePublic(url: string, clientId?: string | null): Promise<boolean> {
  if (!url || !clientId || typeof url !== "string" || typeof clientId !== "string") return false;
  const match = url.match(/\/api\/upload\/([a-zA-Z0-9._-]+)/);
  if (!match) return false;
  const imageId = match[1];

  await ensureUploadedImageTable();

  // 1. Strict tenant ownership verification (reject null-tenant or cross-tenant images)
  const imageRows: { id: string; clientId: string | null; isPublic: boolean }[] = await db.$queryRaw`
    SELECT "id", "clientId", "isPublic"
    FROM "PortalUploadedImage"
    WHERE "id" = ${imageId}
    LIMIT 1
  `;
  if (!imageRows.length) return false;
  const image = imageRows[0];

  // Must match the tenant strictly. Assets with clientId IS NULL or another tenant's clientId are rejected
  if (!image.clientId || image.clientId !== clientId) {
    return false;
  }

  // 2. Verified template relationship & approval state
  // Only APPROVED WhatsApp templates authorize public header media exposure
  const template = await db.template.findFirst({
    where: {
      clientId,
      headerType: "IMAGE",
      status: "APPROVED",
      headerMediaUrl: { contains: imageId },
    },
    select: { id: true },
  });

  if (!template) {
    // No approved template references this image for this tenant. Media stays private.
    return false;
  }

  // 3. Authorized & verified: promote to public idempotently
  const res = await db.$executeRaw`
    UPDATE "PortalUploadedImage"
    SET "isPublic" = true
    WHERE "id" = ${imageId} AND "clientId" = ${clientId}
  `;

  return res > 0;
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

export async function getStoredPublicImage(id: string): Promise<{ mimeType: string; data: Buffer; isPublic?: boolean; clientId?: string | null } | null> {
  try {
    await ensureUploadedImageTable();
    const rows = await db.$queryRaw<{ mimeType: string; data: Buffer; isPublic?: boolean | null; clientId?: string | null }[]>`
      SELECT "mimeType", "data", "isPublic", "clientId" FROM "PortalUploadedImage" WHERE "id" = ${id} LIMIT 1
    `;
    if (!rows[0]) return null;
    return {
      mimeType: rows[0].mimeType,
      data: rows[0].data,
      isPublic: Boolean(rows[0].isPublic),
      clientId: rows[0].clientId ?? null,
    };
  } catch {
    return null;
  }
}
