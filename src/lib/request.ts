import 'server-only'
import crypto from 'node:crypto'
import { sql } from '@/lib/db'

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

// Limiter for the lookup endpoints (protects the free OpenStreetMap services
// from abuse). Counts are shared through the database so they hold across
// server instances; if the database is unreachable, each instance counts on
// its own rather than refusing every visitor.
export async function rateLimited(key: string, limit: number, windowMs: number) {
  try {
    const [row] = await sql<{ count: number }[]>`
      insert into rate_limits (key, count, reset_at) values (${key}, 1, now() + make_interval(secs => ${windowMs / 1000}))
      on conflict (key) do update set
        count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
        reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
      returning count`
    return row.count > limit
  } catch {
    return rateLimitedLocally(key, limit, windowMs)
  }
}

export async function removeExpiredRateLimits() {
  await sql`delete from rate_limits where reset_at < now() - interval '1 hour'`
}

const buckets = new Map<string, { count: number; reset: number }>()
function rateLimitedLocally(key: string, limit: number, windowMs: number) {
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
