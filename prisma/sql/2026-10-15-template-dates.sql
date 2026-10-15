-- Re-align updatedAt with createdAt for templates that were never modified by a user,
-- resetting bulk sync artifacts where updatedAt was set to sync time instead of creation time.
UPDATE "Template"
SET "updatedAt" = "createdAt"
WHERE "createdAt" < '2026-10-15T00:00:00.000Z'
  AND "updatedAt" > "createdAt";
