import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.stripe.com https://*.stripe.network https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: https://*.stripe.com https://q.stripe.com",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://api.stripe.com",
    "https://*.stripe.com",
    "https://*.stripe.network",
    "https://api.resend.com",
    "https://immortal-alien-83842.upstash.io",
    "https://*.r2.cloudflarestorage.com",
    "https://pub-0fbe8b8a307445918223e9bf8cfedb8f.r2.dev",
  ].join(" "),
  "media-src 'self' blob: https://pub-0fbe8b8a307445918223e9bf8cfedb8f.r2.dev",
  "frame-src https://js.stripe.com https://*.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: CSP,
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.supabase.in",
      },
      {
        protocol: "https",
        hostname: "bnmtynevbuplqpuqvmna.supabase.co",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;