import Link from 'next/link'
import { HealthChip, ProjectMap, StageChip } from '@/components/app/bits'
import { fmtDate } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { listProjectsForStaff, projectNeeds, projectStageCounts, type ProjectNeed } from '@/lib/data/projects'
import { paymentStatusLabels, projectStages, stageLabels, type ProjectStage } from '@/lib/labels'

export const metadata = { title: 'Projects' }

export default async function StaffProjects({ searchParams: searchParamsPromise }: { searchParams: Promise<{ stage?: string; q?: string; need?: string }> }) {
  const searchParams = await searchParamsPromise
  const user = await requireStaff()
  const need = searchParams.need && searchParams.need in projectNeeds ? (searchParams.need as ProjectNeed) : undefined
  const stage = (searchParams.stage && ([...projectStages, 'active', 'all'] as string[]).includes(searchParams.stage) ? searchParams.stage : 'active') as ProjectStage | 'active' | 'all'
  const [rows, counts] = await Promise.all([listProjectsForStaff(user, { stage, search: searchParams.q, need }), projectStageCounts()])
  const manager = user.role !== 'field_agent'
  return (
    <div className="space-y-5">
      <div>
        <h1 className="app-title">{manager ? 'Projects' : 'My projects'}</h1>
        <p className="mt-1 text-ink-2">Accepted work, from onboarding to delivery. Riskiest first.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter">
          {(['active', ...projectStages, 'all'] as const).map((s) => (
            <Link key={s} href={`/staff/projects?stage=${s}`} className={`btn btn-xs ${stage === s ? 'btn-primary' : 'btn-secondary'}`}>
              {s === 'active' ? 'Active' : s === 'all' ? 'All' : stageLabels[s]}
              {manager && s !== 'active' && s !== 'all' && counts[s] ? ` (${counts[s]})` : ''}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="stage" value={stage} />
          {need && <input type="hidden" name="need" value={need} />}
          <input className="input mt-0 w-64" name="q" defaultValue={searchParams.q} placeholder="Search code, title, client, place…" />
          <button className="btn btn-secondary btn-small" type="submit">Search</button>
        </form>
      </div>
      {(need || searchParams.q) && (
        <p className="filter-note">
          Showing {need ? <strong>{projectNeeds[need].toLowerCase()}</strong> : 'projects'}{searchParams.q ? <> matching <strong>“{searchParams.q}”</strong></> : null}
          {' · '}<Link href={`/staff/projects?stage=${stage}`}>Clear filter</Link>
        </p>
      )}
      <div className="grid gap-6 2xl:grid-cols-[2fr_1fr] 2xl:items-start">
        <div className="table-scroll">
          <table className="table table--wide">
            <thead><tr><th>Project</th><th>Client</th><th>Stage</th><th>Health</th><th>Team</th><th>Next visit</th>{manager && <th>Payment</th>}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="empty">{need || searchParams.q ? 'No projects match this filter.' : 'No projects at this stage.'}</td></tr>}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/staff/projects/${p.code}`} className="font-semibold">{p.title}</Link>
                    <span className="block text-xs text-muted"><span className="font-mono">{p.code}</span>{p.location_label ? ` · ${p.location_label}` : ''}</span>
                  </td>
                  <td className="dim">{p.client_name}</td>
                  <td><StageChip stage={p.stage} />{p.stage === 'onboarding' && p.onboarding_submitted_at == null && <span className="block text-xs text-muted">waiting for client</span>}</td>
                  <td><HealthChip health={p.health} /></td>
                  <td className="dim text-sm">{p.analyst_name ?? <span className="text-bad">No analyst</span>}<span className="block">{p.agent_name ?? <span className="text-muted">No agent</span>}</span></td>
                  <td className="dim">{p.next_inspection ? fmtDate(p.next_inspection) : '—'}</td>
                  {manager && <td className="dim text-sm">{paymentStatusLabels[p.payment_status]}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="panel panel-pad">
          <h2 className="mb-3 text-base">Map</h2>
          <ProjectMap projects={rows} hrefFor={(p) => `/staff/projects/${p.code}`} />
        </section>
      </div>
    </div>
  )
}
