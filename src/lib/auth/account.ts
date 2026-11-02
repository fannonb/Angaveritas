import 'server-only'
import { logEvent, notifyTeam } from '@/lib/activity'
import { appUrl, sendEmail } from '@/lib/email'
import { createClientAccount, findUserByEmail, markEmailVerified } from '@/lib/data/users'
import { hashPassword, passwordProblem, verifyAgainstDummy, verifyPassword } from './password'
import { createSession, loginBlocked, recordLogin, requestIpHash } from './session'
import { issueToken } from './tokens'
import { formatLocation } from '@/lib/location'
import { accountLocationSchema } from '@/lib/validation'

// Registration and sign-in, shared by the auth pages and the calculator's
// "create an account to submit" step.

export type AuthResult = { ok: true; user: { id: string; role: import('@/lib/labels').Role } } | { ok: false; error: string; field?: string }

export async function registerClient(input: { fullName: string; email: string; phone: string; whatsapp?: string | null; countryCode: string; regionCode: string; timezone?: string; password: string }): Promise<AuthResult> {
  const problem = passwordProblem(input.password)
  if (problem) return { ok: false, error: problem, field: 'password' }
  const location = accountLocationSchema.safeParse(input)
  if (!location.success) return { ok: false, error: location.error.issues[0]?.message ?? 'Choose your location.', field: String(location.error.issues[0]?.path[0] ?? 'countryCode') }
  const basedIn = formatLocation(input.countryCode, input.regionCode)
  // "Already registered" tells the visitor an email is in use. That is kept for real people, but it counts
  // as a failed attempt from this connection, so the form cannot be used to check addresses in bulk.
  const email = input.email.trim().toLowerCase()
  const ip = await requestIpHash()
  if (await loginBlocked(email, ip)) return { ok: false, error: 'Too many attempts. Please wait 15 minutes and try again.', field: 'email' }
  const existing = await findUserByEmail(email)
  if (existing) {
    await recordLogin(email, ip, false)
    return { ok: false, error: 'An account with this email already exists. Sign in instead, or reset your password.', field: 'email' }
  }
  let tz = input.timezone || 'Africa/Nairobi'
  try { new Intl.DateTimeFormat('en', { timeZone: tz }) } catch { tz = 'Africa/Nairobi' }
  const id = await createClientAccount({ ...input, passwordHash: await hashPassword(input.password), timezone: tz })
  if (!id) {
    await recordLogin(email, ip, false)
    return { ok: false, error: 'An account with this email already exists. Sign in instead, or reset your password.', field: 'email' }
  }
  await createSession({ id, role: 'client' })
  await sendVerificationEmail(id, input.email, input.fullName)
  await logEvent({ actorId: id, type: 'account.registered', summary: `${input.fullName} created an account`, ipHash: await requestIpHash() })
  await notifyTeam({ title: `New client account: ${input.fullName}`, body: `${input.fullName} (${input.email}) registered from ${basedIn}. Phone: ${input.phone}.${input.whatsapp ? ` WhatsApp: ${input.whatsapp}.` : ''}`, href: '/staff/clients' })
  return { ok: true, user: { id, role: 'client' } }
}

export async function sendVerificationEmail(userId: string, email: string, name: string) {
  const token = await issueToken(userId, 'verify_email')
  await sendEmail({
    to: email,
    subject: 'Confirm your email for AngaVeritas',
    text: [
      `Hello ${name.split(' ')[0]},`,
      '',
      'Please confirm your email address so we can send you proposals, inspection updates and reports:',
      `${appUrl()}/verify-email?token=${token}`,
      '',
      'The link works for 3 days. If you did not create an AngaVeritas account, you can ignore this email.',
    ].join('\n'),
  })
}

export async function signInWithPassword(emailRaw: string, password: string): Promise<AuthResult> {
  const email = emailRaw.trim().toLowerCase()
  const ip = await requestIpHash()
  if (await loginBlocked(email, ip)) return { ok: false, error: 'Too many attempts. Please wait 15 minutes or reset your password.' }
  const user = await findUserByEmail(email)
  if (!user) {
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
  await createSession(user, user.password_hash)
  return { ok: true, user: { id: user.id, role: user.role } }
}

export async function verifyEmail(userId: string) {
  await markEmailVerified(userId)
  await logEvent({ actorId: userId, type: 'account.verified', summary: 'Email address confirmed' })
}
