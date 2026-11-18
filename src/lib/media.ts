import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import dns from "node:dns/promises";
import { db } from "./db";
import type { MetaComponent } from "./template";
import { APP_ORIGIN, currentAppUrl } from "./app-host";
import { getStoredPublicImage, storePublicImage } from "./uploaded-image";

/** Full https link for a path like /brands/thenan/banner.jpg; links on the portal's old addresses move to the current one. */
export function absoluteUrl(rawPath: string | null | undefined) {
  if (!rawPath) return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return currentAppUrl(trimmed);
  return trimmed.startsWith("/") ? `${APP_ORIGIN}${trimmed}` : null;
}

import http from "node:http";
import https from "node:https";

/**
 * Parses any valid IPv6 address into its canonical 16-byte array.
 * Correctly normalizes '::' compression and embedded IPv4 suffixes (e.g. '::ffff:192.168.1.1').
 */
export function parseIpv6ToBytes(ipStr: string): number[] | null {
  const ip = ipStr.toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (!net.isIPv6(ip)) return null;

  let v4SuffixBytes: number[] | null = null;
  let cleanIp = ip;
  const lastColon = ip.lastIndexOf(":");
  if (lastColon !== -1) {
    const candidateV4 = ip.slice(lastColon + 1);
    if (candidateV4.includes(".")) {
      const parts = candidateV4.split(".").map(Number);
      if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
        v4SuffixBytes = parts;
        cleanIp = ip.charAt(lastColon - 1) === ":" ? ip.slice(0, lastColon + 1) : ip.slice(0, lastColon);
      }
    }
  }

  const parts = cleanIp.split("::");
  if (parts.length > 2) return null;

  const leftWords = parts[0] ? parts[0].split(":").map((w) => parseInt(w, 16)) : [];
  const rightWords = parts.length === 2 && parts[1] ? parts[1].split(":").map((w) => parseInt(w, 16)) : [];

  const neededWords = 8 - (v4SuffixBytes ? 2 : 0);
  let words: number[];

  if (parts.length === 2) {
    const missing = neededWords - (leftWords.length + rightWords.length);
    if (missing < 0) return null;
    words = [...leftWords, ...new Array(missing).fill(0), ...rightWords];
  } else {
    if (leftWords.length !== neededWords) return null;
    words = leftWords;
  }

  const bytes: number[] = [];
  for (const w of words) {
    bytes.push((w >> 8) & 0xff, w & 0xff);
  }
  if (v4SuffixBytes) {
    bytes.push(...v4SuffixBytes);
  }

  return bytes.length === 16 ? bytes : null;
}

/**
 * Validates 4-byte IPv4 addresses against all IANA Special-Purpose Address Registries:
 * RFC 1122, RFC 1918, RFC 6598 (CGNAT), RFC 3927 (Link-local), RFC 5737 (TEST-NET-1, 2, 3),
 * RFC 6890 (IETF Protocol Assignments 192.0.0.0/24), RFC 3068 (6to4 Anycast), RFC 2544 (Benchmark),
 * RFC 5771 (Multicast), RFC 1112 (Class E), RFC 919 (Broadcast).
 */
export function isPrivateOrReservedIpv4Bytes(parts: number[]): boolean {
  if (!parts || parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b, c, d] = parts;

  if (a === 0) return true; // 0.0.0.0/8 Current network (RFC 1122)
  if (a === 10) return true; // 10.0.0.0/8 Private (RFC 1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 Carrier-Grade NAT (RFC 6598)
  if (a === 127) return true; // 127.0.0.0/8 Loopback (RFC 1122)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local & Cloud Metadata 169.254.169.254 (RFC 3927)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 Private (RFC 1918)
  if (a === 192 && b === 0) return true; // Entire 192.0.0.0/24 (IETF Protocol Assignments RFC 6890) & 192.0.2.0/24 (TEST-NET-1 RFC 5737)
  if (a === 192 && b === 31 && c === 196) return true; // 192.31.196.0/24 AS112-v4 (RFC 7535)
  if (a === 192 && b === 52 && c === 193) return true; // 192.52.193.0/24 Automatic Multicast Tunneling (RFC 7450)
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 6to4 Relay Anycast (RFC 3068)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 Private (RFC 1918)
  if (a === 192 && b === 175 && c === 48) return true; // 192.175.48.0/24 Direct Delegation AS112 Service (RFC 7534)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 Network Benchmark (RFC 2544)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2 (RFC 5737)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3 (RFC 5737)
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 Multicast (RFC 5771)
  if (a >= 240) return true; // 240.0.0.0/4 Reserved / Class E & Broadcast (RFC 1112)
  if (a === 255 && b === 255 && c === 255 && d === 255) return true; // 255.255.255.255/32 Broadcast (RFC 919)

  return false;
}

/**
 * Validates if an IP address (IPv4 or IPv6) is private, loopback, link-local, multicast, or reserved.
 * Handles normalized byte representations, embedded IPv4 suffixes, translation prefixes, and expanded hex variants.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const cleanIp = ip.toLowerCase().trim().replace(/^\[|\]$/g, "");
  const family = net.isIP(cleanIp);
  if (family === 0) return false;

  if (family === 4) {
    return isPrivateOrReservedIpv4Bytes(cleanIp.split(".").map(Number));
  }

  if (family === 6) {
    const b = parseIpv6ToBytes(cleanIp);
    if (!b) return true; // Malformed IPv6 treated as non-public
    if (b.every((x) => x === 0)) return true; // :: Unspecified (RFC 4291)
    if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1 Loopback (RFC 4291)

    // IPv4-mapped IPv6 (::ffff:0:0/96 RFC 4291)
    if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
      return isPrivateOrReservedIpv4Bytes(b.slice(12, 16));
    }

    // 64:ff9b::/96 Well-Known IPv4/IPv6 Translation prefix (RFC 6052)
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
      return isPrivateOrReservedIpv4Bytes(b.slice(12, 16));
    }

    // 64:ff9b:1::/48 Local-Use IPv4/IPv6 Translation prefix (RFC 8215)
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b[4] === 0x00 && b[5] === 0x01) {
      return true;
    }

    // 6to4 2002::/16 (RFC 7526: 6to4 officially deprecated and unrouted; blocked entirely)
    if (b[0] === 0x20 && b[1] === 0x02) {
      return true;
    }

    // 100::/64 Discard-only prefix (RFC 6666)
    if (b[0] === 0x01 && b[1] === 0x00 && b.slice(2, 8).every((x) => x === 0)) {
      return true;
    }

    // 100:0:0:1::/64 Dummy IPv6 prefix (added to IANA registry in April 2025)
    if (b[0] === 0x01 && b[1] === 0x00 && b.slice(2, 6).every((x) => x === 0) && b[6] === 0x00 && b[7] === 0x01) {
      return true;
    }

    // 5f00::/16 Segment Routing (SRv6) SIDs (RFC 9750, not globally reachable)
    if (b[0] === 0x5f && b[1] === 0x00) {
      return true;
    }

    // 2001::/23 IANA IETF Protocol Assignments (RFC 2928, includes Teredo 2001::/32 and Benchmark 2001:2::/48)
    if (b[0] === 0x20 && b[1] === 0x01 && (b[2] & 0xfe) === 0x00) {
      return true;
    }

    // 2001:db8::/32 Documentation (RFC 3849)
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) {
      return true;
    }

    // 3fff::/20 Documentation (RFC 9637: 3fff:0000::/20)
    if (b[0] === 0x3f && b[1] === 0xff && (b[2] & 0xf0) === 0x00) {
      return true;
    }

    // fe80::/10 Link-local Unicast (fe80:: to febf:: RFC 4291)
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;
    // fc00::/7 Unique Local Address (fc00:: to fdff:: RFC 4193)
    if ((b[0] & 0xfe) === 0xfc) return true;
    // ff00::/8 Multicast (RFC 4291)
    if (b[0] === 0xff) return true;

    return false;
  }

  return false;
}

/**
 * Checks if a hostname or domain points to private, loopback, or reserved destinations.
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host === "ip6-localhost" ||
    host === "ip6-loopback" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    host.endsWith(".lan") ||
    host.endsWith(".home") ||
    host.endsWith(".corp")
  ) {
    return true;
  }

  if (net.isIP(host)) {
    return isPrivateOrReservedIp(host);
  }

  return false;
}

/**
 * Asynchronously verifies that a host resolves strictly to public, routable IP addresses.
 * Traps dual-response DNS or DNS rebinding to private IPs.
 */
export async function isSafePublicDns(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (isPrivateOrReservedHost(host)) return false;
  try {
    const addresses = await dns.lookup(host, { all: true });
    if (!addresses.length) return false;
    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr.address)) {
        return false;
      }
    }
    return true;
  } catch {
    // Lookup failed or address cannot be resolved: treated as unroutable
    return false;
  }
}

/**
 * Structural validation of image and document payloads.
 * Ensures the payload has valid dimensions and container headers, rejecting truncated or corrupt files.
 */
export function validateImageStructure(buf: Buffer): boolean {
  if (!buf || buf.length < 8) return false;

  // 1. PNG: Validate IHDR chunk and dimensions
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    // IHDR chunk type at bytes 12..15: 'I' 'H' 'D' 'R'
    const isIhdr = buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52;
    if (!isIhdr) return false;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return width > 0 && height > 0;
  }

  // 2. JPEG: Validate SOI and scan for valid SOF marker with non-zero dimensions (Fail closed)
  if (buf.length >= 10 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      // SOF0 (0xc0) to SOF3 (0xc3), SOF5 (0xc5) to SOF7 (0xc7), SOF9 (0xc9) to SOF11 (0xcb), SOF13 (0xcd) to SOF15 (0xcf)
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 8 < buf.length) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          return width > 0 && height > 0;
        }
      }
      if (marker === 0xd9) break; // EOI: reached end of image markers without finding SOF
      // Advance to next marker
      const len = buf.readUInt16BE(offset + 2);
      if (len <= 0) break;
      offset += 2 + len;
    }
    // Fail-closed: Must have found an authentic SOF marker with positive dimensions
    return false;
  }

  // 3. WebP: Validate RIFF container and VP8 chunk header
  if (
    buf.length >= 16 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    const chunkTag = buf.toString("ascii", 12, 16);
    return chunkTag === "VP8 " || chunkTag === "VP8L" || chunkTag === "VP8X";
  }

  // 4. PDF: Validate full 5-byte %PDF- header
  if (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) {
    return true;
  }

  return false;
}

/**
 * Verifies magic header bytes of image buffer to ensure MIME authenticity.
 * Rejects arbitrary or executable payloads claiming to be images.
 */
export function verifyAndDetectImage(
  buf: Buffer,
  fallbackName = "header",
): { bytes: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; filename: string } | null {
  if (!buf || buf.length < 5) return null;

  // JPEG: FF D8 FF
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  // PNG: Full 8-byte signature: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  const isWebp =
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50;
  // PDF: Full 5-byte signature: 25 50 44 46 2D (%PDF-)
  const isPdf =
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d;

  if (!isJpeg && !isPng && !isWebp && !isPdf) {
    return null; // Untrusted MIME / magic bytes mismatch
  }

  // Structural integrity check
  if (!validateImageStructure(buf)) {
    return null;
  }

  const mimeType = isPdf ? "application/pdf" : isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
  const ext = isPdf ? "pdf" : isPng ? "png" : isWebp ? "webp" : "jpg";
  const base = path.basename(fallbackName).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "-") || "attachment";
  return { bytes: buf, mimeType, filename: `${base}.${ext}` };
}

const MAX_STREAM_BYTES = 5 * 1024 * 1024; // 5 MB max per Meta WhatsApp specification
const FETCH_TIMEOUT_MS = 8000; // 8-second strict timeout

/**
 * Executes a network fetch with true socket-level DNS pinning, streaming size clamp,
 * and redirect validation. Eliminates DNS rebinding and out-of-memory vectors.
 */
async function fetchWithDnsPinning(
  targetUrl: string,
  redirectsRemaining = 3,
  deadlineTimestamp = Date.now() + 8000,
): Promise<{ bytes: Buffer; filename: string } | null> {
  const remainingMs = deadlineTimestamp - Date.now();
  if (remainingMs <= 0) {
    console.warn("SSRF prevention: Request exceeded absolute 8000ms deadline");
    return null;
  }

  if (redirectsRemaining < 0) {
    console.warn("SSRF prevention: Exceeded maximum allowed redirects (3)");
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    console.warn(`SSRF prevention: Rejected non-http protocol: ${parsed.protocol}`);
    return null;
  }

  // Reject URLs containing user credentials (e.g. http://user:pass@host)
  if (parsed.username || parsed.password) {
    console.warn("SSRF prevention: Rejected URL containing user credentials");
    return null;
  }

  // Restrict ports strictly to standard HTTP (80) and HTTPS (443)
  const isHttps = parsed.protocol === "https:";
  const defaultPort = isHttps ? 443 : 80;
  const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;
  if (isHttps && port !== 443) {
    console.warn(`SSRF prevention: Rejected non-standard HTTPS port: ${port}`);
    return null;
  }
  if (!isHttps && port !== 80) {
    console.warn(`SSRF prevention: Rejected non-standard HTTP port: ${port}`);
    return null;
  }

  if (isPrivateOrReservedHost(parsed.hostname)) {
    console.warn(`SSRF prevention: blocked outbound media fetch to private/reserved host: ${parsed.hostname}`);
    return null;
  }

  // Pre-flight DNS resolution: check ALL returned addresses with explicit timeout & timer cleanup
  let records: { address: string; family: number }[];
  try {
    const dnsTimeoutMs = Math.min(3000, Math.max(100, remainingMs));
    let dnsTimer: NodeJS.Timeout | null = null;
    const lookupPromise = dns.lookup(parsed.hostname, { all: true });
    const timeoutPromise = new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("DNS lookup timeout")), dnsTimeoutMs);
    });
    try {
      records = await Promise.race([lookupPromise, timeoutPromise]);
    } finally {
      if (dnsTimer) clearTimeout(dnsTimer);
    }
  } catch {
    console.warn(`SSRF prevention: DNS resolution failed or timed out for host: ${parsed.hostname}`);
    return null;
  }

  if (!records || records.length === 0) return null;

  for (const r of records) {
    if (isPrivateOrReservedIp(r.address)) {
      console.warn(`SSRF prevention: Host ${parsed.hostname} resolved to private/reserved IP: ${r.address}`);
      return null;
    }
  }

  // True DNS Pinning: Open socket directly to the verified IP address
  const pinnedIp = records[0].address;
  const client = isHttps ? https : http;

  return new Promise((resolve) => {
    let resolved = false;
    let absoluteTimer: NodeJS.Timeout | null = null;

    const safeResolve = (val: { bytes: Buffer; filename: string } | null) => {
      if (absoluteTimer) clearTimeout(absoluteTimer);
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    const currentRemainingMs = Math.max(100, deadlineTimestamp - Date.now());
    absoluteTimer = setTimeout(() => {
      console.warn("SSRF prevention: Request aborted by absolute 8000ms wall-clock deadline");
      try {
        req.destroy(new Error("Request exceeded absolute 8000ms deadline"));
      } catch {}
      safeResolve(null);
    }, currentRemainingMs);

    const reqOptions: https.RequestOptions = {
      host: pinnedIp, // Direct socket connection to pinned IP (No DNS Rebinding possible)
      port: port,
      path: parsed.pathname + parsed.search,
      method: "GET",
      servername: parsed.hostname, // TLS SNI matches hostname for certificate validation
      headers: {
        Host: parsed.host,
        "User-Agent": "Thabaal-Media-Fetcher/1.0",
        Accept: "image/jpeg,image/png,image/webp,image/*",
      },
      timeout: Math.min(FETCH_TIMEOUT_MS, currentRemainingMs),
    };

    const req = client.request(reqOptions, (res) => {
      // 1. Inspect HTTP redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        req.destroy();
        const location = res.headers.location;
        if (!location) return safeResolve(null);
        try {
          const nextUrl = new URL(location, targetUrl).toString();
          fetchWithDnsPinning(nextUrl, redirectsRemaining - 1, deadlineTimestamp).then(safeResolve);
          return;
        } catch {
          return safeResolve(null);
        }
      }

      if (res.statusCode !== 200) {
        req.destroy();
        return safeResolve(null);
      }

      // 2. Early Content-Length check
      const clHeader = res.headers["content-length"];
      if (clHeader) {
        const cl = parseInt(clHeader, 10);
        if (!isNaN(cl) && cl > MAX_STREAM_BYTES) {
          console.warn(`SSRF prevention: Content-Length exceeds 5 MB limit (${cl} bytes)`);
          req.destroy(new Error("Media exceeds 5 MB limit"));
          return safeResolve(null);
        }
      }

      // 3. Streaming clamp: abort if total bytes received exceed 5 MB
      let bytesRead = 0;
      const chunks: Buffer[] = [];

      res.on("data", (chunk: Buffer) => {
        bytesRead += chunk.length;
        if (bytesRead > MAX_STREAM_BYTES) {
          console.warn(`SSRF prevention: Media stream exceeded 5 MB limit (${bytesRead} bytes). Aborting.`);
          req.destroy(new Error("Media stream exceeded 5 MB limit"));
          safeResolve(null);
        } else {
          chunks.push(chunk);
        }
      });

      res.on("end", () => {
        if (bytesRead > 0 && bytesRead <= MAX_STREAM_BYTES) {
          safeResolve({ bytes: Buffer.concat(chunks), filename: path.basename(parsed.pathname) || "header" });
        } else {
          safeResolve(null);
        }
      });

      res.on("error", () => safeResolve(null));
    });

    req.on("timeout", () => {
      req.destroy(new Error("Media request timed out after 8000ms"));
      safeResolve(null);
    });

    req.on("error", () => safeResolve(null));

    req.end();
  });
}

/**
 * Resolves the raw binary bytes and verified MIME type for a header image URL or path:
 * 1. Reads directly from PostgreSQL ("PortalUploadedImage") for /api/upload/[id] URLs
 * 2. Reads directly from local /public filesystem if the file exists in /public
 * 3. Falls back to HTTP fetch with DNS pinning, streaming size clamp, and magic bytes verification
 */
export async function resolveImageBytes(
  urlOrPath: string,
): Promise<{ bytes: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; filename: string } | null> {
  const clean = urlOrPath.trim();
  if (!clean) return null;

  let pathname = clean;
  try {
    if (/^https?:\/\//i.test(clean)) {
      pathname = new URL(clean).pathname;
    }
  } catch {
    // keep as-is
  }

  // 1. Direct DB lookup for /api/upload/[id]
  const uploadMatch = pathname.match(/^\/api\/upload\/([^/?#]+)$/);
  if (uploadMatch) {
    const stored = await getStoredPublicImage(decodeURIComponent(uploadMatch[1]));
    if (stored?.data) {
      return verifyAndDetectImage(Buffer.from(stored.data), uploadMatch[1]);
    }
  }

  // 2. Direct local /public file lookup (0ms, no external HTTP dependencies)
  if (pathname.startsWith("/") && !pathname.startsWith("/api/")) {
    const rel = pathname.replace(/^\/+/, "");
    const publicRoot = path.resolve(process.cwd(), "public");
    const candidate = path.resolve(publicRoot, rel);
    if (candidate.startsWith(publicRoot)) {
      try {
        const fileBuf = await readFile(candidate);
        if (fileBuf.byteLength > 0) {
          return verifyAndDetectImage(fileBuf, rel);
        }
      } catch {
        // Not a local public file, proceed to HTTP fetch
      }
    }
  }

  // 3. Network fetch with DNS pinning, streaming clamp, and magic byte validation
  const currentTarget = absoluteUrl(clean) ?? clean;
  if (/^https?:\/\//i.test(currentTarget)) {
    const fetched = await fetchWithDnsPinning(currentTarget);
    if (fetched && fetched.bytes) {
      return verifyAndDetectImage(fetched.bytes, fetched.filename);
    }
  }

  return null;
}

/**
 * The image an image-header template sends: its own, else the client's default image, else their banner.
 * Null when there's none, which WhatsApp would reject (error 132012).
 */
export async function headerImageFor(t: { clientId: string; headerType: string; headerMediaUrl: string | null }) {
  if (t.headerType !== "IMAGE") return null;
  if (t.headerMediaUrl?.trim()) return absoluteUrl(t.headerMediaUrl.trim()) ?? t.headerMediaUrl.trim();
  const c = await db.client.findUnique({ where: { id: t.clientId }, select: { defaultImageUrl: true, bannerUrl: true } });
  return absoluteUrl(c?.defaultImageUrl) ?? absoluteUrl(c?.bannerUrl);
}

/**
 * The picture for an image template synced from Meta, so it doesn't fall back to the common image:
 * our own /public image named after the template (thenan_deepavali_vilakku → /thenan-deepavali-vilakku.jpg),
 * else the sample Meta approved it with, copied to our storage because Meta's sample links expire.
 * Null when neither can be found.
 */
export async function syncedHeaderImage(name: string, components: MetaComponent[]) {
  const localRel = `/${name.replace(/_/g, "-")}.jpg`;
  const localResolved = await resolveImageBytes(localRel);
  if (localResolved) return absoluteUrl(localRel);

  const sample = components.find((c) => c.type === "HEADER" && c.format === "IMAGE")?.example?.header_handle?.[0];
  if (!sample?.startsWith("https://")) return null;
  try {
    const r = await fetch(sample, { cache: "no-store" });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return null;
    return await storePublicImage({
      bytes: await r.arrayBuffer(),
      contentType: type,
      filename: `${name}.${type.includes("png") ? "png" : "jpg"}`,
    });
  } catch (e) {
    console.warn(`Could not copy the sample image for ${name}`, e);
    return null;
  }
}

export function isEphemeralCdnUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed.startsWith("/") ? `https://thabaal.local${trimmed}` : trimmed);
    const host = parsed.hostname.toLowerCase();
    
    // Meta / WhatsApp / Facebook ephemeral preview CDN hosts
    if (
      host.endsWith("whatsapp.net") ||
      host.endsWith("fbcdn.net") ||
      host.endsWith("cdninstagram.com") ||
      host.endsWith("fbsbx.com")
    ) {
      return true;
    }

    // URLs with temporary cryptographic signatures/expiration tokens
    if (parsed.searchParams.has("oe") && (parsed.searchParams.has("oh") || parsed.searchParams.has("_nc_sid") || parsed.searchParams.has("_nc_ohc"))) {
      return true;
    }
  } catch {
    // If not a valid URL, check substring indicators
    if (trimmed.includes("scontent.whatsapp.net") || trimmed.includes("fbcdn.net")) {
      return true;
    }
  }

  return false;
}

export const MAX_MEDIA_SIZES = {
  IMAGE: 5 * 1024 * 1024,      // 5 MB max for WhatsApp template images
  VIDEO: 16 * 1024 * 1024,     // 16 MB max for WhatsApp video headers
  DOCUMENT: 100 * 1024 * 1024, // 100 MB max for WhatsApp documents
} as const;

export type MediaValidationResult =
  | { ok: true; bytes: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; filename: string }
  | { ok: false; reason: string; bytes?: undefined; mimeType?: undefined; filename?: undefined };

/**
 * Validates that a media asset exists, is accessible, is not an expiring temporary link,
 * conforms to supported MIME types, and does not exceed size limits.
 */
export async function validateMediaAsset(
  urlOrPath: string | null | undefined,
  expectedType: "IMAGE" | "VIDEO" | "DOCUMENT" = "IMAGE",
  clientId?: string | null,
): Promise<MediaValidationResult> {
  if (!urlOrPath || !urlOrPath.trim()) {
    return { ok: false, reason: "Media asset URL or path is missing." };
  }

  const clean = urlOrPath.trim();

  // 1. Ephemeral CDN detection
  if (isEphemeralCdnUrl(clean)) {
    return {
      ok: false,
      reason: `Temporary Meta CDN preview link detected (${clean.slice(0, 48)}...). These temporary URLs expire and cause Meta Error 131053. Please upload a permanent image.`,
    };
  }

  // 2. Tenant scoping check for database uploaded images (Fail fast before binary decoding)
  const uploadMatch = clean.match(/\/api\/upload\/([^/?#]+)$/);
  if (uploadMatch && clientId) {
    const imgId = decodeURIComponent(uploadMatch[1]);
    const stored = await getStoredPublicImage(imgId);
    if (stored && stored.clientId && stored.clientId !== clientId && !stored.isPublic) {
      return {
        ok: false,
        reason: `Tenant isolation violation: Media asset belongs to client ${stored.clientId}, not ${clientId}.`,
      };
    }
  }

  // 3. Binary resolution
  const resolved = await resolveImageBytes(clean);
  if (!resolved || !resolved.bytes || resolved.bytes.length === 0) {
    return {
      ok: false,
      reason: `Media asset could not be resolved from database, local storage, or network (URL unreachable or 404): ${clean}`,
    };
  }

  // 4. MIME type conformance
  if (expectedType === "IMAGE") {
    if (resolved.mimeType === "application/pdf") {
      return {
        ok: false,
        reason: `MIME type mismatch: template expects an IMAGE header, but resolved a PDF document.`,
      };
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(resolved.mimeType)) {
      return {
        ok: false,
        reason: `Unsupported image format (${resolved.mimeType}). WhatsApp only supports JPEG, PNG, and WebP.`,
      };
    }
  }

  // 5. File size check
  const maxSize = MAX_MEDIA_SIZES[expectedType] || MAX_MEDIA_SIZES.IMAGE;
  if (resolved.bytes.length > maxSize) {
    const sizeMb = (resolved.bytes.length / (1024 * 1024)).toFixed(2);
    const limitMb = (maxSize / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      reason: `Media file is too large (${sizeMb} MB). WhatsApp maximum limit for ${expectedType} is ${limitMb} MB.`,
    };
  }

  return { ok: true, bytes: resolved.bytes, mimeType: resolved.mimeType, filename: resolved.filename };
}

export { signMediaUrlIfNeeded } from "./media-token";
