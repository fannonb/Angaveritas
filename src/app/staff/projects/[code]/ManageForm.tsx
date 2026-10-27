'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { kes } from '@/components/app/format'
import { healthLabels, paymentStatusLabels, stageLabels, type ProjectStage } from '@/lib/labels'
import { updateProjectAction, type StaffState } from '../../actions'

type P = {
  id: string
  title: string
  stage: string
  health: string
  health_note: string | null
  engagement: string
  start_date: string | null
  due_date: string | null
  payment_status: string
  planning_notes: string | null
  location_label: string | null
  county: string | null
  location_lat: number | null
  location_lng: number | null
}

function Save() {
  const { pending } = useFormStatus()
  return <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button>
}

export default function ManageForm({ p, owedKes = 0 }: { p: P; owedKes?: number }) {
  const [state, action] = useActionState<StaffState, FormData>(updateProjectAction, null)
  const [stage, setStage] = useState(p.stage)
  const iso = (d: string | null) => (d ? String(d).slice(0, 10) : '')
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="projectId" value={p.id} />
      <label className="label">Project name<input className="input" name="title" defaultValue={p.title} required maxLength={140} /></label>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">What the client sees</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <label className="label">
            Health
            <select className="input" name="health" defaultValue={p.health}>
              {Object.entries(healthLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="label">
            Why <span className="opt">(one line, shown to the client)</span>
            <input className="input" name="healthNote" defaultValue={p.health_note ?? ''} maxLength={1000} placeholder="e.g. Walls not yet at the level the contractor reported" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">Start date<input className="input" type="date" name="startDate" defaultValue={iso(p.start_date)} /></label>
          <label className="label">Report due<input className="input" type="date" name="dueDate" defaultValue={iso(p.due_date)} /></label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Site</legend>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <label className="label">Location<input className="input" name="locationLabel" defaultValue={p.location_label ?? ''} maxLength={200} /></label>
          <label className="label">County<input className="input" name="county" defaultValue={p.county ?? ''} maxLength={80} /></label>
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Map position <span className="font-normal text-muted">(latitude and longitude)</span></summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="label">Latitude<input className="input" name="lat" defaultValue={p.location_lat ?? ''} inputMode="decimal" /></label>
            <label className="label">Longitude<input className="input" name="lng" defaultValue={p.location_lng ?? ''} inputMode="decimal" /></label>
          </div>
        </details>
      </fieldset>

      <label className="label">
        Planning notes <span className="opt">(staff only: desk research, route, risks, people to interview)</span>
        <textarea className="input min-h-[8rem]" name="planningNotes" defaultValue={p.planning_notes ?? ''} maxLength={8000} />
      </label>

      <details className="rounded border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">Type of work, payment override and closing <span className="font-normal text-muted">(rarely needed)</span></summary>
        <div className="mt-3 space-y-4">
          <label className="label">
            Type of work
            <select className="input" name="engagement" defaultValue={p.engagement}>
              <option value="one_off">One-off</option>
              <option value="retainer">Recurring monitoring</option>
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <label className="label">
              Payment status
              <select className="input" name="paymentStatus" defaultValue={p.payment_status}>
                {Object.entries(paymentStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="label">Reference or waiver reason <span className="opt">(needed to change it)</span><input className="input" name="paymentNote" maxLength={1000} /></label>
          </div>
          <p className="hint">Payments are normally recorded on the Billing tab, which updates this for you. Change it here only for a waiver or an old manual payment.</p>
          <label className="label">
            Stage
            <select className="input" name="stage" defaultValue={p.stage} onChange={(e) => setStage(e.target.value)}>
              <option value={p.stage}>{stageLabels[p.stage as ProjectStage]}</option>
              {p.stage !== 'closed' && <option value="closed">Closed</option>}
            </select>
            <span className="hint block">Stages move on by themselves as site details, visits and reports are completed. Choose Closed only when the work is finished.</span>
          </label>
          {stage === 'closed' && p.stage !== 'closed' && owedKes > 0 && (
            <label className="check sm:col-span-2"><input type="checkbox" name="closeWithBalance" required /> Close anyway: {kes(owedKes)} is still unpaid. Balance reminders stop once the project is closed.</label>
          )}
        </div>
      </details>
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok">{state.message} The client sees health, stage and payment changes in their history.</p>}
      <div className="flex justify-end"><Save /></div>
    </form>
  )
}
