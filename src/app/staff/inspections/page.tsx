import Link from 'next/link'
import { InspectionChip } from '@/components/app/bits'
import { fmtDate, relativeDays } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import type { InspectionStatus } from '@/lib/labels'

export const metadata = { title: 'Inspections' }

export default async function InspectionsPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ show?: string }> }) {
  const searchParams = await searchParamsPromise
  const user = await requireStaff()
  const agent = user.role === 'field_agent'
  const show = searchParams.show === 'done' || searchParams.show === 'check' ? searchParams.show : 'open'
  const rows = await sql<{ id: string; code: string; title: string; status: InspectionStatus; scheduled_for: string | null; agent_name: string | null; project_code: string; project_title: string; location_label: string | null; findings: number; evidence: number; flagged: number }[]>`
    select i.id, i.code, i.title, i.status, i.scheduled_for::text, a.full_name as agent_name, p.code as project_code, p.title as project_title, p.location_label,
      (select count(*)::int from findings f where f.inspection_id = i.id) as findings,
      (select count(*)::int from files f where f.inspection_id = i.id and f.category = 'evidence' and f.status = 'ready') as evidence,
      (select count(*)::int from files f where f.inspection_id = i.id and f.integrity_flag is not null and not f.visible_to_client) as flagged
    from inspections i join projects p on p.id = i.project_id left join users a on a.id = i.agent_id
    where ${
      show === 'open' ? sql`i.status in ('scheduled', 'in_progress', 'submitted')`
      : show === 'check' ? sql`exists (select 1 from files f where f.inspection_id = i.id and f.category = 'evidence' and f.status = 'ready' and f.integrity_flag is not null and not f.visible_to_client)`
      : sql`i.status in ('reviewed', 'cancelled')`
    }
      and ${agent ? sql`(i.agent_id = ${user.id} or (i.agent_id is null and p.field_agent_id = ${user.id}))` : sql`true`}
    order by i.scheduled_for nulls last, i.created_at
    limit 300`
  return (
    <div className="space-y-5">
      <div>
        <h1 className="app-title">{agent ? 'My visits' : 'Visit schedule'}</h1>
        <p className="mt-1 text-ink-2">{agent ? 'Open one on your phone at the site to record findings and take photos.' : 'Site visits across all projects.'}</p>
      </div>
      <nav className="flex gap-1.5">
        <Link href="/staff/inspections" className={`btn btn-xs ${show === 'open' ? 'btn-primary' : 'btn-secondary'}`}>Open</Link>
        <Link href="/staff/inspections?show=check" className={`btn btn-xs ${show === 'check' ? 'btn-primary' : 'btn-secondary'}`}>Evidence to check</Link>
        <Link href="/staff/inspections?show=done" className={`btn btn-xs ${show === 'done' ? 'btn-primary' : 'btn-secondary'}`}>Done</Link>
      </nav>
      {agent ? <section className="panel">{!rows.length ? <p className="empty">{show === 'done' ? 'No finished visits yet.' : 'No visits in this view. Your coordinator will assign your next visit.'}</p> : <ul className="divide-y divide-line">{rows.map(i => <li key={i.id} className="panel-pad space-y-2"><p className="kicker">{i.project_code} · {i.code}</p><h2 className="text-lg">{i.title}</h2><p className="text-sm">{i.project_title} · {i.location_label ?? 'Location to confirm'}</p><p className="text-sm">{i.scheduled_for ? `${fmtDate(i.scheduled_for)} · ${relativeDays(i.scheduled_for)}` : 'Date to confirm'}</p><InspectionChip status={i.status} /><div><Link className="btn btn-primary btn-small" href={`/staff/inspections/${i.id}`}>Open visit</Link></div></li>)}</ul>}</section> : <div className="table-scroll">
        <table className="table table--wide">
          <thead><tr><th>Inspection</th><th>Project</th><th>Date</th>{!agent && <th>Agent</th>}<th>Recorded</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="empty">
                {show === 'check' ? 'No evidence is waiting for a check.'
                  : show === 'done' ? 'No finished inspections yet.'
                  : agent ? 'Nothing assigned to you right now. New visits appear here when an analyst schedules them.'
                  : 'No open inspections. Schedule one from a project’s Inspections tab.'}
              </td></tr>
            )}
            {rows.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/staff/inspections/${i.id}`} className="font-semibold">{i.title}</Link><span className="block font-mono text-xs text-muted">{i.code}</span></td>
                <td className="dim">{i.project_title}<span className="block text-xs text-muted">{i.project_code} · {i.location_label ?? 'TBC'}</span></td>
                <td className="dim">{i.scheduled_for ? <>{fmtDate(i.scheduled_for)}<span className="block text-xs text-muted">{relativeDays(i.scheduled_for)}</span></> : 'TBC'}</td>
                {!agent && <td className="dim">{i.agent_name ?? <span className="text-bad">None</span>}</td>}
                <td className="dim text-sm">{i.findings} findings · {i.evidence} evidence{i.flagged ? <span className="block text-warn">{i.flagged} need a check</span> : null}</td>
                <td><InspectionChip status={i.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  )
}
