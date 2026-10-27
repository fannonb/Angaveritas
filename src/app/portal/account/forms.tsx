'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { changePasswordAction, updateProfileAction, type ActionState } from '../actions'

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <button className="btn btn-primary btn-small" type="submit" disabled={pending}>{pending ? 'Saving…' : children}</button>
}

function Result({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="alert alert-bad">{state.error}</p>
  if (state?.ok) return <p role="status" className="alert alert-ok">{state.message}</p>
  return null
}

const zones = ['Africa/Nairobi', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'Asia/Dubai', 'Asia/Riyadh', 'Australia/Sydney', 'Africa/Johannesburg', 'Africa/Lagos', 'Asia/Kolkata', 'Asia/Shanghai']

export function ProfileForm({ v }: { v: { fullName: string; phone: string; basedIn: string; timezone: string; email: string } }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProfileAction, null)
  const options = zones.includes(v.timezone) ? zones : [v.timezone, ...zones]
  return (
    <form action={action} className="space-y-4">
      <label className="label">Full name<input className="input" name="fullName" defaultValue={v.fullName} required maxLength={120} /></label>
      <label className="label">
        Email
        <input className="input bg-paper" value={v.email} disabled />
        <span className="hint block">To change your email, contact us.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">Phone or WhatsApp<input className="input" name="phone" type="tel" defaultValue={v.phone} maxLength={40} /></label>
        <label className="label">Where you are based<input className="input" name="basedIn" defaultValue={v.basedIn} maxLength={80} /></label>
      </div>
      <label className="label">
        Time zone
        <select className="input" name="timezone" defaultValue={v.timezone}>
          {options.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
        </select>
        <span className="hint block">Dates and times in your dashboard are shown in this time zone.</span>
      </label>
      <Result state={state} />
      <Submit>Save changes</Submit>
    </form>
  )
}

export function PasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, null)
  return (
    <form action={action} className="space-y-4">
      <label className="label">Current password<input className="input" name="current" type="password" autoComplete="current-password" required maxLength={200} /></label>
      <label className="label">New password<input className="input" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} /></label>
      <label className="label">Repeat new password<input className="input" name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={200} /></label>
      <Result state={state} />
      <Submit>Change password</Submit>
    </form>
  )
}
