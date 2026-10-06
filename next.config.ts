import type { NextConfig } from "next";
import { ALL_LEGACY_REDIRECTS } from "./src/server/legacy-redirects";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone: voice messages to the AI Coach (same origin only).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pino", "twilio"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async redirects() {
    return ALL_LEGACY_REDIRECTS;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
