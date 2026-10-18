import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
