'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { assignProjectTeamAction, type StaffState } from '../../actions'

function Save() {
  const { pending } = useFormStatus()
  return <button className="btn btn-primary btn-small" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save team'}</button>
}

export default function TeamForm({
  projectId,
  leadAnalystId,
  fieldAgentId,
  staff,
}: {
  projectId: string
  leadAnalystId: string | null
  fieldAgentId: string | null
  staff: { id: string; full_name: string; role: string }[]
}) {
  const [state, action] = useActionState<StaffState, FormData>(assignProjectTeamAction, null)
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          Lead analyst
          <select className="input" name="leadAnalystId" defaultValue={leadAnalystId ?? ''}>
            <option value="">Not assigned</option>
            {staff.filter((s) => s.role !== 'field_agent').map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </label>
        <label className="label">
          Field agent
          <select className="input" name="fieldAgentId" defaultValue={fieldAgentId ?? ''}>
            <option value="">Not assigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.role !== 'field_agent' ? ` (${s.role})` : ''}</option>)}
          </select>
        </label>
      </div>
      <p className="hint">The lead analyst drives the report. The field agent records the site visit. Changing the field agent moves open visits assigned to the previous agent or left unassigned.</p>
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok">{state.message}</p>}
      <div className="flex justify-end"><Save /></div>
    </form>
  )
}
