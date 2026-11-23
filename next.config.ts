import type { NextConfig } from "next";

/**
 * VELOX Digital Garage — Next.js configuration.
 *
 * Cache Components is intentionally NOT enabled (see docs/architecture.md, ADR-002):
 * nearly every route reads the Supabase session cookie, so the request-time
 * rendering model is the simpler and more predictable choice for this app.
 */
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      // Image uploads are validated to <= 5 MB in the action itself.
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/**" }]
      : [],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        // The Content-Security-Policy header is set per request in src/proxy.ts (nonce).
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=(), fullscreen=(self)",
          },
          // Ignored by browsers on plain http (local dev); enforced on Vercel's HTTPS.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
      {
        // Authenticated pages and API responses must never be stored by shared caches.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
