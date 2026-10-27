import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReportChip } from '@/components/app/bits'
import { fmtDateTime } from '@/components/app/format'
import ReportDocument from '@/components/app/ReportDocument'
import { requireStaff } from '@/lib/auth/session'
import { listProjectFiles } from '@/lib/data/files'
import { listFindings, listInspections, listProjectFindings } from '@/lib/data/inspections'
import { projectByCodeFor } from '@/lib/data/projects'
import { getReport } from '@/lib/data/reports'
import { reportStatusAction } from '../../../../actions'
import ReportEditor from './ReportEditor'

export const metadata = { title: 'Report' }

export default async function StaffReport({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const params = await paramsPromise
  const searchParams = await searchParamsPromise
  const user = await requireStaff(['analyst', 'admin'])
  const access = await projectByCodeFor(user, params.code)
  const r = await getReport(params.id)
  if (!access || !r || r.project_id !== access.project.id) notFound()
  const p = access.project
  const [inspections, findings, evidence, pdfs] = await Promise.all([
    listInspections(p.id),
    r.inspection_id ? listFindings(r.inspection_id) : listProjectFindings(p.id, true),
    listProjectFiles(p.id, { clientView: true, category: 'evidence', inspectionId: r.inspection_id ?? undefined }),
    listProjectFiles(p.id, { clientView: false, category: 'report' }),
  ])
  // Only an admin approves and publishes. An admin may approve a report they wrote or edited.
  const canPublish = r.status === 'in_review' && user.role === 'admin'

  return (
    <div className="space-y-5">
      {searchParams.error && <p role="alert" className="alert alert-bad">{searchParams.error}</p>}
      <p className="text-sm"><Link href={`/staff/projects/${p.code}?tab=reports`}>← {p.code} · {p.title}</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">Report · by {r.author_name ?? '—'} · updated {fmtDateTime(r.updated_at)}</p>
          <h1 className="app-title mt-1">{r.title}</h1>
        </div>
        <ReportChip status={r.status} />
      </div>

      <section className="panel panel-pad space-y-3">
        <h2 className="text-lg">Quality review</h2>
        {r.status === 'draft' && <p className="text-ink-2">Write the report, then submit it for review. An admin approves it before the client sees it.</p>}
        {r.status === 'in_review' && (
          <div className="flex flex-wrap items-end gap-3">
            {canPublish ? (
              <form action={reportStatusAction}>
                <input type="hidden" name="reportId" value={r.id} />
                <input type="hidden" name="to" value="published" />
                <button className="btn btn-primary" type="submit">Approve and publish to client</button>
              </form>
            ) : (
              <p className="text-ink-2">Waiting for an admin to approve and publish this report.</p>
            )}
            <form action={reportStatusAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="reportId" value={r.id} />
              <input type="hidden" name="to" value="draft" />
              <label className="label">Return with a note<input className="input mt-1 w-72" name="note" maxLength={1000} placeholder="What needs changing" /></label>
              <button className="btn btn-secondary" type="submit">Return to draft</button>
            </form>
          </div>
        )}
        {r.status === 'published' && (
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <p className="text-ink-2 min-w-0 max-w-[40rem]">Published {fmtDateTime(r.published_at)}{r.reviewer_name ? `, approved by ${r.reviewer_name}` : ''}.{r.client_rating ? ` Client rating: ${r.client_rating}/5${r.client_feedback ? `, “${r.client_feedback}”` : ''}.` : ''}</p>
            <form action={reportStatusAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="reportId" value={r.id} />
              <input type="hidden" name="to" value="withdrawn" />
              <label className="label">Withdrawal reason<input className="input" name="note" required maxLength={1000} /></label>
              <button className="btn btn-danger btn-small" type="submit">Withdraw</button>
            </form>
          </div>
        )}
        {r.status === 'withdrawn' && <div className="space-y-3"><p className="text-ink-2">Withdrawn: {r.withdrawal_reason}. Create a corrected version.</p>
          <form action={async (form: FormData) => { 'use server'; const { createReportAction } = await import('../../../../actions'); await createReportAction(form) }}>
            <input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="supersedesId" value={r.id} />
            <input type="hidden" name="title" value={`${r.title} (corrected)`} /><button className="btn btn-secondary" type="submit">Create corrected report</button>
          </form></div>}
      </section>

      <div className="grid gap-6 2xl:grid-cols-2 2xl:items-start">
        {r.status === 'draft' && (
          <section className="panel panel-pad">
            <ReportEditor
              r={r}
              inspections={inspections.filter(i => i.status === 'reviewed').map((i) => ({ id: i.id, code: i.code, title: i.title }))}
              pdfs={pdfs.map((f) => ({ id: f.id, filename: f.filename }))}
            />
          </section>
        )}
        <section className="space-y-2">
          <p className="kicker">Preview: what the client will see</p>
          {findings.length === 0 && <p className="alert alert-warn">No reviewed findings yet. Review the inspection first so its findings and evidence appear here.</p>}
          <ReportDocument r={r.snapshot ? { ...r, ...r.snapshot.report, status: r.status } : r} project={r.snapshot?.project ?? p} findings={r.snapshot?.findings ?? findings} evidence={r.snapshot?.evidence ?? evidence} />
        </section>
      </div>
    </div>
  )
}
