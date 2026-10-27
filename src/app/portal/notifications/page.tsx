import Link from 'next/link'
import Pager from '@/components/app/Pager'
import { fmtDateTime } from '@/components/app/format'
import { requireClient } from '@/lib/auth/session'
import { notificationsPage, unreadNotificationCount } from '@/lib/data/misc'
import { markAllReadAction } from '../actions'

export const metadata = { title: 'Updates' }

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireClient()
  const query = await searchParams
  const [{ items, total, page, pages }, unread] = await Promise.all([
    notificationsPage(user.id, Number(query.page) || 1),
    unreadNotificationCount(user.id),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="app-title">Updates</h1>
          <p className="mt-1 text-ink-2">Proposals, visit dates, new evidence and reports. We also email you each of these.</p>
        </div>
        {unread > 0 && (
          <form action={markAllReadAction}>
            <button className="btn btn-secondary btn-small" type="submit">Mark all as read</button>
          </form>
        )}
      </div>
      <section className="panel">
        {total === 0 ? (
          <p className="empty">No updates yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id} className={`px-6 py-4 ${n.read_at ? '' : 'bg-[#fbf8f1]'}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    {n.href ? <Link href={n.href} className="font-semibold">{n.title}</Link> : <strong>{n.title}</strong>}
                    <span className="text-xs text-muted">{fmtDateTime(n.created_at, user.timezone)}</span>
                  </div>
                  {n.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{n.body}</p>}
                </li>
              ))}
            </ul>
            <div className="px-6 py-4">
              <Pager page={page} pages={pages} label="Update pages" hrefFor={(n) => `/portal/notifications?page=${n}`} />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
