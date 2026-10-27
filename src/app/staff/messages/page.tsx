import Link from 'next/link'
import { fmtDateTime } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { threadsAwaitingReply } from '@/lib/data/messages'

export const metadata = { title: 'Client messages' }

export default async function MessagesInbox() {
  await requireStaff(['analyst', 'admin'])
  const threads = await threadsAwaitingReply()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="app-title">Client messages</h1>
        <p className="mt-1 text-ink-2">Conversations where the client wrote last. Reply on the project or request page.</p>
      </div>
      <section className="panel">
        {threads.length === 0 ? (
          <p className="empty">Every client has a reply.</p>
        ) : (
          <ul className="divide-y divide-line">
            {threads.map((t) => (
              <li key={t.thread}>
                <Link href={t.href} className="block px-6 py-4 text-ink no-underline hover:bg-paper">
                  <span className="flex flex-wrap justify-between gap-2">
                    <strong>{t.client_name}</strong>
                    <span className="text-sm text-muted">{fmtDateTime(t.last_at)}</span>
                  </span>
                  <span className="block text-sm text-ink-2">{t.label}</span>
                  <span className="mt-1 block text-[0.95rem]">{t.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
