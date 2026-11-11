// Where the browser may load from. Stored files are served through short-lived signed links on the storage
// host (R2 or Supabase), so it is allowed for images, video and the direct upload. Next.js still needs inline
// scripts to start the page, and eval in development only.
const storageOrigins = ['https://*.r2.cloudflarestorage.com']
try { if (process.env.SUPABASE_URL) storageOrigins.push(new URL(process.env.SUPABASE_URL).origin) } catch {}
// Map tiles for the site picker: OpenStreetMap, or the NEXT_PUBLIC_MAP_TILE_URL provider. Its template has {z}/{x}/{y}
// (and maybe {s}), which new URL() rejects, so the origin is cut out with a pattern; {s} becomes a subdomain wildcard.
const tileOrigins = ['https://tile.openstreetmap.org']
const tileOrigin = process.env.NEXT_PUBLIC_MAP_TILE_URL?.replace(/\{s\}/g, '*').match(/^https?:\/\/[a-z0-9.*-]+(?::\d+)?(?=[/?#]|$)/i)?.[0]
if (tileOrigin) tileOrigins.push(tileOrigin)
const dev = process.env.NODE_ENV !== 'production'
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storageOrigins.join(' ')} ${tileOrigins.join(' ')}`,
  `media-src 'self' blob: ${storageOrigins.join(' ')}`,
  "font-src 'self' data:",
  `connect-src 'self' ${storageOrigins.join(' ')}${dev ? ' ws: wss:' : ''}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep isolated browser tests from overwriting a running developer build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  serverExternalPackages: ['postgres'],
  async headers() {
    return [
      // Pages only: file and invoice PDFs under /api open in the browser's own viewer.
      { source: '/((?!api/).*)', headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }] },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}
export default nextConfig
