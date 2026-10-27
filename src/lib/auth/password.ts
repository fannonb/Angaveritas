import 'server-only'
import crypto from 'node:crypto'
import { promisify } from 'node:util'

// Password hashing with scrypt (built into Node, no native dependencies).
// Stored format: scrypt$N$r$p$saltB64$hashB64, so parameters can be raised
// later without breaking existing hashes.

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

export const PASSWORD_MIN = 10

export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (pw.length > 200) return 'Use at most 200 characters.'
  if (/^(.)\1+$/.test(pw)) return 'Choose a less predictable password.'
  return null
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(pw, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$')
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(pw, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  })
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

/** Burns comparable time when the account doesn't exist, so timing doesn't reveal which emails are registered. */
let dummyHash: Promise<string> | null = null
export async function verifyAgainstDummy(pw: string) {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  await verifyPassword(pw, await dummyHash)
}
