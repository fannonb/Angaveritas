'use server'

import { redirect } from 'next/navigation'
import { logEvent, notifyTeam } from '@/lib/activity'
import { registerClient, signInWithPassword } from '@/lib/auth/account'
import { enrollStaffMfa } from '@/lib/auth/mfa'
import { hashPassword, passwordProblem } from '@/lib/auth/password'
import { createSession, destroySession, finishStaffSignIn, homeFor, isStaff, requestIpHash, safeNext } from '@/lib/auth/session'
import { issueToken, peekToken, resetPasswordWithToken } from '@/lib/auth/tokens'
import { findUserByEmail, getUserById } from '@/lib/data/users'
import { sendAuthEmail } from '@/lib/email'
import { rateLimited } from '@/lib/request'
import { emailSchema, loginSchema, registerSchema } from '@/lib/validation'

export type FormState = { error?: string; field?: string; ok?: boolean; message?: string } | null

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get('email'), password: form.get('password') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }
  let result
  try { result = await signInWithPassword(parsed.data.email, parsed.data.password) } catch (error) {
    console.error('[account] sign-in failed', { code: (error as { code?: string }).code })
    return { error: 'We could not sign you in right now. Please try again shortly.' }
  }
  if (!result.ok) return { error: result.error }
  const next = safeNext(String(form.get('next') ?? ''), homeFor(result.user))
  if (result.staffChallenge) redirect(`/staff-security?next=${encodeURIComponent(next)}`)
  redirect(next)
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    fullName: form.get('fullName'),
    email: form.get('email'),
    phone: form.get('phone'),
    whatsapp: form.get('whatsapp') ?? undefined,
    countryCode: String(form.get('countryCode') ?? ''),
    regionCode: String(form.get('regionCode') ?? ''),
    timezone: form.get('timezone') ?? undefined,
    consent: form.get('consent') === 'on',
  })
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return { error: i?.message, field: String(i?.path[0] ?? '') }
  }
  let result
  try { result = await registerClient(parsed.data, String(form.get('next') ?? '')) } catch (error) {
    console.error('[account] registration failed', { code: (error as { code?: string }).code })
    return { error: 'We could not finish creating your account. Please try again shortly. If you already submitted this form, try signing in or resetting your password.' }
  }
  if (!result.ok) return { error: result.error, field: result.field }
  return { ok: true, message: 'Check your email for a link to finish creating your account. If you already have an account, sign in or reset your password.' }
}

export async function logoutAction() {
  await destroySession()
  redirect('/login?signed_out=1')
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(form.get('email'))
  if (!parsed.success) return { error: 'Please enter a valid email address.' }
  const response = { ok: true, message: 'If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).' }
  const ip = await requestIpHash()
  if (await rateLimited(`password-recovery:${ip}`, 10, 3_600_000) || await rateLimited('password-recovery:global', 250, 3_600_000)) return response
  const user = await findUserByEmail(parsed.data)
  // Same answer whether or not the account exists, so the form can't be used to find out who is registered.
  if (user && !user.disabled_at) {
    const token = await issueToken(user.id, 'reset_password', true)
    if (token) await sendAuthEmail({
      to: user.email,
      subject: 'Reset your AngaVeritas password',
      text: 'Use this link to choose a new password. It works once, for one hour.\n\nIf you did not ask for this, you can ignore this email. Your password has not changed.',
      actionPath: `/reset-password?token=${token}`,
    })
  }
  return response
}

/** Reset a forgotten password, or set the first password from a staff invitation. */
export async function setPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get('token') ?? '')
  const requested = form.get('purpose')
  const purpose = requested === 'invite' || requested === 'verify_email' ? requested : 'reset_password'
  const password = String(form.get('password') ?? '')
  if (password !== String(form.get('confirm') ?? '')) return { error: 'The two passwords do not match.' }
  const problem = passwordProblem(password)
  if (problem) return { error: problem }
  const pending = await peekToken(token, purpose)
  if (!pending) return { error: 'This link has expired or was already used. Please request a new one.' }
  if (await rateLimited(`set-password:${pending.user_id}`, 10, 900_000)) return { error: 'Too many attempts. Please wait and try again.' }
  const passwordHash = await hashPassword(password)
  const userId = await resetPasswordWithToken(token, purpose, passwordHash)
  if (!userId) return { error: 'This link has expired or was already used. Please request a new one.' }
  const user = await getUserById(userId)
  if (!user) return { error: 'Account not found.' }
  const event = purpose === 'invite' ? ['account.invite_accepted', 'Invitation accepted']
    : purpose === 'verify_email' ? ['account.verified', 'Email confirmed and password set']
    : ['account.password_reset', 'Password reset']
  await logEvent({ actorId: userId, type: event[0], summary: event[1], ipHash: await requestIpHash() })
  if (purpose === 'verify_email') await notifyTeam({
    title: 'New verified client account',
    body: `${user.full_name} (${user.email}) completed registration.`,
    href: '/staff/clients',
  })
  if (isStaff(user)) redirect('/login?password_set=1')
  await createSession(user, passwordHash)
  redirect(purpose === 'verify_email' ? safeNext(String(form.get('next') ?? ''), '/portal?welcome=1') : homeFor(user))
}

export async function enrollStaffMfaAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get('token') ?? '')
  const password = String(form.get('password') ?? '')
  const code = String(form.get('code') ?? '').trim()
  const pending = await peekToken(token, 'staff_mfa_setup')
  if (!pending || password.length > 200 || !/^\d{6}$/.test(code) ||
      await rateLimited(`staff-mfa-setup:${pending.user_id}`, 8, 300_000) ||
      !(await enrollStaffMfa(token, password, code))) {
    return { error: 'Check your password and authenticator code. If the setup link expired, sign in to request a new one.' }
  }
  await logEvent({ actorId: pending.user_id, type: 'account.mfa_enrolled', summary: 'Staff authenticator enrolled' })
  redirect('/login?mfa_set=1')
}

export async function finishStaffSignInAction(_: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get('code') ?? '').trim()
  if (!(await finishStaffSignIn(code))) return { error: 'The code is invalid, already used, or the sign-in expired. Try a fresh code or start again.' }
  redirect(safeNext(String(form.get('next') ?? ''), '/staff'))
}
