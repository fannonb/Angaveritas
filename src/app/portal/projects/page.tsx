import Link from 'next/link'
import { EmptyState, HealthChip, ProjectMap, RequestChip, StageChip } from '@/components/app/bits'
import { fmtDate, kes } from '@/components/app/format'
import { requireClient } from '@/lib/auth/session'
import { listProjectsForClient } from '@/lib/data/projects'
import { listRequestsForClient, openRequestStatuses, type RequestWithClient } from '@/lib/data/requests'

export const metadata = { title: 'Projects' }

// Everything the client has asked us to check: requests still waiting to start, the open work, then completed work.
export default async function ProjectsPage() {
  const user = await requireClient()
  const [projects, requests] = await Promise.all([listProjectsForClient(user.id), listRequestsForClient(user.id)])
  const waiting = requests.filter((r) => openRequestStatuses.includes(r.status))
  const ended = requests.filter((r) => ['declined', 'withdrawn', 'closed'].includes(r.status) && !r.project_code)
  const open = projects.filter((p) => p.stage !== 'closed')
  const completed = projects.filter((p) => p.stage === 'closed')
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="app-title">Projects</h1>
          <p className="mt-1 text-ink-2">Everything you have asked us to check, from the first request to the final report.</p>
        </div>
        <Link className="btn btn-primary" href="/estimate">Get an estimate</Link>
      </div>
      {projects.length + waiting.length + ended.length === 0 ? (
        <EmptyState title="Nothing here yet" action={{ href: '/estimate', label: 'Get an estimate' }}>
          Tell us what you need checked and where. Your request, our proposal and then the work itself will all appear here.
        </EmptyState>
      ) : (
        <>
          {waiting.length > 0 && (
            <section className="panel" aria-labelledby="waiting">
              <div className="panel-head">
                <h2 id="waiting">Waiting to start</h2>
                <span className="text-sm text-muted">Work starts when you accept a proposal</span>
              </div>
              <RequestList requests={waiting} />
            </section>
          )}

          {open.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
              <section aria-labelledby="open-projects">
                <h2 id="open-projects" className="mb-3 text-lg">Open projects</h2>
                <div className="table-scroll">
                  <table className="table table--wide">
                    <thead><tr><th>Project</th><th>Stage</th><th>Health</th><th>Next visit</th><th>Reports</th></tr></thead>
                    <tbody>
                      {open.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <Link href={`/portal/projects/${p.code}`} className="font-semibold">{p.title}</Link>
                            <span className="block text-xs text-muted"><span className="font-mono">{p.code}</span>{p.location_label ? ` · ${p.location_label}` : ''}</span>
                          </td>
                          <td><StageChip stage={p.stage} client /></td>
                          <td><HealthChip health={p.health} /></td>
                          <td className="dim">{p.next_inspection ? fmtDate(p.next_inspection, user.timezone) : '—'}</td>
                          <td className="dim">{p.published_reports}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel panel-pad">
                <ProjectMap projects={open} hrefFor={(p) => `/portal/projects/${p.code}`} />
              </section>
            </div>
          )}

          {completed.length > 0 && (
            <section className="panel" id="completed" aria-labelledby="completed-title">
              <div className="panel-head">
                <h2 id="completed-title">Completed</h2>
                <span className="text-sm text-muted">Reports, messages and records stay available</span>
              </div>
              <div className="table-scroll">
                <table className="table table--wide">
                  <thead><tr><th>Project</th><th>Completed</th><th>Reports</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {completed.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/portal/projects/${p.code}`} className="font-semibold">{p.title}</Link>
                          <span className="block text-xs text-muted"><span className="font-mono">{p.code}</span>{p.location_label ? ` · ${p.location_label}` : ''}</span>
                        </td>
                        <td className="dim">{p.closed_at ? fmtDate(p.closed_at, user.timezone) : '—'}</td>
                        <td className="dim">{p.published_reports}</td>
                        <td className="text-right"><Link className="text-sm" href={`/estimate?project=${p.code}`}>Request a follow-up</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {ended.length > 0 && (
            <details className="panel">
              <summary className="panel-head cursor-pointer list-none">
                <h2>Not going ahead</h2>
                <span className="text-sm text-muted">{ended.length} request{ended.length > 1 ? 's' : ''}</span>
              </summary>
              <RequestList requests={ended} />
            </details>
          )}
        </>
      )}
    </div>
  )
}

function RequestList({ requests }: { requests: RequestWithClient[] }) {
  return (
    <ul className="divide-y divide-line">
      {requests.map((r) => (
        <li key={r.id}>
          <Link href={`/portal/requests/${r.reference}`} className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 text-ink no-underline hover:bg-paper">
            <span>
              <strong className="block">{r.title}</strong>
              <span className="text-sm text-ink-2">{r.reference} · {r.service_name ?? (r.kind === 'follow_up' ? 'Follow-up visit' : 'Custom request')}{r.total_kes ? ` · estimate ${kes(r.total_kes)}` : ''}</span>
            </span>
            <RequestChip status={r.status} client />
          </Link>
        </li>
      ))}
    </ul>
  )
}
