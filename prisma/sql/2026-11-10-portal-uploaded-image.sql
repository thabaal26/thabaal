-- PortalUploadedImage: built-in local media storage for template headers and uploaded images
-- Replaces Vercel Blob with self-hosted PostgreSQL BYTEA storage served at /api/upload/[id].

CREATE TABLE IF NOT EXISTS "PortalUploadedImage" (
  "id" TEXT PRIMARY KEY,
  "mimeType" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
