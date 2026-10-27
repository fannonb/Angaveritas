import 'server-only'
import { logEvent, notifyTeam } from '@/lib/activity'
import { appUrl, sendEmail } from '@/lib/email'
import { createClientAccount, findUserByEmail, markEmailVerified } from '@/lib/data/users'
import { hashPassword, passwordProblem, verifyAgainstDummy, verifyPassword } from './password'
import { createSession, loginBlocked, recordLogin, requestIpHash } from './session'
import { issueToken } from './tokens'

// Registration and sign-in, shared by the auth pages and the calculator's
// "create an account to submit" step.

export type AuthResult = { ok: true; user: { id: string; role: import('@/lib/labels').Role } } | { ok: false; error: string; field?: string }

export async function registerClient(input: { fullName: string; email: string; phone: string; basedIn: string | null; timezone?: string; password: string }): Promise<AuthResult> {
  const problem = passwordProblem(input.password)
  if (problem) return { ok: false, error: problem, field: 'password' }
  const existing = await findUserByEmail(input.email)
  if (existing) return { ok: false, error: 'An account with this email already exists. Sign in instead, or reset your password.', field: 'email' }
  const tz = input.timezone && /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/.test(input.timezone) ? input.timezone : 'Africa/Nairobi'
  const id = await createClientAccount({ ...input, passwordHash: await hashPassword(input.password), timezone: tz })
  await createSession({ id, role: 'client' })
  await sendVerificationEmail(id, input.email, input.fullName)
  await logEvent({ actorId: id, type: 'account.registered', summary: `${input.fullName} created an account`, ipHash: await requestIpHash() })
  await notifyTeam({ title: `New client account: ${input.fullName}`, body: `${input.fullName} (${input.email}, ${input.phone}) registered${input.basedIn ? ` from ${input.basedIn}` : ''}.`, href: '/staff/clients' })
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
  await createSession(user)
  return { ok: true, user: { id: user.id, role: user.role } }
}

export async function verifyEmail(userId: string) {
  await markEmailVerified(userId)
  await logEvent({ actorId: userId, type: 'account.verified', summary: 'Email address confirmed' })
}
