import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://js.stripe.com https://unpkg.com https://embed.tawk.to https://*.tawk.to",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://*.tawk.to",
      "font-src 'self' https://fonts.gstatic.com https://*.tawk.to",
      "img-src 'self' data: blob: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://*.tile.openstreetmap.org https://tawk.to https://*.tawk.to",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://api.radar.io https://api.telnyx.com wss://*.tawk.to https://*.tawk.to https://api.resend.com",
      "frame-src 'self' https://js.stripe.com https://tawk.to https://*.tawk.to https://www.youtube.com https://youtube.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  redirects: async () => [
    {
      source: '/sm.xml',
      destination: '/sitemap.xml',
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: '/(.*)',
      headers: securityHeaders,
    },
    {
      source: '/admin/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
      ],
    },
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, must-revalidate' },
      ],
    },
  ],
};

export default nextConfig;
