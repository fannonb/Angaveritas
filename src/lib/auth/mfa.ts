import 'server-only'
import crypto from 'node:crypto'
import { sql } from '@/lib/db'
import { findUserByEmail } from '@/lib/data/users'
import { verifyPassword } from './password'
import { peekToken } from './tokens'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const stepMs = 30_000

function mfaKey() {
  const raw = process.env.STAFF_MFA_KEY ?? ''
  return /^[A-Za-z0-9_-]{43}$/.test(raw) ? Buffer.from(raw, 'base64url') : null
}

export const staffMfaAvailable = () => mfaKey() !== null

function base32(secret: Buffer) {
  let bits = 0
  let value = 0
  let encoded = ''
  for (const byte of secret) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      encoded += alphabet[(value >>> bits) & 31]
    }
  }
  if (bits) encoded += alphabet[(value << (5 - bits)) & 31]
  return encoded
}

export function matchingTotpStep(secret: Buffer, code: string, lastStep: number, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(now / stepMs)
  const actual = Buffer.from(code)
  for (const step of [current, current - 1, current + 1]) {
    if (step < 0 || step <= lastStep) continue
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(step))
    const mac = crypto.createHmac('sha1', secret).update(counter).digest()
    const offset = mac[mac.length - 1] & 15
    const expected = String((mac.readUInt32BE(offset) & 0x7fff_ffff) % 1_000_000).padStart(6, '0')
    if (crypto.timingSafeEqual(actual, Buffer.from(expected))) return step
  }
  return null
}

function setupSecret(key: Buffer, token: string) {
  return crypto.createHmac('sha256', key).update('staff-mfa-setup:').update(token).digest().subarray(0, 20)
}

function encryptSecret(key: Buffer, userId: string, secret: Buffer) {
  const nonce = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(userId))
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

export function verifyStaffTotp(userId: string, encrypted: string, code: string, lastStep: number) {
  const key = mfaKey()
  if (!key) return null
  try {
    const data = Buffer.from(encrypted, 'base64url')
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
    cipher.setAAD(Buffer.from(userId))
    cipher.setAuthTag(data.subarray(12, 28))
    return matchingTotpStep(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]), code, lastStep)
  } catch {
    return null
  }
}

export async function staffMfaEnrolled(userId: string) {
  return (await sql`select 1 from staff_mfa where user_id=${userId}`).length > 0
}

export async function staffMfaSetup(token: string) {
  const key = mfaKey()
  const user = key ? await peekToken(token, 'staff_mfa_setup') : null
  if (!key || !user || await staffMfaEnrolled(user.user_id)) return null
  return { email: user.email, secret: base32(setupSecret(key, token)) }
}

export async function enrollStaffMfa(token: string, password: string, code: string) {
  const key = mfaKey()
  const pending = key ? await peekToken(token, 'staff_mfa_setup') : null
  if (!key || !pending) return false
  const user = await findUserByEmail(pending.email)
  if (!user || user.role === 'client' || !user.password_hash || !(await verifyPassword(password, user.password_hash))) return false
  const secret = setupSecret(key, token)
  const step = matchingTotpStep(secret, code, -1)
  if (step === null) return false
  const tokenId = crypto.createHash('sha256').update(token).digest('hex')
  return sql.begin(async tx => {
    const [active] = await tx`select id from users where id=${user.id} and role<>'client'
      and password_hash=${user.password_hash} and disabled_at is null for update`
    if (!active) return false
    const [claimed] = await tx`update user_tokens set used_at=now() where id=${tokenId}
      and user_id=${user.id} and purpose='staff_mfa_setup' and used_at is null and expires_at>now() returning id`
    if (!claimed) return false
    const [enrolled] = await tx`insert into staff_mfa (user_id,encrypted_secret,last_step)
      values (${user.id},${encryptSecret(key, user.id, secret)},${step}) on conflict do nothing returning user_id`
    return Boolean(enrolled)
  })
}
