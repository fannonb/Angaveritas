'use client'

import { useActionState, useRef } from 'react'
import { preserveForm } from '@/components/app/useFormDraft'
import { inviteStaffAction, type StaffState } from '../actions'

function Submit({ pending }: { pending: boolean }) {
  return <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send invitation'}</button>
}

export default function InviteForm() {
  const ref = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState<StaffState, FormData>(async (prev, fd) => {
    const res = await inviteStaffAction(prev, fd)
    if (res?.ok) ref.current?.reset()
    return res
  }, null)
  return (
    <form ref={ref} action={action} onSubmit={preserveForm(action)} className="grid gap-3 md:grid-cols-[1fr_1fr_10rem_auto] md:items-end">
      <label className="label">Full name<input className="input" name="fullName" required maxLength={120} /></label>
      <label className="label">Email<input className="input" name="email" type="email" required maxLength={160} /></label>
      <label className="label">
        Role
        <select className="input" name="role" defaultValue="field_agent">
          <option value="field_agent">Field agent</option>
          <option value="analyst">Analyst</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <Submit pending={pending} />
      {state?.error && <p role="alert" className="alert alert-bad md:col-span-4">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok md:col-span-4">{state.message}</p>}
    </form>
  )
}
