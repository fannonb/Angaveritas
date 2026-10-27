import Link from 'next/link'
import { EmptyState } from '@/components/app/bits'
import { Metric } from '@/components/app/dashboard'
import { fmtDate, kes } from '@/components/app/format'
import { requireClient } from '@/lib/auth/session'
import { reportLock } from '@/lib/data/operations'
import { sql } from '@/lib/db'
import { overallStatusLabels } from '@/lib/labels'

export const metadata = { title: 'Your reports' }

type ReportRow = {
  id: string; title: string; published_at: Date; overall_status: 'ok' | 'warn' | 'bad' | null; recommended_decision: string | null
  executive_summary: string; pdf_file_id: string | null; viewed: boolean; unlocked: boolean
  project_id: string; project_code: string; project_title: string; location_label: string | null
}

// Reports the client can open, grouped by project. A report whose balance is still owed shows what is needed to open it,
// and its findings stay hidden until the team has confirmed payment.
export default async function ReportsPage() {
  const user = await requireClient()
  const rows = await sql<ReportRow[]>`
    select r.id, r.title, r.published_at, r.overall_status, r.recommended_decision, r.executive_summary, r.pdf_file_id,
      exists(select 1 from report_reads rr where rr.report_id = r.id and rr.user_id = ${user.id}) as viewed,
      client_reports_unlocked(p.id) as unlocked,
      p.id as project_id, p.code as project_code, p.title as project_title, p.location_label
    from reports r join projects p on p.id = r.project_id
    where p.client_id = ${user.id} and r.status = 'published'
    order by r.published_at desc
    limit 200`

  const projects = new Map<string, { id: string; code: string; title: string; location: string | null; reports: ReportRow[] }>()
  for (const r of rows) {
    const group = projects.get(r.project_id) ?? { id: r.project_id, code: r.project_code, title: r.project_title, location: r.location_label, reports: [] }
    group.reports.push(r)
    projects.set(r.project_id, group)
  }
  const owed = new Map<string, { owedKes: number; codes: string } | null>()
  for (const group of projects.values()) {
    if (group.reports.some((r) => !r.unlocked)) owed.set(group.id, await reportLock(group.id))
  }

  const newCount = rows.filter((r) => !r.viewed).length
  const waitingCount = rows.filter((r) => !r.unlocked).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title">Your reports</h1>
        <p className="mt-1 text-ink-2">Findings and recommendations from each visit, saved by project.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No reports yet" action={{ href: '/portal/projects', label: 'View your projects' }}>
          Your first report appears here once it has passed independent review.
        </EmptyState>
      ) : (
        <>
          <section aria-label="Report summary" className="grid gap-4 sm:grid-cols-3">
            <Metric label="Reports" value={rows.length} foot={`${projects.size} project${projects.size === 1 ? '' : 's'}`} />
            <Metric label="New to you" value={newCount} foot={newCount ? 'Not opened yet' : 'You have read them all'} />
            <Metric label="Opening after payment" value={waitingCount} foot={waitingCount ? 'Pay the balance to read them' : 'Nothing is waiting on payment'} />
          </section>

          {[...projects.values()].map((group) => {
            const due = owed.get(group.id)
            return (
              <section key={group.id} className="panel" aria-labelledby={`project-${group.id}`}>
                <div className="panel-head">
                  <div className="min-w-0">
                    <h2 id={`project-${group.id}`} className="text-lg">{group.title}</h2>
                    <p className="text-xs text-muted"><span className="font-mono">{group.code}</span>{group.location ? ` · ${group.location}` : ''}</p>
                  </div>
                  <Link href={`/portal/projects/${group.code}`} className="text-sm">Open project</Link>
                </div>
                <ul className="divide-y divide-line">
                  {group.reports.map((r) => {
                    const href = `/portal/projects/${group.code}/reports/${r.id}`
                    return (
                      <li key={r.id} className="grid gap-3 px-6 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={href} className="font-semibold text-ink no-underline hover:underline">{r.title}</Link>
                            {!r.viewed && <span className="chip chip--info chip--plain">New</span>}
                            {!r.unlocked && <span className="chip chip--warn chip--plain">Opens after payment</span>}
                          </div>
                          <p className="mt-1 text-xs text-muted">Published {fmtDate(r.published_at, user.timezone)}</p>
                          {r.unlocked ? (
                            <>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                {r.overall_status && <span className={`chip chip--${r.overall_status}`}>{overallStatusLabels[r.overall_status]}</span>}
                                {r.recommended_decision && <span className="text-sm text-ink-2">Recommendation: {r.recommended_decision}</span>}
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm text-ink-2">{r.executive_summary}</p>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-ink-2">
                              {due ? `Pay the remaining balance of ${kes(due.owedKes)} on ${due.codes} to open the findings and recommendation.` : 'Pay the remaining balance to open the findings and recommendation.'}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          {r.unlocked ? (
                            <>
                              <Link className="btn btn-primary btn-small" href={href}>{r.viewed ? 'Read again' : 'Read report'}</Link>
                              {r.pdf_file_id && <a className="btn btn-secondary btn-small" href={`/api/files/${r.pdf_file_id}?download`}>Download PDF</a>}
                            </>
                          ) : (
                            <Link className="btn btn-primary btn-small" href={`/portal/projects/${group.code}?tab=operations`}>How to pay</Link>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
