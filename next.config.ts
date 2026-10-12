import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Icon set stylesheets and tile artwork are named by their content (scripts/icons/build.mjs),
        // so a browser can keep them for a year: a new drawing gets a new file name.
        source: "/icons/:kind(sets|art)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
