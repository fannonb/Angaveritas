'use server'

import { redirect } from 'next/navigation'
import { logEvent } from '@/lib/activity'
import { registerClient, sendVerificationEmail, signInWithPassword, verifyEmail } from '@/lib/auth/account'
import { hashPassword, passwordProblem } from '@/lib/auth/password'
import { createSession, destroyAllSessions, destroySession, getUser, homeFor, requestIpHash, safeNext } from '@/lib/auth/session'
import { consumeToken, issueToken, peekToken } from '@/lib/auth/tokens'
import { findUserByEmail, getUserById, markEmailVerified, setPassword } from '@/lib/data/users'
import { appUrl, sendEmail } from '@/lib/email'
import { emailSchema, loginSchema, registerSchema } from '@/lib/validation'

export type FormState = { error?: string; field?: string; ok?: boolean; message?: string } | null

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get('email'), password: form.get('password') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }
  const result = await signInWithPassword(parsed.data.email, parsed.data.password)
  if (!result.ok) return { error: result.error }
  redirect(safeNext(String(form.get('next') ?? ''), homeFor(result.user)))
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    fullName: form.get('fullName'),
    email: form.get('email'),
    phone: form.get('phone'),
    basedIn: form.get('basedIn') ?? undefined,
    timezone: form.get('timezone') ?? undefined,
    password: form.get('password'),
    consent: form.get('consent') === 'on',
  })
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return { error: i?.message, field: String(i?.path[0] ?? '') }
  }
  const result = await registerClient({ ...parsed.data, basedIn: parsed.data.basedIn })
  if (!result.ok) return { error: result.error, field: result.field }
  redirect(safeNext(String(form.get('next') ?? ''), '/portal?welcome=1'))
}

export async function logoutAction() {
  await destroySession()
  redirect('/login?signed_out=1')
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(form.get('email'))
  if (!parsed.success) return { error: 'Please enter a valid email address.' }
  const user = await findUserByEmail(parsed.data)
  // Same answer whether or not the account exists, so the form can't be used to find out who is registered.
  if (user && !user.disabled_at) {
    const token = await issueToken(user.id, 'reset_password')
    await sendEmail({
      to: user.email,
      subject: 'Reset your AngaVeritas password',
      text: [
        `Hello ${user.full_name.split(' ')[0]},`,
        '',
        'Use this link to choose a new password. It works once, for one hour:',
        `${appUrl()}/reset-password?token=${token}`,
        '',
        'If you did not ask for this, you can ignore this email. Your password has not changed.',
      ].join('\n'),
    })
  }
  return { ok: true, message: 'If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).' }
}

/** Reset a forgotten password, or set the first password from a staff invitation. */
export async function setPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get('token') ?? '')
  const purpose = form.get('purpose') === 'invite' ? 'invite' : 'reset_password'
  const password = String(form.get('password') ?? '')
  if (password !== String(form.get('confirm') ?? '')) return { error: 'The two passwords do not match.' }
  const problem = passwordProblem(password)
  if (problem) return { error: problem }
  if (!(await peekToken(token, purpose))) return { error: 'This link has expired or was already used. Please request a new one.' }
  const userId = await consumeToken(token, purpose)
  if (!userId) return { error: 'This link has expired or was already used. Please request a new one.' }
  await setPassword(userId, await hashPassword(password))
  await markEmailVerified(userId) // the link proved they control the address
  await destroyAllSessions(userId)
  const user = await getUserById(userId)
  if (!user) return { error: 'Account not found.' }
  await logEvent({ actorId: userId, type: purpose === 'invite' ? 'account.invite_accepted' : 'account.password_reset', summary: purpose === 'invite' ? 'Invitation accepted' : 'Password reset', ipHash: await requestIpHash() })
  await createSession(user)
  redirect(homeFor(user))
}

export async function verifyEmailAction(form: FormData) {
  const userId = await consumeToken(String(form.get('token') ?? ''), 'verify_email')
  if (!userId) redirect('/verify-email?status=invalid')
  await verifyEmail(userId)
  const user = await getUser()
  redirect(user ? `${homeFor(user)}?verified=1` : '/login?verified=1')
}

export async function resendVerificationAction() {
  const user = await getUser()
  if (!user) redirect('/login')
  if (!user.email_verified_at) await sendVerificationEmail(user.id, user.email, user.full_name)
  redirect(`${homeFor(user)}?verification_sent=1`)
}
