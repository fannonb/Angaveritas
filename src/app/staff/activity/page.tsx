import Link from 'next/link'
import { fmtDateTime } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { recentEvents } from '@/lib/data/misc'

export const metadata = { title: 'Audit log' }

export default async function ActivityPage() {
  await requireStaff(['admin'])
  const events = await recentEvents(300)
  return (
    <div className="space-y-5">
      <div>
        <h1 className="app-title">Audit log</h1>
        <p className="mt-1 text-ink-2">The latest 300 events across the platform: sign-ups, proposals, status changes, uploads, downloads, reviews and settings.</p>
      </div>
      <div className="table-scroll">
        <table className="table table--wide">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Where</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="dim whitespace-nowrap text-sm">{fmtDateTime(e.created_at)}</td>
                <td className="dim">{e.actor_name ?? 'System'}</td>
                <td>{e.summary}<span className="block font-mono text-xs text-muted">{e.type}</span></td>
                <td className="dim text-sm">
                  {e.project_code ? <Link href={`/staff/projects/${e.project_code}?tab=activity`}>{e.project_code}</Link> : e.request_reference ? <Link href={`/staff/requests/${e.request_reference}`}>{e.request_reference}</Link> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
