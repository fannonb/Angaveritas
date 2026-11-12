import 'server-only'
import crypto from 'node:crypto'
import { isIP } from 'node:net'
import { sql } from '@/lib/db'

export function requestIp(headers: Pick<Headers, 'get'>) {
  const forwarded = process.env.VERCEL === '1' ? headers.get('x-vercel-forwarded-for') ?? headers.get('x-forwarded-for')
    : process.env.TRUST_PROXY_HEADERS === 'true' ? headers.get('x-forwarded-for') ?? headers.get('x-real-ip') : null
  const ip = forwarded?.split(',')[0].trim() ?? ''
  return isIP(ip) ? ip : 'unknown'
}

export function clientIp(req: Request) {
  return requestIp(req.headers)
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
  try {
    const configured = process.env.VERCEL_ENV === 'production' || process.env.TRUST_PROXY_HEADERS === 'true' ? process.env.APP_URL : undefined
    return new URL(origin).origin === new URL(configured || req.url).origin
  } catch {
    return false
  }
}

// Limiter for the lookup endpoints (protects the free OpenStreetMap services
// from abuse). Counts are shared through the database so they hold across
// server instances; if the database is unreachable, each instance counts on
// its own rather than refusing every visitor.
export async function rateLimited(key: string, limit: number, windowMs: number, cost = 1) {
  try {
    const [row] = await sql<{ count: number }[]>`
      insert into rate_limits (key, count, reset_at) values (${key}, ${cost}, now() + make_interval(secs => ${windowMs / 1000}))
      on conflict (key) do update set
        count = case when rate_limits.reset_at < now() then excluded.count else least(rate_limits.count::bigint + excluded.count, 2147483647)::int end,
        reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
      returning count`
    return row.count > limit
  } catch {
    return rateLimitedLocally(key, limit, windowMs, cost)
  }
}

export async function removeExpiredRateLimits() {
  await sql`delete from rate_limits where reset_at < now() - interval '1 hour'`
}

const buckets = new Map<string, { count: number; reset: number }>()
function rateLimitedLocally(key: string, limit: number, windowMs: number, cost: number) {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    if (buckets.size > 5000) buckets.clear()
    buckets.set(key, { count: cost, reset: now + windowMs })
    return cost > limit
  }
  b.count += cost
  return b.count > limit
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
