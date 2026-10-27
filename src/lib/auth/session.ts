import 'server-only'
import crypto from 'node:crypto'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { staffRoles, type Role } from '@/lib/labels'
import { hashIp } from '@/lib/request'

// Database-backed sessions. The browser holds a random token in an httpOnly
// cookie; the database stores only its SHA-256, so a leaked database cannot be
// used to sign in. Sessions last 30 days and are refreshed on use.

export const SESSION_COOKIE = 'av_session'
/** Readable by the website header to show "Dashboard" instead of "Sign in". Contains no secret. */
export const HINT_COOKIE = 'av_signed_in'
const SESSION_DAYS = 30

export type SessionUser = {
  id: string
  email: string
  full_name: string
  role: Role
  phone: string | null
  based_in: string | null
  timezone: string
  email_verified_at: Date | null
}

export const isStaff = (u: { role: Role }) => staffRoles.includes(u.role)
export const homeFor = (u: { role: Role }) => (isStaff(u) ? '/staff' : '/portal')

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

export async function requestIpHash() {
  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim()
  return hashIp(ip)
}

export async function createSession(user: { id: string; role: Role }) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000)
  await sql`
    insert into sessions (id, user_id, expires_at, ip_hash, user_agent)
    values (${sha256(token)}, ${user.id}, ${expires}, ${await requestIpHash()}, ${(await headers()).get('user-agent')?.slice(0, 300) ?? null})`
  await sql`update users set last_login_at = now() where id = ${user.id}`
  const store = await cookies()
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400))
  store.set(HINT_COOKIE, isStaff(user) ? 'staff' : 'client', { ...cookieOptions(SESSION_DAYS * 86400), httpOnly: false })
}

/** The signed-in user for this request, or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > 100) return null
  const id = sha256(token)
  const [row] = await sql<(SessionUser & { expires_at: Date })[]>`
    select u.id, u.email, u.full_name, u.role, u.phone, u.based_in, u.timezone, u.email_verified_at, s.expires_at
    from sessions s join users u on u.id = s.user_id
    where s.id = ${id} and s.expires_at > now() and u.disabled_at is null`
  if (!row) return null
  // Slide the expiry forward at most once a day.
  if (row.expires_at.getTime() - Date.now() < (SESSION_DAYS - 1) * 86400_000) {
    await sql`update sessions set expires_at = now() + make_interval(days => ${SESSION_DAYS}) where id = ${id}`
  }
  const { expires_at: _, ...user } = row
  return user
})

export async function destroySession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await sql`delete from sessions where id = ${sha256(token)}`
  store.delete(SESSION_COOKIE)
  store.delete(HINT_COOKIE)
}

export async function destroyAllSessions(userId: string, exceptCurrent = false) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (exceptCurrent && token) await sql`delete from sessions where user_id = ${userId} and id <> ${sha256(token)}`
  else await sql`delete from sessions where user_id = ${userId}`
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getUser()
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  return user
}

export async function requireClient(next?: string) {
  const user = await requireUser(next)
  if (isStaff(user)) redirect('/staff')
  return user
}

export async function requireStaff(roles: Role[] = staffRoles, next?: string) {
  const user = await requireUser(next)
  if (!isStaff(user)) redirect('/portal')
  if (!roles.includes(user.role)) redirect('/staff?denied=1')
  return user
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback: string) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}

// ---------- Brute-force protection ----------

export async function loginBlocked(email: string, ipHash: string) {
  const [row] = await sql<{ by_email: number; by_ip: number }[]>`
    select
      count(*) filter (where email = ${email} and not ok)::int as by_email,
      count(*) filter (where ip_hash = ${ipHash} and not ok)::int as by_ip
    from login_attempts
    where created_at > now() - interval '15 minutes' and (email = ${email} or ip_hash = ${ipHash})`
  return row.by_email >= 8 || row.by_ip >= 30
}

export async function recordLogin(email: string, ipHash: string, ok: boolean) {
  await sql`insert into login_attempts (email, ip_hash, ok) values (${email}, ${ipHash}, ${ok})`
}
