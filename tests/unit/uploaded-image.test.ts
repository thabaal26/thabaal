// Product photos uploaded to thabaal (lib/uploaded-image.ts): which /api/upload links thabaal can still serve, so the
// Products page shows Meta's own copy instead of a broken image for the rest (lib/catalog.ts photoFor).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { getStoredPublicImage, missingUploadedImages, uploadedImageId } from "../../src/lib/uploaded-image";
import { photoFor } from "../../src/lib/catalog";

describe("uploaded product photos", () => {
  test("1. only links to /api/upload/<id> count, on any of the portal's addresses", () => {
    assert.equal(uploadedImageId("https://www.thabaal.in/api/upload/e1b92ded31b894207251239c.jpg"), "e1b92ded31b894207251239c.jpg");
    assert.equal(uploadedImageId("https://thabaal.vercel.app/api/upload/ab12.png"), "ab12.png");
    assert.equal(uploadedImageId("https://thenanoils.com/wp-content/uploads/2021/02/karupetti.jpg"), null);
    assert.equal(uploadedImageId("https://www.thabaal.in/api/upload/../x.jpg"), null);
    assert.equal(uploadedImageId(null), null);
  });

  test("2. a stored photo is found; one the database doesn't have is reported missing", async () => {
    // Written straight to the table: storing through storePublicImage could reach a real Blob store.
    await getStoredPublicImage("warm-up.jpg"); // makes sure the table exists
    const have = `${Date.now().toString(16).padStart(24, "0")}.jpg`;
    await db.$executeRaw`INSERT INTO "PortalUploadedImage" ("id", "mimeType", "data") VALUES (${have}, 'image/jpeg', ${Buffer.from("x")})`;
    assert.equal(uploadedImageId(`https://www.thabaal.in/api/upload/${have}`), have);
    const missing = await missingUploadedImages([have, "000000000000000000000000.jpg", have]);
    assert.deepEqual([...missing], ["000000000000000000000000.jpg"]);
    assert.equal((await missingUploadedImages([])).size, 0);
    await db.$executeRaw`DELETE FROM "PortalUploadedImage" WHERE "id" = ${have}`;
  });

  test("3. the Products page shows Meta's copy only for a photo thabaal no longer has", () => {
    const meta = [
      { key: "requested", value: "https://scontent.example/meta-copy.jpg" },
      { key: "full", value: "https://scontent.example/meta-full.jpg" },
    ];
    const lost = "https://www.thabaal.in/api/upload/e1b92ded31b894207251239c.jpg";
    const kept = "https://www.thabaal.in/api/upload/2ad1094fcdafaa38ed7293ba.jpg";
    const missing = new Set(["e1b92ded31b894207251239c.jpg"]);
    assert.equal(photoFor({ image_url: lost, image_cdn_urls: meta }, missing), "https://scontent.example/meta-copy.jpg");
    assert.equal(photoFor({ image_url: lost, image_cdn_urls: { data: meta.slice(1) } }, missing), "https://scontent.example/meta-full.jpg");
    assert.equal(photoFor({ image_url: kept, image_cdn_urls: meta }, missing), kept, "a photo thabaal still has stays as it is");
    assert.equal(photoFor({ image_url: lost }, missing), lost, "no copy at Meta: the link as it is");
    assert.equal(photoFor({ image_url: "https://thenanoils.com/a.jpg", image_cdn_urls: meta }, missing), "https://thenanoils.com/a.jpg");
  });
});
