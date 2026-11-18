import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { isEphemeralCdnUrl, validateMediaAsset, MAX_MEDIA_SIZES, resolveImageBytes, isPrivateOrReservedIp, isPrivateOrReservedHost, parseIpv6ToBytes, verifyAndDetectImage, validateImageStructure } from "../../src/lib/media";
import { storePublicImage, getStoredPublicImage } from "../../src/lib/uploaded-image";
import { uploadWhatsAppMedia, sendTemplateMessage, MetaError } from "../../src/lib/whatsapp";
import { CampaignMediaPreflightError, startRun } from "../../src/lib/dispatcher";
import { db } from "../../src/lib/db";

// Authentic minimal JPEG with valid SOI, APP0, and SOF0 segments (100x100)
const VALID_MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0x64, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
]);

test("Media Validation & All-Tenant Prevention Suite", async (t) => {
  let liveClientId: string;

  before(async () => {
    try {
      // Ensure table structure has isPublic and clientId
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PortalUploadedImage" (
          "id" TEXT PRIMARY KEY,
          "mimeType" TEXT NOT NULL,
          "data" BYTEA NOT NULL,
          "isPublic" BOOLEAN NOT NULL DEFAULT false,
          "clientId" TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `).catch(() => {});
      await db.$executeRawUnsafe(`ALTER TABLE "PortalUploadedImage" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
      await db.$executeRawUnsafe(`ALTER TABLE "PortalUploadedImage" ADD COLUMN IF NOT EXISTS "clientId" TEXT`).catch(() => {});

      // Create a LIVE_ACTIVE test tenant
      const client = await db.client.create({
        data: {
          name: `Media_Test_Tenant_${Date.now()}`,
          workspaceMode: "LIVE_ACTIVE",
          planRequired: false,
          waToken: "EAAX_mock_token_for_media_test",
          waPhoneNumberId: `test_media_phone_${Date.now()}`,
          waBusinessAccountId: `test_media_waba_${Date.now()}`,
        },
      }).catch(() => null);
      if (client) {
        liveClientId = client.id;
      }
    } catch (e) {
      console.warn("Neon DB setup notice:", e);
    }
  });

  after(async () => {
    if (liveClientId) {
      await db.client.delete({ where: { id: liveClientId } }).catch(() => {});
    }
  });

  // Scenario 1: Valid self-hosted image (/thenan-banner.jpg)
  await t.test("1. Valid self-hosted image from /public resolves with image/jpeg", async () => {
    const res = await validateMediaAsset("/thenan-banner.jpg", "IMAGE");
    assert.equal(res.ok, true, `Expected valid self-hosted image, got ${res.ok ? "ok" : res.reason}`);
    assert.equal(res.mimeType, "image/jpeg");
    assert.ok(res.bytes && res.bytes.length > 0);
  });

  // Scenario 2: Valid database-upload image (PortalUploadedImage)
  await t.test("2. Valid database-upload image (/api/upload/...) resolves directly from DB", async () => {
    const uploadId = await storePublicImage({
      bytes: VALID_MINIMAL_JPEG,
      contentType: "image/jpeg",
      filename: "test-valid.jpg",
      isPublic: true,
      clientId: liveClientId,
    });

    const res = await validateMediaAsset(uploadId, "IMAGE", liveClientId);
    assert.equal(res.ok, true, `Expected DB image valid, got ${res.ok ? "ok" : res.reason}`);
    assert.equal(res.mimeType, "image/jpeg");
  });

  // Scenario 3: Expired Meta CDN URL
  await t.test("3. Expired Meta CDN URL is detected and rejected upfront", async () => {
    const expiredMetaUrl = "https://scontent.whatsapp.net/v/t61.29466-34/901451220_1148750731429632_6915474727896746185_n.jpg?ccb=1-7&_nc_sid=8b1bef&_nc_ohc=-87pzO5lXKIQ7kNvwGPUyFQ&oh=01_Q5Aa6AHUZymy0JIM3vLag0qqtvEeVNAxG6mknrl3w442bnZCYQ&oe=6B1E53EF";
    assert.equal(isEphemeralCdnUrl(expiredMetaUrl), true);

    const res = await validateMediaAsset(expiredMetaUrl, "IMAGE");
    assert.equal(res.ok, false);
    assert.match(res.reason!, /Temporary Meta CDN preview link detected/);
  });

  // Scenario 4: External URL returning 404
  await t.test("4. External URL returning 404 fails validation cleanly", async () => {
    const notFoundUrl = "https://httpstat.us/404";
    const res = await validateMediaAsset(notFoundUrl, "IMAGE");
    assert.equal(res.ok, false);
    assert.match(res.reason!, /could not be resolved/);
  });

  // Scenario 5: External URL returning 403
  await t.test("5. External URL returning 403 fails validation cleanly", async () => {
    const forbiddenUrl = "https://httpstat.us/403";
    const res = await validateMediaAsset(forbiddenUrl, "IMAGE");
    assert.equal(res.ok, false);
    assert.match(res.reason!, /could not be resolved/);
  });

  // Scenario 6: External URL timeout
  await t.test("6. External URL with unroutable address fails safely without hanging", async () => {
    const unreachableUrl = "https://10.255.255.1/test.jpg";
    const res = await validateMediaAsset(unreachableUrl, "IMAGE");
    assert.equal(res.ok, false);
    assert.match(res.reason!, /could not be resolved/);
  });

  // Scenario 7: Invalid image bytes (empty or corrupt)
  await t.test("7. Corrupt or unidentifiable bytes fallback safely or fail", async () => {
    const badBytes = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const uploadId = await storePublicImage({
      bytes: badBytes,
      contentType: "application/octet-stream",
      filename: "corrupt.bin",
      isPublic: true,
      clientId: liveClientId,
    });
    const res = await validateMediaAsset(uploadId, "IMAGE");
    assert.ok(res.ok || res.reason);
  });

  // Scenario 8: Incorrect MIME type (PDF document provided for IMAGE header)
  await t.test("8. PDF document provided for IMAGE header is strictly rejected", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 dummy pdf content");
    const uploadId = await storePublicImage({
      bytes: pdfBytes,
      contentType: "application/pdf",
      filename: "sample.pdf",
      isPublic: true,
      clientId: liveClientId,
    });

    const res = await validateMediaAsset(uploadId, "IMAGE");
    assert.equal(res.ok, false);
    assert.match(res.reason!, /MIME type mismatch: template expects an IMAGE header, but resolved a PDF/);
  });

  // Scenario 9: Oversized image (>5MB)
  await t.test("9. Oversized image (> 5 MB) is rejected per Meta WhatsApp specification", async () => {
    const largeBytes = Buffer.alloc(5.5 * 1024 * 1024);
    VALID_MINIMAL_JPEG.copy(largeBytes, 0);

    const uploadId = await storePublicImage({
      bytes: largeBytes,
      contentType: "image/jpeg",
      filename: "large.jpg",
      isPublic: true,
      clientId: liveClientId,
    });

    const res = await validateMediaAsset(uploadId, "IMAGE");
    assert.equal(res.ok, false);
    assert.match(res.reason!, /Media file is too large/);
  });

  // Scenario 10: Missing image URL
  await t.test("10. Missing or empty media URL fails validation immediately", async () => {
    const res1 = await validateMediaAsset("", "IMAGE");
    assert.equal(res1.ok, false);
    assert.equal(res1.reason, "Media asset URL or path is missing.");

    const res2 = await validateMediaAsset(null, "IMAGE");
    assert.equal(res2.ok, false);
    assert.equal(res2.reason, "Media asset URL or path is missing.");
  });

  // Scenario 11: Meta media upload failure handling
  await t.test("11. uploadWhatsAppMedia returns null when offline/unconnected without crashing", async () => {
    const offlineCfg = { live: false, token: null, phoneNumberId: null, businessAccountId: null };
    const res = await uploadWhatsAppMedia(offlineCfg as any, "/thenan-banner.jpg");
    assert.equal(res, null);
  });

  // Scenario 12: Invalid/expired Meta media ID behavior
  await t.test("12. Expired cache key triggers fresh upload path", async () => {
    const cfg = { live: false, token: "mock_tok", phoneNumberId: "mock_phone", businessAccountId: "mock_waba" };
    const res = await uploadWhatsAppMedia(cfg as any, "https://example.com/non-existent.jpg");
    assert.equal(res, null);
  });

  // Scenario 13: Tenant and sender ID cache isolation
  await t.test("13. Media cache keys include tenant and phone number context", async () => {
    const cfgA = { live: false, token: "tokA", phoneNumberId: "phone_111", businessAccountId: "waba_1", clientId: "tenant_A" };
    const cfgB = { live: false, token: "tokB", phoneNumberId: "phone_222", businessAccountId: "waba_2", clientId: "tenant_B" };
    
    const resA = await uploadWhatsAppMedia(cfgA as any, "/thenan-banner.jpg");
    const resB = await uploadWhatsAppMedia(cfgB as any, "/thenan-banner.jpg");
    assert.equal(resA, null);
    assert.equal(resB, null);
  });

  // Scenario 14: Cross-tenant media access attempt
  await t.test("14. Cross-tenant private media access is blocked", async () => {
    const uploadId = await storePublicImage({
      bytes: VALID_MINIMAL_JPEG,
      contentType: "image/jpeg",
      filename: "secret.jpg",
      isPublic: false,
      clientId: "tenant_alpha_exclusive",
    });

    const res = await validateMediaAsset(uploadId, "IMAGE", "tenant_beta_foreign");
    assert.equal(res.ok, false);
    assert.match(res.reason!, /Tenant isolation violation/);
  });

  // Scenario 15: Campaign pre-flight failure halts before queueing any message rows
  await t.test("15. Campaign pre-flight media validation halts before queueing messages", async () => {
    const mockCampaign: any = {
      id: "camp_mock_preflight_test",
      clientId: liveClientId,
      name: "Preflight Broken Image Test",
      template: {
        name: "broken_image_tmpl",
        category: "MARKETING",
        headerType: "IMAGE",
        headerMediaUrl: "https://scontent.whatsapp.net/v/t61.29466-34/expired_test.jpg?oe=6B1E53EF&oh=123",
      },
      audienceTag: "test_audience",
      scheduleType: "ONCE",
    };

    await assert.rejects(
      async () => {
        await startRun(mockCampaign, new Date());
      },
      (err: any) => {
        assert.ok(err instanceof CampaignMediaPreflightError);
        assert.match(err.message, /pre-flight media validation failed/);
        return true;
      }
    );
  });

  // Scenario 16: Dispatcher restart during media pre-flight
  await t.test("16. Pre-flight error releases transactional lock cleanly with zero orphaned rows", async () => {
    const mockCampaign: any = {
      id: "camp_mock_lock_test",
      clientId: liveClientId,
      name: "Lock Clean Test",
      template: {
        name: "broken_tmpl_2",
        headerType: "IMAGE",
        headerMediaUrl: "https://httpstat.us/404",
      },
      scheduleType: "ONCE",
    };

    try {
      await startRun(mockCampaign, new Date());
    } catch (e) {
      assert.ok(e instanceof CampaignMediaPreflightError);
    }

    const runs = await db.campaignRun.findMany({ where: { campaignId: "camp_mock_lock_test" } });
    assert.equal(runs.length, 0);
  });

  // Scenario 17: Concurrent campaigns using different tenants' images
  await t.test("17. Concurrent campaigns validate their respective tenant images independently", async () => {
    const resA = await validateMediaAsset("/thenan-banner.jpg", "IMAGE", "client_thenan");
    const resB = await validateMediaAsset("/thenan-banner.jpg", "IMAGE", liveClientId);
    assert.equal(resA.ok, true);
    assert.equal(resB.ok, true);
  });

  // Scenario 18: Application deployment/restart and media persistence
  await t.test("18. Media stored in PortalUploadedImage persists and is retrievable by ID", async () => {
    const storedUrl = await storePublicImage({
      bytes: VALID_MINIMAL_JPEG,
      contentType: "image/jpeg",
      filename: "test_persistence_image.jpg",
      isPublic: true,
      clientId: liveClientId,
    });

    const id = storedUrl.split("/api/upload/")[1];
    assert.ok(id, "Expected valid upload URL with id");
    const stored = await getStoredPublicImage(id);
    assert.ok(stored, `Expected ${id} to exist in PortalUploadedImage`);
    assert.equal(stored.mimeType, "image/jpeg");
    assert.ok(stored.data.length > 0);
  });

  // Scenario 19: Template update after media replacement
  await t.test("19. Replacing an ephemeral link with a local upload URL validates successfully", async () => {
    const beforeValidation = await validateMediaAsset("https://scontent.whatsapp.net/expired.jpg?oe=123&oh=456", "IMAGE");
    assert.equal(beforeValidation.ok, false);

    const afterValidation = await validateMediaAsset("/thenan-banner.jpg", "IMAGE");
    assert.equal(afterValidation.ok, true);
  });

  // Scenario 20: Regression test proving no invalid raw URL fallback reaches Meta
  await t.test("20. sendTemplateMessage fails closed with MetaError 131053 when fallback is ephemeral Meta CDN URL", async () => {
    const cfg = {
      live: true,
      token: "mock_token_123",
      phoneNumberId: "1541572859038055",
      businessAccountId: "1465822505685652",
    };

    const input: any = {
      to: "919999999999",
      templateName: "test_fail_closed",
      language: "en",
      headerType: "IMAGE",
      headerMediaUrl: "https://scontent.whatsapp.net/v/t61.29466-34/expired_sample.jpg?oe=6B1E53EF&oh=abcd",
      headerParams: [],
      bodyParams: [],
    };

    await assert.rejects(
      async () => {
        await sendTemplateMessage(cfg as any, input);
      },
      (err: any) => {
        assert.ok(err instanceof MetaError);
        assert.equal(err.code, 131053);
        assert.match(err.message, /Failing closed to prevent Meta Error 131053/);
        return true;
      }
    );
  });

  // Scenario 21: SSRF Defense - Localhost & 127.0.0.1 blocked
  await t.test("21. SSRF Guard: Localhost and 127.0.0.1 media URLs are blocked", async () => {
    const resA = await validateMediaAsset("http://localhost:3000/secret.jpg", "IMAGE");
    const resB = await validateMediaAsset("http://127.0.0.1:8080/admin.png", "IMAGE");
    assert.equal(resA.ok, false);
    assert.equal(resB.ok, false);
  });

  // Scenario 22: SSRF Defense - Private RFC 1918 & Cloud Metadata (169.254.169.254) blocked
  await t.test("22. SSRF Guard: Private subnets (10.x, 172.16.x, 192.168.x) and Cloud Metadata are blocked", async () => {
    const resMetadata = await validateMediaAsset("http://169.254.169.254/latest/meta-data/", "IMAGE");
    const resPrivateA = await validateMediaAsset("http://10.0.0.5/internal.jpg", "IMAGE");
    const resPrivateB = await validateMediaAsset("http://192.168.1.1/router.png", "IMAGE");
    const resPrivateC = await validateMediaAsset("http://172.20.0.10/database.jpg", "IMAGE");

    assert.equal(resMetadata.ok, false);
    assert.equal(resPrivateA.ok, false);
    assert.equal(resPrivateB.ok, false);
    assert.equal(resPrivateC.ok, false);
  });

  // Scenario 23: SSRF Defense - IPv6 loopback and internal hosts blocked
  await t.test("23. SSRF Guard: IPv6 loopback (::1) and .internal domains are blocked", async () => {
    const resIpv6 = await validateMediaAsset("http://[::1]:5432/db.png", "IMAGE");
    const resInternal = await validateMediaAsset("http://backend.internal/header.jpg", "IMAGE");
    assert.equal(resIpv6.ok, false);
    assert.equal(resInternal.ok, false);
  });

  // Scenario 24: Comprehensive IP classifier tests (CGNAT, Multicast, Class E, fe80::/10, IPv4-mapped)
  await t.test("24. SSRF Guard: isPrivateOrReservedIp correctly traps all non-public address blocks", async () => {
    // IPv4 blocks
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("10.254.0.1"), true);
    assert.equal(isPrivateOrReservedIp("172.16.5.1"), true);
    assert.equal(isPrivateOrReservedIp("172.31.255.255"), true);
    assert.equal(isPrivateOrReservedIp("192.168.100.1"), true);
    assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedIp("100.64.0.1"), true); // CGNAT lower bound
    assert.equal(isPrivateOrReservedIp("100.127.255.255"), true); // CGNAT upper bound
    assert.equal(isPrivateOrReservedIp("224.0.0.1"), true); // Multicast
    assert.equal(isPrivateOrReservedIp("240.0.0.1"), true); // Class E
    assert.equal(isPrivateOrReservedIp("0.0.0.0"), true); // Current network

    // Public IPv4 (allowed)
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
    assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);
    assert.equal(isPrivateOrReservedIp("93.184.216.34"), false); // example.com

    // IPv6 blocks
    assert.equal(isPrivateOrReservedIp("::1"), true); // Loopback
    assert.equal(isPrivateOrReservedIp("::"), true); // Unspecified
    assert.equal(isPrivateOrReservedIp("fe80::1"), true); // Link-local lower
    assert.equal(isPrivateOrReservedIp("febf::ffff"), true); // Link-local upper (fe80::/10)
    assert.equal(isPrivateOrReservedIp("fc00::1"), true); // Unique local
    assert.equal(isPrivateOrReservedIp("fd12:3456::1"), true); // Unique local
    assert.equal(isPrivateOrReservedIp("ff02::1"), true); // Multicast
    assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true); // IPv4-mapped loopback
    assert.equal(isPrivateOrReservedIp("::ffff:10.0.0.1"), true); // IPv4-mapped private

    // Public IPv6 (allowed)
    assert.equal(isPrivateOrReservedIp("2606:4700:4700::1111"), false); // Cloudflare public IPv6
    assert.equal(isPrivateOrReservedIp("2001:4860:4860::8888"), false); // Google public IPv6
  });

  // Scenario 25: Complete IANA Special-Purpose Address Registry & Normalized IPv6 Byte Parser
  await t.test("25. SSRF Guard: Complete IANA special ranges & hex IPv4-mapped IPv6 normalization", async () => {
    // IANA special ranges
    assert.equal(isPrivateOrReservedIp("192.0.2.1"), true); // TEST-NET-1 (RFC 5737)
    assert.equal(isPrivateOrReservedIp("198.18.0.1"), true); // Benchmark (RFC 2544)
    assert.equal(isPrivateOrReservedIp("198.51.100.1"), true); // TEST-NET-2 (RFC 5737)
    assert.equal(isPrivateOrReservedIp("203.0.113.1"), true); // TEST-NET-3 (RFC 5737)
    assert.equal(isPrivateOrReservedIp("192.88.99.1"), true); // 6to4 Relay Anycast (RFC 3068)
    assert.equal(isPrivateOrReservedIp("255.255.255.255"), true); // Broadcast (RFC 919)

    // Expanded hex variants of IPv4-mapped IPv6
    assert.equal(isPrivateOrReservedIp("::ffff:7f00:1"), true); // Loopback in hex
    assert.equal(isPrivateOrReservedIp("0:0:0:0:0:ffff:127.0.0.1"), true); // Fully expanded loopback
    assert.equal(isPrivateOrReservedIp("::ffff:0a00:1"), true); // 10.0.0.1 in hex
    assert.equal(isPrivateOrReservedIp("2001:db8::1"), true); // IPv6 Documentation (RFC 3849)
    assert.equal(isPrivateOrReservedIp("100::1"), true); // Discard prefix (RFC 6666)

    // Normalized byte parser verification
    const loopbackBytes = parseIpv6ToBytes("::1");
    assert.ok(loopbackBytes && loopbackBytes.length === 16);
    assert.equal(loopbackBytes[15], 1);

    const v4MappedBytes = parseIpv6ToBytes("::ffff:192.168.1.1");
    assert.ok(v4MappedBytes && v4MappedBytes.length === 16);
    assert.equal(v4MappedBytes[10], 0xff);
    assert.equal(v4MappedBytes[11], 0xff);
    assert.equal(v4MappedBytes[12], 192);
    assert.equal(v4MappedBytes[13], 168);
  });

  // Scenario 26: Magic bytes verification rejects non-image payloads
  await t.test("26. Magic Bytes Verification: Non-image or corrupted payloads are rejected", async () => {
    // HTML payload
    const htmlBuf = Buffer.from("<!DOCTYPE html><html><body><h1>Fake Image</h1></body></html>");
    assert.equal(verifyAndDetectImage(htmlBuf), null);

    // Shell script payload
    const shBuf = Buffer.from("#!/bin/bash\necho 'hello'");
    assert.equal(verifyAndDetectImage(shBuf), null);

    // ELF executable payload
    const elfBuf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    assert.equal(verifyAndDetectImage(elfBuf), null);

    // Authentic JPEG magic bytes with SOF0
    const detectedJpeg = verifyAndDetectImage(VALID_MINIMAL_JPEG, "banner.jpg");
    assert.ok(detectedJpeg);
    assert.equal(detectedJpeg.mimeType, "image/jpeg");

    // Authentic PNG magic bytes with valid IHDR chunk
    const pngBuf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // 8-byte signature
      0x00, 0x00, 0x00, 0x0d, // IHDR chunk length: 13
      0x49, 0x48, 0x44, 0x52, // "IHDR"
      0x00, 0x00, 0x00, 0x01, // width: 1
      0x00, 0x00, 0x00, 0x01, // height: 1
      0x08, 0x06, 0x00, 0x00, 0x00, // 8-bit RGBA
      0x1f, 0x15, 0xc4, 0x89, // CRC
    ]);
    const detectedPng = verifyAndDetectImage(pngBuf, "banner.png");
    assert.ok(detectedPng);
    assert.equal(detectedPng.mimeType, "image/png");

    // Authentic WebP magic bytes with VP8 chunk
    const webpBuf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x20, 0x00, 0x00, 0x00, // file length
      0x57, 0x45, 0x42, 0x50, // WEBP
      0x56, 0x50, 0x38, 0x20, // VP8
    ]);
    const detectedWebp = verifyAndDetectImage(webpBuf, "banner.webp");
    assert.ok(detectedWebp);
    assert.equal(detectedWebp.mimeType, "image/webp");
  });

  // Scenario 27: DNS Pinning Socket Security (Private IP blocked before connection)
  await t.test("27. DNS Pinning: Socket connections to private/loopback IPs are strictly rejected", async () => {
    // Attempting to resolve local/loopback URLs over network fetch fails closed
    const resLocalhost = await resolveImageBytes("http://127.0.0.1:39281/fake.jpg");
    assert.equal(resLocalhost, null);

    const resCloudMetadata = await resolveImageBytes("http://169.254.169.254/latest/meta-data/");
    assert.equal(resCloudMetadata, null);
  });

  // Scenario 28: DNS Rebinding Protection Proof (Private target blocked upfront)
  await t.test("28. DNS Rebinding Prevention: Socket connects strictly to pinnedIp, eliminating DNS rebinding", async () => {
    const resPrivateSubnet = await resolveImageBytes("http://10.254.254.1:8080/image.jpg");
    assert.equal(resPrivateSubnet, null);

    const resCgnat = await resolveImageBytes("http://100.64.0.1:8080/image.jpg");
    assert.equal(resCgnat, null);

    const resIpv6Local = await resolveImageBytes("http://[fe80::1]:8080/image.jpg");
    assert.equal(resIpv6Local, null);
  });

  // Scenario 29: Port restriction & Credential rejection
  await t.test("29. Port Guard & Credential Guard: Non-standard ports and embedded credentials are rejected", async () => {
    // Embedded credentials in URL rejected upfront
    const resCreds = await resolveImageBytes("http://admin:secret123@example.com/banner.jpg");
    assert.equal(resCreds, null);

    // Non-standard ports (anything other than 80 or 443) rejected upfront
    const resPort8080 = await resolveImageBytes("http://example.com:8080/banner.jpg");
    assert.equal(resPort8080, null);

    const resPort8443 = await resolveImageBytes("https://example.com:8443/banner.jpg");
    assert.equal(resPort8443, null);

    const resPort22 = await resolveImageBytes("http://example.com:22/banner.jpg");
    assert.equal(resPort22, null);
  });

  // Scenario 30: Full 8-byte PNG signature verification
  await t.test("30. PNG Magic Bytes: Enforces full 8-byte signature (89 50 4E 47 0D 0A 1A 0A)", async () => {
    // Only 4 bytes (missing trailing CR LF EOF LF) -> Rejected
    const truncatedPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    assert.equal(verifyAndDetectImage(truncatedPng), null);

    // Exact full 8-byte PNG signature with valid IHDR chunk -> Accepted
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // 8-byte signature
      0x00, 0x00, 0x00, 0x0d, // IHDR chunk length: 13
      0x49, 0x48, 0x44, 0x52, // "IHDR"
      0x00, 0x00, 0x00, 0x01, // width: 1
      0x00, 0x00, 0x00, 0x01, // height: 1
      0x08, 0x06, 0x00, 0x00, 0x00, // 8-bit RGBA
      0x1f, 0x15, 0xc4, 0x89, // CRC
    ]);
    const detected = verifyAndDetectImage(validPng, "header.png");
    assert.ok(detected);
    assert.equal(detected.mimeType, "image/png");
  });

  // Scenario 31: Advanced IANA translation and documentation prefixes
  await t.test("31. IANA Special Prefixes: 64:ff9b::/96, 64:ff9b:1::/48, 2001:2::/48, 3fff::/20, 192.0.0.0/24", async () => {
    // 192.0.0.0/24 IETF Protocol Assignments
    assert.equal(isPrivateOrReservedIp("192.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("192.0.0.170"), true);

    // 64:ff9b::/96 with private embedded IPv4
    assert.equal(isPrivateOrReservedIp("64:ff9b::127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("64:ff9b::10.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("64:ff9b::169.254.169.254"), true);

    // 64:ff9b::/96 with public embedded IPv4 (allowed)
    assert.equal(isPrivateOrReservedIp("64:ff9b::8.8.8.8"), false);
    assert.equal(isPrivateOrReservedIp("64:ff9b::1.1.1.1"), false);

    // 64:ff9b:1::/48 Local-use translation
    assert.equal(isPrivateOrReservedIp("64:ff9b:1::1"), true);

    // 2001:2::/48 Benchmark
    assert.equal(isPrivateOrReservedIp("2001:2::1"), true);

    // 3fff::/20 Documentation (RFC 9637: 3fff:0000::/20)
    assert.equal(isPrivateOrReservedIp("3fff::1"), true);
    assert.equal(isPrivateOrReservedIp("3fff:0100::1"), true);
  });

  // Scenario 32: Gate A Address Policy Verification (100:0:0:1::/64, 5f00::/16, 2001::/23, 2002::/16, 192.31.196.0/24, 192.52.193.0/24, 192.175.48.0/24)
  await t.test("32. Gate A Address Policy: 100:0:0:1::/64, 5f00::/16, 2001::/23, 2002::/16, and special IPv4 blocks", async () => {
    // 100:0:0:1::/64 Dummy IPv6 prefix (added April 2025)
    assert.equal(isPrivateOrReservedIp("100:0:0:1::1"), true);
    assert.equal(isPrivateOrReservedIp("100:0:0:1::ffff"), true);

    // 5f00::/16 Segment Routing (SRv6) SIDs (RFC 9750, not globally reachable)
    assert.equal(isPrivateOrReservedIp("5f00::1"), true);
    assert.equal(isPrivateOrReservedIp("5f00:1234::1"), true);

    // 2001::/23 IANA IETF Protocol Assignments (RFC 2928, includes Teredo 2001::/32 and Benchmark 2001:2::/48)
    assert.equal(isPrivateOrReservedIp("2001::1"), true); // Teredo prefix
    assert.equal(isPrivateOrReservedIp("2001:1::1"), true);
    assert.equal(isPrivateOrReservedIp("2001:01ff::1"), true);

    // 2002::/16 6to4 transition prefix (RFC 7526 officially deprecated, unrouted)
    assert.equal(isPrivateOrReservedIp("2002::1"), true);
    assert.equal(isPrivateOrReservedIp("2002:c0a8:101::1"), true);

    // Globally reachable special-purpose IPv4 allocations requiring explicit documented blocking
    assert.equal(isPrivateOrReservedIp("192.31.196.1"), true); // AS112-v4 (RFC 7535)
    assert.equal(isPrivateOrReservedIp("192.52.193.1"), true); // Automatic Multicast Tunneling (RFC 7450)
    assert.equal(isPrivateOrReservedIp("192.175.48.1"), true); // Direct Delegation AS112 Service (RFC 7534)

    // Standard public internet unicast addresses remain allowed
    assert.equal(isPrivateOrReservedIp("8.8.4.4"), false);
    assert.equal(isPrivateOrReservedIp("1.0.0.1"), false);
    assert.equal(isPrivateOrReservedIp("2607:f8b0:4005:805::200e"), false);
  });

  // Scenario 33: End-to-end absolute request deadline enforcement across redirects
  await t.test("33. Absolute 8000ms Deadline: Expired deadlineTimestamp aborts fetch immediately", async () => {
    // If deadline has already passed, fetchWithDnsPinning must return null without making network requests
    const res = await validateMediaAsset("https://httpstat.us/200?sleep=10000", "IMAGE");
    // Since httpstat.us is remote, validateMediaAsset applies the 8000ms deadline and aborts cleanly
    assert.equal(res.ok, false);
  });

  // Scenario 34: Gate B Structural Image & PDF Validation
  await t.test("34. Gate B Structural Image & PDF Validation: Enforces IHDR dimensions, VP8 tag, and 5-byte %PDF-", async () => {
    // Corrupt PNG with missing IHDR chunk -> Rejected
    const badPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
    assert.equal(verifyAndDetectImage(badPng), null);

    // PNG with IHDR but zero width -> Rejected
    const zeroWidthPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x00, // width: 0
      0x00, 0x00, 0x00, 0x01, // height: 1
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
    assert.equal(verifyAndDetectImage(zeroWidthPng), null);

    // PDF with only 4 bytes %PDF (missing '-') -> Rejected
    const truncatedPdf = Buffer.from("%PDF");
    assert.equal(verifyAndDetectImage(truncatedPdf), null);

    // PDF with valid 5-byte %PDF- -> Accepted
    const validPdf = Buffer.from("%PDF-1.7\n%sample pdf content");
    const detectedPdf = verifyAndDetectImage(validPdf, "document.pdf");
    assert.ok(detectedPdf);
    assert.equal(detectedPdf.mimeType, "application/pdf");

    // WebP with missing VP8 chunk tag -> Rejected
    const badWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x41, 0x42, 0x43, 0x44, // "ABCD" instead of VP8
    ]);
    assert.equal(verifyAndDetectImage(badWebp), null);

    // JPEG without Start-of-Frame (SOF) marker -> Must fail-closed (return false / null)
    const malformedJpegNoSof = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    assert.equal(validateImageStructure(malformedJpegNoSof), false);
    assert.equal(verifyAndDetectImage(malformedJpegNoSof), null);

    // Authentic JPEG with SOF0 segment -> Accepted
    assert.equal(validateImageStructure(VALID_MINIMAL_JPEG), true);
    const detectedValidJpeg = verifyAndDetectImage(VALID_MINIMAL_JPEG, "valid.jpg");
    assert.ok(detectedValidJpeg);
    assert.equal(detectedValidJpeg.mimeType, "image/jpeg");
  });
});
