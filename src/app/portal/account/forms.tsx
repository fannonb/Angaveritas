'use client'

import { useActionState } from 'react'
import { preserveForm, useFormDraft } from '@/components/app/useFormDraft'
import PhoneNumberField from '@/components/app/PhoneNumberField'
import LocationFields from '@/components/app/LocationFields'
import { changePasswordAction, updateProfileAction, type ActionState } from '../actions'

function Submit({ children, pending }: { children: React.ReactNode; pending: boolean }) {
  return <button className="btn btn-primary btn-small" type="submit" disabled={pending}>{pending ? 'Saving…' : children}</button>
}

function Result({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="alert alert-bad">{state.error}</p>
  if (state?.ok) return <p role="status" className="alert alert-ok">{state.message}</p>
  return null
}

const zones = ['Africa/Nairobi', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'Asia/Dubai', 'Asia/Riyadh', 'Australia/Sydney', 'Africa/Johannesburg', 'Africa/Lagos', 'Asia/Kolkata', 'Asia/Shanghai']

export function ProfileForm({ v }: { v: { fullName: string; phone: string; whatsapp: string; countryCode: string; regionCode: string; timezone: string; email: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProfileAction, null)
  const field = useFormDraft({ fullName: v.fullName, timezone: v.timezone })
  const options = zones.includes(v.timezone) ? zones : [v.timezone, ...zones]
  return (
    <form action={action} onSubmit={preserveForm(action)} className="space-y-4">
      <label className="label">Full name<input className="input" name="fullName" {...field('fullName')} required maxLength={120} /></label>
      <label className="label">
        Email
        <input className="input bg-paper" value={v.email} disabled />
        <span className="hint block">To change your email, contact us.</span>
      </label>
      <PhoneNumberField name="phone" label="Phone number" required initialValue={v.phone} />
      <PhoneNumberField name="whatsapp" label="WhatsApp number" initialValue={v.whatsapp} />
      <LocationFields initialCountry={v.countryCode} initialRegion={v.regionCode} />
      <label className="label">
        Time zone
        <select className="input" name="timezone" {...field('timezone')}>
          {options.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
        </select>
        <span className="hint block">Dates and times in your dashboard are shown in this time zone.</span>
      </label>
      <Result state={state} />
      <Submit pending={pending}>Save changes</Submit>
    </form>
  )
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(changePasswordAction, null)
  const field = useFormDraft({ current: '', password: '', confirm: '' })
  return (
    <form action={action} onSubmit={preserveForm(action)} className="space-y-4">
      <label className="label">Current password<input className="input" name="current" {...field('current')} type="password" autoComplete="current-password" required maxLength={200} /></label>
      <label className="label">New password<input className="input" name="password" {...field('password')} type="password" autoComplete="new-password" required minLength={10} maxLength={200} /></label>
      <label className="label">Repeat new password<input className="input" name="confirm" {...field('confirm')} type="password" autoComplete="new-password" required minLength={10} maxLength={200} /></label>
      <Result state={state} />
      <Submit pending={pending}>Change password</Submit>
    </form>
  )
}
