'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { recommendedDecisions } from '@/lib/labels'
import { saveReportAction, type StaffState } from '../../../../actions'

type R = {
  id: string
  title: string
  inspection_id: string | null
  executive_summary: string
  overall_status: string | null
  recommended_decision: string | null
  recommendations: string | null
  limitations: string
  pdf_file_id: string | null
  status: string
  scope: string
  methodology: string
}

const setIntent = (e: React.MouseEvent<HTMLButtonElement>, v: string) => {
  const field = e.currentTarget.form?.elements.namedItem('intent') as HTMLInputElement | null
  if (field) field.value = v
}

function Buttons({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <div className="flex flex-wrap justify-end gap-3">
      <button className="btn btn-secondary" type="submit" disabled={pending} onClick={(e) => setIntent(e, 'save')}>Save</button>
      {canSubmit && (
        <button className="btn btn-primary" type="submit" disabled={pending} onClick={(e) => setIntent(e, 'submit')}>
          {pending ? 'Working…' : 'Save and submit for review'}
        </button>
      )}
    </div>
  )
}

export default function ReportEditor({ r, inspections, pdfs }: { r: R; inspections: { id: string; code: string; title: string }[]; pdfs: { id: string; filename: string }[] }) {
  const [state, action] = useActionState<StaffState, FormData>(saveReportAction, null)
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="reportId" value={r.id} />
      <input type="hidden" name="intent" defaultValue="save" />
      <label className="label">Title<input className="input" name="title" defaultValue={r.title} maxLength={200} required /></label>
      <label className="label">
        Inspection
        <select className="input" name="inspectionId" defaultValue={r.inspection_id ?? ''}>
          <option value="">All reviewed inspections on this project</option>
          {inspections.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.title}</option>)}
        </select>
        <span className="hint block">Findings and released evidence from this inspection appear in the report.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Overall status
          <select className="input" name="overallStatus" defaultValue={r.overall_status ?? ''}>
            <option value="">Choose…</option>
            <option value="ok">On track</option>
            <option value="warn">At risk</option>
            <option value="bad">High risk</option>
          </select>
          <span className="hint block">Sets the project&apos;s health when published.</span>
        </label>
        <label className="label">
          Recommended decision
          <input className="input" name="recommendedDecision" defaultValue={r.recommended_decision ?? ''} list="decisions" maxLength={200} />
          <datalist id="decisions">{recommendedDecisions.map((d) => <option key={d} value={d} />)}</datalist>
        </label>
      </div>
      <label className="label">
        Executive summary
        <textarea className="input min-h-[10rem]" name="executiveSummary" defaultValue={r.executive_summary} maxLength={20000} placeholder="What we checked, what we found, how sure we are, and what it means for the decision." />
      </label>
      <label className="label">Scope of assignment<textarea className="input min-h-[6rem]" name="scope" defaultValue={r.scope} maxLength={20000} /></label>
      <label className="label">Methodology<textarea className="input min-h-[6rem]" name="methodology" defaultValue={r.methodology} maxLength={20000} placeholder="Visits, interviews, records checked, and how evidence was cross-checked." /></label>
      <label className="label">
        Recommendations
        <textarea className="input min-h-[8rem]" name="recommendations" defaultValue={r.recommendations ?? ''} maxLength={20000} placeholder="Prioritised steps before money is committed." />
      </label>
      <label className="label">
        Limitations
        <textarea className="input min-h-[6rem]" name="limitations" defaultValue={r.limitations} maxLength={8000} />
        <span className="hint block">State clearly what was and was not verified.</span>
      </label>
      <label className="label">
        Attached PDF <span className="opt">(optional)</span>
        <select className="input" name="pdfFileId" defaultValue={r.pdf_file_id ?? ''}>
          <option value="">None: the client gets the on-screen report (printable to PDF)</option>
          {pdfs.map((f) => <option key={f.id} value={f.id}>{f.filename}</option>)}
        </select>
        <span className="hint block">Upload PDFs on the project&apos;s Reports tab.</span>
      </label>
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok">{state.message}</p>}
      <Buttons canSubmit={r.status === 'draft'} />
    </form>
  )
}
