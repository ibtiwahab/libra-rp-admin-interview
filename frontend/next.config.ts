import type { NextConfig } from 'next';

// On hosted builds (Vercel sets VERCEL=1) a missing BACKEND_URL would silently proxy to localhost.
if ((process.env.VERCEL || process.env.CI) && !process.env.BACKEND_URL) {
  throw new Error('BACKEND_URL must be set (e.g. https://your-api.onrender.com) — it is baked into the /api proxy at build time.');
}
const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:5000').replace(/\/+$/, '');
const isDev = process.env.NODE_ENV !== 'production';

/*
 * The browser talks only to this origin. `/api/*` is proxied to the Express API so session
 * cookies are first-party, SameSite=Strict works, and no CORS surface is exposed.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), display-capture=(), fullscreen=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker images use the self-contained standalone server (set by frontend/Dockerfile).
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  compress: false, // keep SSE responses from the API proxy unbuffered; terminate compression at the edge proxy
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Examination and admin pages must never be cached.
      { source: '/exam/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
      { source: '/exam', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
      { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
    ];
  },
};

export default nextConfig;
