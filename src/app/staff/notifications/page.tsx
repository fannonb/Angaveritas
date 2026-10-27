import Link from 'next/link'
import { PageHeader } from '@/components/app/AppTopbar'
import { fmtDateTime } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { listNotifications } from '@/lib/data/misc'
import { markStaffNotificationsReadAction } from './actions'

export const metadata = { title: 'Notifications' }

// Every notification for the signed-in staff member, newest first. Unread items are tinted.
export default async function StaffNotificationsPage() {
  const user = await requireStaff()
  const items = await listNotifications(user.id, 200)
  const unread = items.filter((n) => !n.read_at).length

  return (
    <div className="space-y-5">
      <PageHeader title="Notifications" intro={unread ? `${unread} unread. Open an item to go to it.` : 'You are up to date.'}>
        {unread > 0 && (
          <form action={markStaffNotificationsReadAction}>
            <button className="btn btn-secondary btn-small" type="submit">Mark all as read</button>
          </form>
        )}
      </PageHeader>
      <section className="panel">
        {items.length === 0 ? (
          <p className="empty">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={`px-6 py-4 ${n.read_at ? '' : 'bg-[#fbf8f1]'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {n.href ? <Link href={n.href} className="font-semibold">{n.title}</Link> : <strong>{n.title}</strong>}
                  <span className="text-xs text-muted">{fmtDateTime(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
