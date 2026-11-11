'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'
import { preserveForm, useFormDraft } from '@/components/app/useFormDraft'
import PhoneNumberField from '@/components/app/PhoneNumberField'
import LocationFields from '@/components/app/LocationFields'
import { forgotPasswordAction, loginAction, registerAction, setPasswordAction, type FormState } from './actions'

function Submit({ children, pendingText, pending }: { children: React.ReactNode; pendingText: string; pending: boolean }) {
  return (
    <button className="btn btn-primary w-full" type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  )
}

function ErrorBox({ state }: { state: FormState }) {
  if (!state?.error) return null
  return <p role="alert" className="alert alert-bad">{state.error}</p>
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, null)
  const field = useFormDraft({ email: '', password: '' })
  return (
    <form action={action} onSubmit={preserveForm(action)} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="label">
        Email
        <input className="input" name="email" {...field('email')} type="email" autoComplete="email" required maxLength={160} autoFocus />
      </label>
      <label className="label">
        <span className="flex justify-between">
          Password
          <Link href="/forgot-password" className="text-sm font-normal">Forgot password?</Link>
        </span>
        <input className="input" name="password" {...field('password')} type="password" autoComplete="current-password" required maxLength={200} />
      </label>
      <ErrorBox state={state} />
      <Submit pending={pending} pendingText="Signing in…">Sign in</Submit>
    </form>
  )
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, null)
  const field = useFormDraft({ fullName: '', email: '', password: '' })
  const [consent, setConsent] = useState(false)
  const [tz, setTz] = useState('')
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''), [])
  return (
    <form action={action} onSubmit={preserveForm(action)} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <input type="hidden" name="timezone" value={tz} />
      <label className="label">
        Full name
        <input className="input" name="fullName" {...field('fullName')} autoComplete="name" required maxLength={120} />
      </label>
      <label className="label">
        Email
        <input className="input" name="email" {...field('email')} type="email" autoComplete="email" required maxLength={160} />
      </label>
      <PhoneNumberField name="phone" label="Phone number" required />
      <PhoneNumberField name="whatsapp" label="WhatsApp number" required />
      <LocationFields />
      <label className="label">
        Password
        <input className="input" name="password" {...field('password')} type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
        <span className="hint block">At least 10 characters.</span>
      </label>
      <label className="check">
        <input type="checkbox" name="consent" checked={consent} onChange={event => setConsent(event.currentTarget.checked)} required />
        <span>
          I agree to the <Link href="/terms" target="_blank">Terms</Link> and to AngaVeritas processing my details as described in the{' '}
          <Link href="/privacy" target="_blank">Privacy Policy</Link>.
        </span>
      </label>
      <ErrorBox state={state} />
      <Submit pending={pending} pendingText="Creating your account…">Create account</Submit>
    </form>
  )
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, null)
  const field = useFormDraft({ email: '' })
  if (state?.ok) return <p role="status" className="alert alert-ok">{state.message}</p>
  return (
    <form action={action} onSubmit={preserveForm(action)} className="space-y-4">
      <label className="label">
        Email
        <input className="input" name="email" {...field('email')} type="email" autoComplete="email" required maxLength={160} autoFocus />
      </label>
      <ErrorBox state={state} />
      <Submit pending={pending} pendingText="Sending…">Send reset link</Submit>
    </form>
  )
}

export function SetPasswordForm({ token, purpose }: { token: string; purpose: 'invite' | 'reset_password' }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setPasswordAction, null)
  const field = useFormDraft({ password: '', confirm: '' })
  return (
    <form action={action} onSubmit={preserveForm(action)} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="purpose" value={purpose} />
      <label className="label">
        New password
        <input className="input" name="password" {...field('password')} type="password" autoComplete="new-password" required minLength={10} maxLength={200} autoFocus />
        <span className="hint block">At least 10 characters.</span>
      </label>
      <label className="label">
        Repeat the password
        <input className="input" name="confirm" {...field('confirm')} type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
      </label>
      <ErrorBox state={state} />
      <Submit pending={pending} pendingText="Saving…">{purpose === 'invite' ? 'Set password and continue' : 'Save new password'}</Submit>
    </form>
  )
}
