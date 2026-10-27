import Link from 'next/link'
import { notFound } from 'next/navigation'
import PrintButton from '@/components/app/PrintButton'
import ReportDocument from '@/components/app/ReportDocument'
import ReportReadMarker from '@/components/app/ReportReadMarker'
import { requireClient } from '@/lib/auth/session'
import { listProjectFiles } from '@/lib/data/files'
import { listFindings, listProjectFindings } from '@/lib/data/inspections'
import { projectByCodeFor } from '@/lib/data/projects'
import { reportLock } from '@/lib/data/operations'
import { getReport } from '@/lib/data/reports'
import { kes } from '@/components/app/format'
import { site } from '@/lib/site'
import { rateReportAction } from '../../../../actions'

export const metadata = { title: 'Report' }

export default async function ClientReportPage({ params: paramsPromise }: { params: Promise<{ code: string; id: string }> }) {
  const params = await paramsPromise
  const user = await requireClient()
  const access = await projectByCodeFor(user, params.code)
  const r = await getReport(params.id)
  if (!access || !r || r.project_id !== access.project.id || r.status !== 'published' || !r.snapshot) notFound()
  const p = access.project
  const lock = await reportLock(p.id)
  if (lock) return (
    <div className="space-y-6">
      <div className="no-print">
        <Link href={`/portal/projects/${p.code}?tab=reports`} className="text-sm">← {p.title}</Link>
      </div>
      <section className="panel panel-pad max-w-[40rem] space-y-3">
        <p className="kicker">Report ready</p>
        <h1 className="app-title">{r.title}</h1>
        <p className="text-ink-2">The findings and our recommendation open once the remaining balance is paid: {kes(lock.owedKes)} on invoice {lock.codes}.</p>
        <Link className="btn btn-primary btn-small" href={`/portal/projects/${p.code}?tab=operations`}>How to pay</Link>
      </section>
    </div>
  )
  const { findings, evidence } = r.snapshot
  const upsell = r.overall_status === 'warn' || r.overall_status === 'bad'

  return (
    <div className="space-y-6">
      <ReportReadMarker reportId={r.id} />
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/portal/projects/${p.code}?tab=reports`} className="text-sm">← {p.title}</Link>
        <div className="flex flex-wrap gap-2">
          {r.pdf_file_id && <a className="btn btn-primary btn-small" href={`/api/files/${r.pdf_file_id}?download`}>Download PDF report</a>}
          <PrintButton />
        </div>
      </div>

      <ReportDocument r={{ ...r, ...r.snapshot.report, snapshot: r.snapshot }} project={r.snapshot.project} findings={findings} evidence={evidence} tz={user.timezone} />

      <div className="no-print grid gap-6 lg:grid-cols-2">
        <section className="panel panel-pad space-y-3">
          <h2 className="text-lg">What next?</h2>
          {upsell && (
            <p className="text-ink-2">
              This report found risks that can change over time. Many clients add <strong>Project Monitoring</strong>: scheduled visits that track whether the
              required actions actually happen.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary btn-small" href={`/estimate?project=${p.code}`}>Request a follow-up visit</Link>
            <Link className="btn btn-secondary btn-small" href={`/portal/projects/${p.code}?tab=messages`}>Ask your analyst</Link>
            {site.bookingUrl && <a className="btn btn-secondary btn-small" href={site.bookingUrl} target="_blank" rel="noopener">Book a walkthrough call</a>}
          </div>
        </section>
        <section className="panel panel-pad space-y-3">
          <h2 className="text-lg">How useful was this report? <span className="text-sm font-normal text-muted">Optional</span></h2>
          {r.client_rating ? (
            <p className="text-ink-2">Thank you. You rated it {r.client_rating} out of 5.{r.client_feedback ? ` “${r.client_feedback}”` : ''}</p>
          ) : (
            <form action={rateReportAction} className="space-y-3">
              <input type="hidden" name="projectId" value={p.id} />
              <input type="hidden" name="reportId" value={r.id} />
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Rating</legend>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="option px-4 py-2">
                    <input type="radio" name="rating" value={n} required /> {n}
                  </label>
                ))}
              </fieldset>
              <label className="label">
                Anything we could do better? <span className="opt">(optional)</span>
                <textarea className="input min-h-[4rem]" name="feedback" maxLength={2000} />
              </label>
              <button className="btn btn-secondary btn-small" type="submit">Send feedback</button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
