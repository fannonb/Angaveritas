import 'server-only'
import { sendAuthEmail } from '@/lib/email'
import { createClientAccount, findUserByEmail } from '@/lib/data/users'
import { verifyAgainstDummy, verifyPassword } from './password'
import { createSession, isStaff, loginBlocked, recordLogin, requestIpHash, safeNext } from './session'
import { issueToken } from './tokens'
import { accountLocationSchema } from '@/lib/validation'
import { rateLimited } from '@/lib/request'
import { staffMfaAvailable, staffMfaEnrolled } from './mfa'

// Registration and sign-in, shared by the auth pages and the calculator's
// "create an account to submit" step.

type AuthError = { ok: false; error: string; field?: string }
export type AuthResult = { ok: true; user: { id: string; role: import('@/lib/labels').Role }; staffChallenge?: true } | AuthError

export async function registerClient(input: { fullName: string; email: string; phone: string; whatsapp?: string | null; countryCode: string; regionCode: string; timezone?: string }, next = '/portal?welcome=1'): Promise<{ ok: true } | AuthError> {
  const ip = await requestIpHash()
  if (await rateLimited(`registration:${ip}`, 8, 3_600_000) || await rateLimited('registration:global', 250, 3_600_000)) {
    return { ok: false, error: 'Too many registration attempts. Please try again later.', field: 'email' }
  }
  const location = accountLocationSchema.safeParse(input)
  if (!location.success) return { ok: false, error: location.error.issues[0]?.message ?? 'Choose your location.', field: String(location.error.issues[0]?.path[0] ?? 'countryCode') }
  const email = input.email.trim().toLowerCase()
  let tz = input.timezone || 'Africa/Nairobi'
  try { new Intl.DateTimeFormat('en', { timeZone: tz }) } catch { tz = 'Africa/Nairobi' }
  const existing = await findUserByEmail(email)
  const id = existing ? null : await createClientAccount({ ...input, email, passwordHash: null, timezone: tz })
  const pending = id ? null : existing ?? await findUserByEmail(email)
  const pendingId = id ?? (pending?.role === 'client' && !pending.disabled_at && !pending.email_verified_at ? pending.id : null)
  if (pendingId) await sendVerificationEmail(pendingId, email, next)
  return { ok: true }
}

async function sendVerificationEmail(userId: string, email: string, next: string) {
  const token = await issueToken(userId, 'verify_email', true)
  if (!token) return
  const params = new URLSearchParams({ token, next: safeNext(next, '/portal?welcome=1') })
  await sendAuthEmail({
    to: email,
    subject: 'Confirm your email for AngaVeritas',
    text: 'Confirm your email and choose a password to finish setting up your AngaVeritas account.\n\nThe link works for 3 days. If you did not request an account, you can ignore this email.',
    actionPath: `/verify-email?${params}`,
  })
}

export async function signInWithPassword(emailRaw: string, password: string, clientOnly = false): Promise<AuthResult> {
  const email = emailRaw.trim().toLowerCase()
  const ip = await requestIpHash()
  if (await rateLimited(`sign-in:${ip}`, 60, 900_000) || await rateLimited('sign-in:global', 1000, 60_000)) {
    return { ok: false, error: 'Too many attempts. Please wait and try again.' }
  }
  if (await loginBlocked(email, ip)) return { ok: false, error: 'Too many attempts. Please wait 15 minutes or reset your password.' }
  const user = await findUserByEmail(email)
  if (!user || (!user.password_hash && user.role === 'client')) {
    await verifyAgainstDummy(password)
    await recordLogin(email, ip, false)
    return { ok: false, error: 'Email or password is incorrect.' }
  }
  const ok = await verifyPassword(password, user.password_hash)
  await recordLogin(email, ip, ok)
  if (!ok) {
    return {
      ok: false,
      error: user.password_hash ? 'Email or password is incorrect.' : 'This account has no password yet. Use the link in your invitation email, or reset your password.',
    }
  }
  if (user.disabled_at) return { ok: false, error: 'This account has been disabled. Please contact AngaVeritas.' }
  if (user.role === 'client' && !user.email_verified_at) return { ok: false, error: 'Confirm your email and set your password before signing in.' }
  if (isStaff(user)) {
    if (clientOnly) return { ok: false, error: 'Staff accounts cannot submit client requests. Sign in with a client account.' }
    if (!staffMfaAvailable()) return { ok: false, error: 'Staff authentication is temporarily unavailable. Please contact your administrator.' }
    if (!(await staffMfaEnrolled(user.id))) {
      const token = await issueToken(user.id, 'staff_mfa_setup', true)
      if (token) await sendAuthEmail({
        to: user.email,
        subject: 'Set up AngaVeritas staff sign-in',
        text: 'Use the link to set up your authenticator app. The link works for one hour. If you did not sign in, ignore this email.',
        actionPath: `/staff-security?token=${token}`,
      })
      return { ok: false, error: 'Check your staff email for the authenticator setup link. If it does not arrive, try signing in again in five minutes.' }
    }
    await createSession(user, user.password_hash, true)
    return { ok: true, user: { id: user.id, role: user.role }, staffChallenge: true }
  }
  await createSession(user, user.password_hash)
  return { ok: true, user: { id: user.id, role: user.role } }
}
