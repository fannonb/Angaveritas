import Link from 'next/link'
import { fmtDateTime } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { reportsAwaitingReview } from '@/lib/data/reports'

export const metadata = { title: 'Reviews' }

// Quality control queue: inspections and reports waiting for a second pair of eyes.
export default async function ReviewsPage() {
  const user = await requireStaff(['analyst', 'admin'])
  const [reports, inspections] = await Promise.all([
    reportsAwaitingReview(),
    sql<{ id: string; code: string; title: string; submitted_at: Date; agent_name: string | null; agent_id: string | null; project_code: string; project_title: string; flagged: number }[]>`
      select i.id, i.code, i.title, i.submitted_at, i.agent_id, a.full_name as agent_name, p.code as project_code, p.title as project_title,
        (select count(*)::int from files f where f.inspection_id = i.id and f.integrity_flag is not null) as flagged
      from inspections i join projects p on p.id = i.project_id left join users a on a.id = i.agent_id
      where i.status = 'submitted' order by i.submitted_at`,
  ])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title">Reviews</h1>
        <p className="mt-1 text-ink-2">Nothing reaches a client until an admin has approved it.</p>
      </div>
      <section className="panel">
        <div className="panel-head"><h2>Inspections submitted from the field</h2></div>
        {inspections.length === 0 ? <p className="empty">None waiting.</p> : (
          <ul className="divide-y divide-line">
            {inspections.map((i) => (
              <li key={i.id}>
                <Link href={`/staff/inspections/${i.id}`} className="block px-6 py-3 text-ink no-underline hover:bg-paper">
                  <strong className="block">{i.project_title} · {i.title}</strong>
                  <span className="text-sm text-ink-2">{i.code} · by {i.agent_name ?? '—'} · {fmtDateTime(i.submitted_at)}{i.flagged ? ` · ${i.flagged} evidence item(s) flagged` : ''}{i.agent_id === user.id && user.role !== 'admin' ? ' · yours: needs another reviewer' : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Reports</h2></div>
        {reports.length === 0 ? <p className="empty">None waiting.</p> : (
          <ul className="divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/staff/projects/${r.project_code}/reports/${r.id}`} className="block px-6 py-3 text-ink no-underline hover:bg-paper">
                  <strong className="block">{r.title}</strong>
                  <span className="text-sm text-ink-2">{r.project_code} · {r.project_title} · by {r.author_name} · submitted {fmtDateTime(r.submitted_at)}{user.role !== 'admin' ? ' · needs an admin to approve' : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
