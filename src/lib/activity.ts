import 'server-only'
import { sql } from '@/lib/db'
import { appUrl, sendEmail, teamInbox } from '@/lib/email'

// One trail for everything that happens: it is the audit log for staff and,
// for events marked clientVisible, the timeline the client sees.

export async function logEvent(e: {
  actorId: string | null
  type: string
  summary: string
  requestId?: string | null
  projectId?: string | null
  clientVisible?: boolean
  data?: Record<string, unknown>
  ipHash?: string | null
}) {
  await sql`
    insert into events (actor_id, request_id, project_id, type, summary, client_visible, data, ip_hash)
    values (${e.actorId}, ${e.requestId ?? null}, ${e.projectId ?? null}, ${e.type}, ${e.summary},
            ${e.clientVisible ?? false}, ${sql.json((e.data ?? {}) as never)}, ${e.ipHash ?? null})`
}

/** In-app notification, plus an email unless email is false. */
export async function notifyUser(userId: string, n: { title: string; body?: string; href?: string; email?: boolean }) {
  const [u] = await sql<{ email: string; full_name: string; disabled_at: Date | null; email_updates: boolean }[]>`
    select email, full_name, disabled_at, email_updates from users where id = ${userId}`
  if (!u || u.disabled_at) return
  await sql`insert into notifications (user_id, title, body, href) values (${userId}, ${n.title}, ${n.body ?? null}, ${n.href ?? null})`
  if (n.email !== false && u.email_updates) {
    await sendEmail({
      to: u.email,
      subject: n.title,
      text: [`Hello ${u.full_name.split(' ')[0]},`, '', n.body ?? n.title, '', n.href ? `Open: ${appUrl()}${n.href}` : ''].join('\n'),
    })
  }
}

/**
 * Tells the team. Goes in-app to the given staff (or every analyst and admin)
 * and by email to the team inbox.
 */
export async function notifyTeam(n: { title: string; body?: string; href?: string; staffIds?: (string | null | undefined)[] }) {
  const ids = n.staffIds?.filter(Boolean) as string[] | undefined
  const recipients = ids?.length
    ? ids
    : (await sql<{ id: string }[]>`select id from users where role in ('analyst', 'admin') and disabled_at is null`).map((r) => r.id)
  for (const id of new Set(recipients)) {
    await sql`insert into notifications (user_id, title, body, href) values (${id}, ${n.title}, ${n.body ?? null}, ${n.href ?? null})`
  }
  await sendEmail({
    to: teamInbox(),
    subject: n.title,
    text: [n.body ?? n.title, '', n.href ? `Open: ${appUrl()}${n.href}` : ''].join('\n'),
  })
}
