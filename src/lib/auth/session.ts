import 'server-only'
import crypto from 'node:crypto'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { staffRoles, type Role } from '@/lib/labels'
import { hashIp, rateLimited, requestIp } from '@/lib/request'
import { verifyStaffTotp } from './mfa'

// Database-backed sessions. The browser holds a random token in an httpOnly
// cookie; the database stores only its SHA-256, so a leaked database cannot be
// used to sign in. Sessions last 30 days and are refreshed on use.

export const SESSION_COOKIE = 'av_session'
/** Readable by the website header to show "Dashboard" instead of "Sign in". Contains no secret. */
export const HINT_COOKIE = 'av_signed_in'
const SESSION_DAYS = 30
const STAFF_SESSION_SECONDS = 12 * 60 * 60
const STAFF_CHALLENGE_SECONDS = 10 * 60

export type SessionUser = {
  id: string
  email: string
  full_name: string
  role: Role
  phone: string | null
  whatsapp: string | null
  based_in: string | null
  country_code: string | null
  region_code: string | null
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
  return hashIp(requestIp(await headers()))
}

export async function createSession(user: { id: string; role: Role }, expectedPasswordHash?: string | null, staffChallenge = false) {
  const staff = isStaff(user)
  if (staff !== staffChallenge) throw new Error('Staff sign-in requires an authenticator.')
  const token = crypto.randomBytes(32).toString('base64url')
  const maxAge = staff ? STAFF_CHALLENGE_SECONDS : SESSION_DAYS * 86400
  const expires = new Date(Date.now() + maxAge * 1000)
  const ipHash = await requestIpHash()
  const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null
  await sql.begin(async tx => {
    // Serialize with disabling an account, so a concurrent sign-in cannot
    // leave a session behind after the administrator has revoked access.
    const [active] = await tx`select id,password_hash,email_verified_at from users
      where id=${user.id} and role=${user.role} and disabled_at is null for update`
    if (!active) throw new Error('Account is unavailable.')
    if (expectedPasswordHash !== undefined && active.password_hash !== expectedPasswordHash) throw new Error('Credentials changed. Please sign in again.')
    if (!staff && !active.email_verified_at) throw new Error('Confirm your email before signing in.')
    await tx`
      insert into sessions (id, user_id, expires_at, ip_hash, user_agent)
      values (${sha256(token)}, ${user.id}, ${expires}, ${ipHash}, ${userAgent})`
    if (!staff) await tx`update users set last_login_at = now() where id = ${user.id}`
  })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, cookieOptions(maxAge))
  if (staff) store.delete(HINT_COOKIE)
  else store.set(HINT_COOKIE, 'client', { ...cookieOptions(maxAge), httpOnly: false })
}

export async function pendingStaffSignIn() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > 100) return null
  const [pending] = await sql<{ id: string; user_id: string }[]>`
    select s.id,s.user_id from sessions s join users u on u.id=s.user_id join staff_mfa m on m.user_id=u.id
    where s.id=${sha256(token)} and s.mfa_verified_at is null and s.expires_at>now()
      and u.role<>'client' and u.disabled_at is null`
  return pending ?? null
}

export async function finishStaffSignIn(code: string) {
  const pending = await pendingStaffSignIn()
  if (!pending || await rateLimited(`staff-mfa:${pending.user_id}`, 8, 300_000)) return false
  const token = crypto.randomBytes(32).toString('base64url')
  const verified = await sql.begin(async tx => {
    const [user] = await tx`select id from users where id=${pending.user_id} and role<>'client' and disabled_at is null for update`
    if (!user) return false
    const [session] = await tx`select id from sessions where id=${pending.id}
      and user_id=${user.id} and mfa_verified_at is null and expires_at>now() for update`
    const [mfa] = await tx`select encrypted_secret,last_step from staff_mfa where user_id=${user.id} for update`
    if (!session || !mfa) return false
    const step = verifyStaffTotp(user.id, mfa.encrypted_secret, code, Number(mfa.last_step))
    if (step === null) return false
    await tx`update staff_mfa set last_step=${step} where user_id=${user.id}`
    await tx`update sessions set id=${sha256(token)},mfa_verified_at=now(),
      expires_at=now()+make_interval(secs=>${STAFF_SESSION_SECONDS}) where id=${pending.id}`
    await tx`update users set last_login_at=now() where id=${user.id}`
    return true
  })
  if (!verified) return false
  const store = await cookies()
  store.set(SESSION_COOKIE, token, cookieOptions(STAFF_SESSION_SECONDS))
  store.set(HINT_COOKIE, 'staff', { ...cookieOptions(STAFF_SESSION_SECONDS), httpOnly: false })
  return true
}

/** The signed-in user for this request, or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > 100) return null
  const id = sha256(token)
  const [row] = await sql<(SessionUser & { expires_at: Date })[]>`
    select u.id, u.email, u.full_name, u.role, u.phone, u.whatsapp, u.based_in, u.country_code, u.region_code, u.timezone, u.email_verified_at, s.expires_at
    from sessions s join users u on u.id = s.user_id
    where s.id = ${id} and s.expires_at > now() and u.disabled_at is null
      and ((u.role='client' and u.email_verified_at is not null)
        or (u.role<>'client' and s.mfa_verified_at is not null and exists (select 1 from staff_mfa where user_id=u.id)))`
  if (!row) return null
  // Slide the expiry forward at most once a day.
  if (row.role === 'client' && row.expires_at.getTime() - Date.now() < (SESSION_DAYS - 1) * 86400_000) {
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
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\u0000-\u001f\u007f\\]/u.test(next)) return fallback
  const base = 'https://app.invalid'
  const url = new URL(next, base)
  if (url.origin !== base || url.pathname.startsWith('//')) return fallback
  return url.pathname + url.search + url.hash
}

// ---------- Brute-force protection ----------

// Failures are counted per email from this connection, so someone guessing at an account locks out
// themselves, not its owner. The higher per-email ceiling still stops guessing spread over many connections.
export async function loginBlocked(email: string, ipHash: string) {
  const [row] = await sql<{ by_email_ip: number; by_email: number; by_ip: number }[]>`
    select
      count(*) filter (where email = ${email} and ip_hash = ${ipHash} and not ok)::int as by_email_ip,
      count(*) filter (where email = ${email} and not ok)::int as by_email,
      count(*) filter (where ip_hash = ${ipHash} and not ok)::int as by_ip
    from login_attempts
    where created_at > now() - interval '15 minutes' and (email = ${email} or ip_hash = ${ipHash})`
  return row.by_email_ip >= 8 || row.by_ip >= 30 || row.by_email >= 50
}

export async function recordLogin(email: string, ipHash: string, ok: boolean) {
  await sql`insert into login_attempts (email, ip_hash, ok) values (${email}, ${ipHash}, ${ok})`
}
