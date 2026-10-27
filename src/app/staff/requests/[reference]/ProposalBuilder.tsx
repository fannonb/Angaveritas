'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { LineItem } from '@/lib/data/proposals'
import { saveProposalAction, type StaffState } from '../../actions'

export type ProposalDefaults = {
  draftId?: string
  title: string
  objectives: string
  scope: string
  deliverables: string
  exclusions: string
  timeline: string
  lineItems: LineItem[]
  paymentTerms: string
  validUntil: string
  ndaOffered: boolean
  depositKes?: number | null
}

const setIntent = (e: React.MouseEvent<HTMLButtonElement>, v: string) => {
  const field = e.currentTarget.form?.elements.namedItem('intent') as HTMLInputElement | null
  if (field) field.value = v
}

function Buttons() {
  const { pending } = useFormStatus()
  return (
    <div className="flex flex-wrap justify-end gap-3">
      <button className="btn btn-secondary" type="submit" disabled={pending} onClick={(e) => setIntent(e, 'save')}>Save draft</button>
      <button className="btn btn-primary" type="submit" disabled={pending} onClick={(e) => setIntent(e, 'send')}>
        {pending ? 'Working…' : 'Save and send to client'}
      </button>
    </div>
  )
}

export default function ProposalBuilder({ requestId, d }: { requestId: string; d: ProposalDefaults }) {
  const [state, action] = useActionState<StaffState, FormData>(saveProposalAction, null)
  const [items, setItems] = useState<LineItem[]>(d.lineItems.length ? d.lineItems : [{ label: '', amount: 0 }])
  const total = items.reduce((s, i) => s + (Number.isFinite(i.amount) ? Math.round(i.amount) : 0), 0)
  const setItem = (i: number, patch: Partial<LineItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="draftId" value={d.draftId ?? ''} />
      <input type="hidden" name="intent" defaultValue="save" />
      <label className="label">Title<input className="input" name="title" defaultValue={d.title} required maxLength={200} /></label>
      <label className="label">
        What this work will answer
        <textarea className="input" name="objectives" defaultValue={d.objectives} required maxLength={4000} />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="label">
          Scope of work <span className="opt">(one per line)</span>
          <textarea className="input min-h-[10rem]" name="scope" defaultValue={d.scope} maxLength={8000} />
        </label>
        <label className="label">
          Deliverables <span className="opt">(one per line)</span>
          <textarea className="input min-h-[10rem]" name="deliverables" defaultValue={d.deliverables} maxLength={8000} />
        </label>
      </div>
      <label className="label">
        Not included / limitations
        <textarea className="input min-h-[4.5rem]" name="exclusions" defaultValue={d.exclusions} maxLength={2000} />
      </label>

      <fieldset className="space-y-2">
        <legend className="label mb-2">Price lines (KES)</legend>
        {items.map((it, i) => (
          <div key={i} className="grid items-start gap-2 sm:grid-cols-[1.4fr_1fr_9rem_auto]">
            <input className="input mt-0" name="li_label" value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="Item" aria-label="Item" maxLength={200} />
            <input className="input mt-0" name="li_detail" value={it.detail ?? ''} onChange={(e) => setItem(i, { detail: e.target.value })} placeholder="Detail (optional)" aria-label="Detail" maxLength={200} />
            <input className="input mt-0 text-right tabular-nums" name="li_amount" value={Number.isFinite(it.amount) ? it.amount : ''} onChange={(e) => setItem(i, { amount: Number(e.target.value.replace(/[^\d-]/g, '')) })} inputMode="numeric" aria-label="Amount" />
            <button type="button" className="btn btn-secondary btn-xs mt-1.5" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove line">×</button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setItems((xs) => [...xs, { label: '', amount: 0 }])}>Add line</button>
          <p className="text-lg font-semibold tabular-nums">Total KES {total.toLocaleString('en-US')}</p>
        </div>
        <p className="hint">Use a negative amount for a discount.</p>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="label">Timeline<input className="input" name="timeline" defaultValue={d.timeline} required maxLength={500} /></label>
        <label className="label">Valid until<input className="input" name="validUntil" type="date" defaultValue={d.validUntil} /></label>
      </div>
      <label className="label">
        Payment terms
        <textarea className="input min-h-[4.5rem]" name="paymentTerms" defaultValue={d.paymentTerms} required maxLength={1000} />
      </label>
      <label className="label">Required deposit KES (leave blank for payment in full)<input className="input" name="depositKes" type="number" min="0" max={Math.max(0,total)} defaultValue={d.depositKes ?? ''} /><span className="hint">Keep this amount consistent with the written payment terms.</span></label>
      <label className="check"><input type="checkbox" name="ndaOffered" defaultChecked={d.ndaOffered} /> Offer a separate NDA</label>

      {state?.errors && (
        <div role="alert" className="alert alert-bad">
          <ul className="list-disc pl-5">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok">{state.message}</p>}
      <Buttons />
    </form>
  )
}
