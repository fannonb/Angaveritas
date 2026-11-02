import 'server-only'
import { sql } from '@/lib/db'
import { appUrl, sendEmail, teamInboxes } from '@/lib/email'

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
      copyTeam: true,
      subject: n.title,
      text: [`Hello ${u.full_name.split(' ')[0]},`, '', n.body ?? n.title, '', n.href ? `Open: ${appUrl()}${n.href}` : ''].join('\n'),
    })
  }
}

/**
 * Tells the team. Goes in-app to the given staff (or every analyst and admin)
 * and by email to the team inbox.
 */
export async function notifyTeam(n: { title: string; body?: string; href?: string; staffIds?: (string | null | undefined)[]; replyTo?: string }) {
  const ids = n.staffIds?.filter(Boolean) as string[] | undefined
  const team = await sql<{ id: string; role: string }[]>`select id, role from users where role in ('analyst', 'admin') and disabled_at is null`
  const recipients = [...new Set(ids?.length ? [...ids, ...team.filter(p => p.role === 'admin').map(p => p.id)] : team.map(p => p.id))]
  for (const id of new Set(recipients)) {
    await sql`insert into notifications (user_id, title, body, href) values (${id}, ${n.title}, ${n.body ?? null}, ${n.href ?? null})`
  }
  // The team inbox always gets a copy. Each recipient with update emails on gets one too.
  const people = recipients.length
    ? await sql<{ email: string; email_updates: boolean; disabled_at: Date | null }[]>`select email, email_updates, disabled_at from users where id in ${sql(recipients)}`
    : []
  const to = [...new Set([...teamInboxes(), ...people.filter((p) => p.email_updates && !p.disabled_at).map((p) => p.email.trim().toLowerCase())])]
  await sendEmail({
    to,
    subject: n.title,
    replyTo: n.replyTo,
    text: [n.body ?? n.title, '', n.href ? `Open: ${appUrl()}${n.href}` : ''].join('\n'),
  })
}
