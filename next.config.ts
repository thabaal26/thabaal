import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The VPS runs a self-contained build (deploy/vps); Vercel builds as before.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  experimental: {
    // Photo and file uploads go through server actions (default limit 1 MB). Photos are shrunk in the browser first
    // (lib/shrink-image.ts); this leaves room for a PDF up to the 4 MB the upload accepts (Vercel's own cap is 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  async headers() {
    return [
      {
        // Every page: no framing by other sites (clickjacking), no type sniffing, a short referrer,
        // and only the microphone (for calls) among powerful browser features.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // Icon set stylesheets and tile artwork are named by their content (scripts/icons/build.mjs),
        // so a browser can keep them for a year: a new drawing gets a new file name.
        source: "/icons/:kind(sets|art)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // The app icon is drawn once at build time, but Next.js serves it with max-age=0. Pages put its link back in the
        // head on every refresh (Chats refreshes itself), so the browser downloaded the 73 KB picture again each time.
        source: "/icon",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        // Uploaded files are served on this site's own address, so they get the strictest policy: nothing in them
        // may run or load anything. (The route sets this too, but the rule above would overwrite it; the last
        // matching rule wins.)
        source: "/api/upload/:id",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }],
      },
    ];
  },
};

export default nextConfig;
