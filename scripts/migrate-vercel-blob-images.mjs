#!/usr/bin/env node
// Migrates images currently stored on Vercel Blob (public.blob.vercel-storage.com)
// to self-hosted PostgreSQL BYTEA table "PortalUploadedImage" and updates Template.headerMediaUrl.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const APP_ORIGIN = process.env.APP_ORIGIN || "https://www.thabaal.in";

async function main() {
  console.log("=== Vercel Blob -> PostgreSQL Image Migration ===");

  // Ensure table exists
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PortalUploadedImage" (
      "id" TEXT PRIMARY KEY,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const templates = await db.$queryRaw`
    SELECT "id", "name", "headerMediaUrl" 
    FROM "Template" 
    WHERE "headerMediaUrl" LIKE '%vercel-storage%'
  `;

  console.log(`Found ${templates.length} templates with Vercel Blob URLs.`);

  let migrated = 0;
  let errors = 0;

  for (const t of templates) {
    const oldUrl = t.headerMediaUrl;
    console.log(`\nProcessing: ${t.name} (${t.id})`);
    console.log(`  Source: ${oldUrl}`);

    try {
      const res = await fetch(oldUrl, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);

      const isPng = buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      const isWebp = buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57;
      const isPdf = buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;

      const mimeType = isPdf ? "application/pdf" : isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
      const ext = isPdf ? "pdf" : isPng ? "png" : isWebp ? "webp" : "jpg";

      const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 24);
      const id = `${hash}.${ext}`;

      // Insert into PortalUploadedImage
      await db.$executeRaw`
        INSERT INTO "PortalUploadedImage" ("id", "mimeType", "data")
        VALUES (${id}, ${mimeType}, ${buf})
        ON CONFLICT ("id") DO UPDATE SET "mimeType" = EXCLUDED."mimeType", "data" = EXCLUDED."data"
      `;

      const newUrl = `${APP_ORIGIN}/api/upload/${id}`;

      // Update Template
      await db.$executeRaw`
        UPDATE "Template"
        SET "headerMediaUrl" = ${newUrl}
        WHERE "id" = ${t.id}
      `;

      console.log(`  Saved to DB: ${id} (${buf.byteLength} bytes, ${mimeType})`);
      console.log(`  Updated URL: ${newUrl}`);
      migrated++;
    } catch (err) {
      console.error(`  FAILED to migrate ${t.name}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  // Also check Client branding
  const clients = await db.$queryRaw`
    SELECT "id", "name", "defaultImageUrl", "bannerUrl", "logoUrl"
    FROM "Client"
    WHERE "defaultImageUrl" LIKE '%vercel-storage%'
       OR "bannerUrl" LIKE '%vercel-storage%'
       OR "logoUrl" LIKE '%vercel-storage%'
  `;

  for (const c of clients) {
    console.log(`\nChecking client ${c.name} (${c.id})...`);
    for (const field of ["defaultImageUrl", "bannerUrl", "logoUrl"]) {
      const u = c[field];
      if (u && u.includes("vercel-storage")) {
        try {
          const res = await fetch(u);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 24);
            const id = `${hash}.jpg`;
            await db.$executeRaw`
              INSERT INTO "PortalUploadedImage" ("id", "mimeType", "data")
              VALUES (${id}, 'image/jpeg', ${buf})
              ON CONFLICT ("id") DO NOTHING
            `;
            const newUrl = `${APP_ORIGIN}/api/upload/${id}`;
            await db.$executeRawUnsafe(`UPDATE "Client" SET "${field}" = $1 WHERE "id" = $2`, newUrl, c.id);
            console.log(`  Updated ${field}: ${newUrl}`);
            migrated++;
          }
        } catch (e) {
          console.error(`  Client ${field} failed:`, e);
          errors++;
        }
      }
    }
  }

  console.log("\n=================================");
  console.log(`Migration complete: ${migrated} migrated, ${errors} errors.`);
  console.log("=================================");
}

main()
  .catch((e) => {
    console.error("Migration script error:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
