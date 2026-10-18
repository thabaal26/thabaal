-- Saved links to images and files on the portal's old addresses now use www.thabaal.in (the same files, served
-- from our database at /api/upload/...). Safe to run again: only rows still holding an old address change.
UPDATE "Client" SET
  "logoUrl" = regexp_replace("logoUrl", '^https?://(campaign-seven-ruddy\.vercel\.app|whatsapp-portal-six\.vercel\.app|thabaal\.vercel\.app)', 'https://www.thabaal.in'),
  "bannerUrl" = regexp_replace("bannerUrl", '^https?://(campaign-seven-ruddy\.vercel\.app|whatsapp-portal-six\.vercel\.app|thabaal\.vercel\.app)', 'https://www.thabaal.in'),
  "defaultImageUrl" = regexp_replace("defaultImageUrl", '^https?://(campaign-seven-ruddy\.vercel\.app|whatsapp-portal-six\.vercel\.app|thabaal\.vercel\.app)', 'https://www.thabaal.in')
WHERE "logoUrl" ~ '^https?://(campaign-seven-ruddy|whatsapp-portal-six|thabaal)\.vercel\.app'
   OR "bannerUrl" ~ '^https?://(campaign-seven-ruddy|whatsapp-portal-six|thabaal)\.vercel\.app'
   OR "defaultImageUrl" ~ '^https?://(campaign-seven-ruddy|whatsapp-portal-six|thabaal)\.vercel\.app';

UPDATE "Template" SET
  "headerMediaUrl" = regexp_replace("headerMediaUrl", '^https?://(campaign-seven-ruddy\.vercel\.app|whatsapp-portal-six\.vercel\.app|thabaal\.vercel\.app)', 'https://www.thabaal.in')
WHERE "headerMediaUrl" ~ '^https?://(campaign-seven-ruddy|whatsapp-portal-six|thabaal)\.vercel\.app';
