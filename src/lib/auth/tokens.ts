import 'server-only'
import crypto from 'node:crypto'
import { sql } from '@/lib/db'

// Single-use tokens sent by email: verify an address, reset a password, or
// accept a staff invitation. Only the SHA-256 is stored.

export type TokenPurpose = 'verify_email' | 'reset_password' | 'invite'

const lifetimeHours: Record<TokenPurpose, number> = { verify_email: 72, reset_password: 1, invite: 168 }
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export async function issueToken(userId: string, purpose: TokenPurpose) {
  const token = crypto.randomBytes(32).toString('base64url')
  // One live token per purpose: issuing a new one cancels the old.
  await sql.begin(async tx => {
    const [user] = await tx`select id from users where id=${userId} and disabled_at is null for update`
    if (!user) throw new Error('Account is unavailable.')
    await tx`update user_tokens set used_at = now() where user_id = ${userId} and purpose = ${purpose} and used_at is null`
    await tx`
      insert into user_tokens (id, user_id, purpose, expires_at)
      values (${sha256(token)}, ${userId}, ${purpose}, now() + make_interval(hours => ${lifetimeHours[purpose]}))`
  })
  return token
}

/**
 * True when another emailed link would be one too many: one was sent in the last 5 minutes, or 5 in a day.
 * Stops the reset and verification forms being used to flood an inbox, and keeps the last link working.
 */
export async function tokenRecentlyIssued(userId: string, purpose: TokenPurpose) {
  const [row] = await sql<{ recent: number; today: number }[]>`
    select count(*) filter (where created_at > now() - interval '5 minutes')::int as recent, count(*)::int as today
    from user_tokens where user_id = ${userId} and purpose = ${purpose} and created_at > now() - interval '1 day'`
  return row.recent > 0 || row.today >= 5
}

/** Checks a token without using it up (e.g. to render the reset form). */
export async function peekToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 100) return null
  const [row] = await sql<{ user_id: string; email: string; full_name: string }[]>`
    select t.user_id, u.email, u.full_name from user_tokens t join users u on u.id = t.user_id
    where t.id = ${sha256(token)} and t.purpose = ${purpose} and t.used_at is null and t.expires_at > now() and u.disabled_at is null`
  return row ?? null
}

/** Uses up a token. Returns the user id, or null if invalid, expired or already used. */
export async function consumeToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 100) return null
  const [row] = await sql<{ user_id: string }[]>`
    update user_tokens set used_at = now()
    where id = ${sha256(token)} and purpose = ${purpose} and used_at is null and expires_at > now()
      and exists (select 1 from users where users.id=user_tokens.user_id and disabled_at is null)
    returning user_id`
  return row?.user_id ?? null
}

/** Consume recovery links and replace credentials as one transaction. */
export async function resetPasswordWithToken(token: string, purpose: 'invite' | 'reset_password', passwordHash: string) {
  if (!token || token.length > 100) return null
  return sql.begin(async tx => {
    const [user] = await tx`
      select u.id from users u join user_tokens t on t.user_id=u.id
      where t.id=${sha256(token)} and t.purpose=${purpose} and t.used_at is null
        and t.expires_at>now() and u.disabled_at is null for update of u`
    if (!user) return null
    const [claimed] = await tx`update user_tokens set used_at=now()
      where id=${sha256(token)} and purpose=${purpose} and used_at is null and expires_at>now() returning user_id`
    if (!claimed) return null
    await tx`update users set password_hash=${passwordHash},email_verified_at=coalesce(email_verified_at,now()) where id=${user.id}`
    await tx`delete from sessions where user_id=${user.id}`
    await tx`update user_tokens set used_at=now() where user_id=${user.id} and used_at is null`
    return user.id as string
  })
}
