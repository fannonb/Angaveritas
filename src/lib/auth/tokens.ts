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
  await sql`update user_tokens set used_at = now() where user_id = ${userId} and purpose = ${purpose} and used_at is null`
  await sql`
    insert into user_tokens (id, user_id, purpose, expires_at)
    values (${sha256(token)}, ${userId}, ${purpose}, now() + make_interval(hours => ${lifetimeHours[purpose]}))`
  return token
}

/** Checks a token without using it up (e.g. to render the reset form). */
export async function peekToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 100) return null
  const [row] = await sql<{ user_id: string; email: string; full_name: string }[]>`
    select t.user_id, u.email, u.full_name from user_tokens t join users u on u.id = t.user_id
    where t.id = ${sha256(token)} and t.purpose = ${purpose} and t.used_at is null and t.expires_at > now()`
  return row ?? null
}

/** Uses up a token. Returns the user id, or null if invalid, expired or already used. */
export async function consumeToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 100) return null
  const [row] = await sql<{ user_id: string }[]>`
    update user_tokens set used_at = now()
    where id = ${sha256(token)} and purpose = ${purpose} and used_at is null and expires_at > now()
    returning user_id`
  return row?.user_id ?? null
}
