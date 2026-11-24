import type { NextConfig } from "next";

const frameDeny = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
] as const;

const apiSecurity = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "no-referrer",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
] as const;

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Staff UI + auth + public book/manage — deny clickjacking.
      // Do NOT apply a catch-all here: /embed must remain frameable and Next
      // merges headers from every matching source.
      { source: "/app/:path*", headers: [...frameDeny] },
      { source: "/login", headers: [...frameDeny] },
      { source: "/privacy", headers: [...frameDeny] },
      { source: "/book/:path*", headers: [...frameDeny] },
      { source: "/", headers: [...frameDeny] },
      // API JSON — reduce MIME sniffing and referrer leakage of tokens in URLs
      { source: "/api/:path*", headers: [...apiSecurity] },
      {
        // Clinic websites iframe the embed booking UI
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        // Consent tokens live in the path — never leak via Referer
        source: "/book/intake/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
        ],
      },
      {
        // Manage tokens in path/query — never leak via Referer
        source: "/book/manage/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
        ],
      },
      {
        source: "/book/waitlist/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
