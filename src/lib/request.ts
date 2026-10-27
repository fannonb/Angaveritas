import 'server-only'
import crypto from 'node:crypto'

export function clientIp(req: Request) {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim()
}

export function hashIp(ip: string) {
  return crypto.createHash('sha256').update(`${process.env.IP_HASH_SALT ?? 'av'}:${ip}`).digest('hex').slice(0, 32)
}

/**
 * CSRF protection for JSON/upload route handlers (server actions are checked
 * by Next.js itself): the browser's Origin must match the host it called.
 */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin) return req.method === 'GET' || req.method === 'HEAD'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

// Simple per-instance limiter for the lookup endpoints (protects the free
// OpenStreetMap services from abuse). Submissions are limited in the database.
const buckets = new Map<string, { count: number; reset: number }>()
export function rateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    if (buckets.size > 5000) buckets.clear()
    buckets.set(key, { count: 1, reset: now + windowMs })
    return false
  }
  b.count++
  return b.count > limit
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
