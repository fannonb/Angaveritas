'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveFindingAction } from '@/app/staff/actions'
import type { FindingRow } from '@/lib/data/inspections'

function Save({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus()
  return <button className="btn btn-secondary btn-small" disabled={pending}>{pending ? 'Saving…' : editing ? 'Save finding' : 'Add finding'}</button>
}

export default function FindingForm({ inspectionId, f, evidence }: { inspectionId: string; f?: FindingRow; evidence: { id: string; evidence_code: string | null; filename: string }[] }) {
  const [status, setStatus] = useState(f?.status ?? '')
  const risk = status === 'warn' || status === 'bad'
  return <form action={saveFindingAction} className="space-y-3">
    <input type="hidden" name="inspectionId" value={inspectionId} />
    {f && <input type="hidden" name="findingId" value={f.id} />}
    <label className="label">What did you check?<input className="input" name="area" defaultValue={f?.area} required maxLength={200} list="finding-areas" placeholder="e.g. Site access" /></label>
    <label className="label">What did you see?<textarea className="input" name="observation" defaultValue={f?.observation} required maxLength={4000} /></label>
    <label className="label">Result<select className="input" name="status" value={status} required onChange={e => setStatus(e.target.value as typeof status)}>
      <option value="" disabled>Choose a result</option><option value="ok">No problem (on track)</option><option value="warn">A concern (at risk)</option><option value="bad">A serious problem (high risk)</option><option value="unverified">Could not check</option>
    </select></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="label">How sure are you?<select className="input" name="confidence" defaultValue={f?.confidence ?? ''} required>
        <option value="" disabled>Choose how sure you are</option><option value="high">Very sure</option><option value="moderate">Fairly sure</option><option value="limited">Not sure</option>
      </select></label>
      <label className="label">How do you know?<select className="input" name="evidenceGrade" defaultValue={f?.evidence_grade ?? ''} required>
        <option value="" disabled>Choose your source</option><option value="E1">I saw it myself</option><option value="E2">Someone independent confirmed it</option><option value="E3">Original documents</option><option value="E4">Interviews that back each other up</option><option value="E5">Only the client’s word</option>
      </select></label>
    </div>
    {risk && <fieldset className="space-y-3 rounded border border-[#e6c27a] bg-warn-bg p-3">
      <legend className="label">Explain the concern</legend>
      <p className="hint">These details are required for a concern. Ask your analyst if you need help assessing it.</p>
      <label className="label">Type of risk<select className="input" name="riskCategory" defaultValue={f?.risk_category ?? ''} required><option value="" disabled>Choose the type</option>{['Financial','Operational','Legal','Regulatory','Reputational','Environmental'].map(c => <option key={c}>{c}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">How likely is it?<select className="input" name="likelihood" defaultValue={f?.likelihood ?? ''} required><option value="" disabled>Choose likelihood</option>{['Rare','Unlikely','Possible','Likely','Almost certain'].map((s,i) => <option key={s} value={i+1}>{i+1} · {s}</option>)}</select></label>
        <label className="label">How serious would it be?<select className="input" name="impact" defaultValue={f?.impact ?? ''} required><option value="" disabled>Choose impact</option>{['Minor','Limited','Moderate','Major','Severe'].map((s,i) => <option key={s} value={i+1}>{i+1} · {s}</option>)}</select></label>
      </div>
      <label className="label">What should happen next?<textarea className="input" name="action" required defaultValue={f?.action ?? ''} maxLength={2000} placeholder="What should be done to reduce or verify this risk?" /></label>
    </fieldset>}
    {!risk && <label className="label">Suggested next action <span className="opt">(optional)</span><input className="input" name="action" defaultValue={f?.action ?? ''} maxLength={2000} /></label>}
    <fieldset className="space-y-1"><legend className="label">Photos that show this</legend>
      {evidence.map(e => <label className="check text-sm" key={e.id}><input type="checkbox" name="evidenceIds" value={e.id} defaultChecked={f?.evidence_ids?.includes(e.id)} />{e.evidence_code} · {e.filename}</label>)}
      {!evidence.length && <p className="hint">Add photos first, then choose the ones that show this.</p>}
    </fieldset>
    <Save editing={!!f} />
  </form>
}
