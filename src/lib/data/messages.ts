import 'server-only'
import { sql } from '@/lib/db'

export type MessageRow = {
  id: string
  body: string
  internal: boolean
  created_at: Date
  author_id: string
  author_name: string
  author_role: string
}

export type Thread = { projectId: string; requestId?: never } | { requestId: string; projectId?: never }
const threadKey = (t: Thread) => (t.projectId ? `p:${t.projectId}` : `r:${t.requestId}`)
// A request joins a project only when both records have the same client.
// The same canonical thread powers history, unread counts and the staff inbox.
const resolvedMessages = () => sql`select m.*, coalesce(m.project_id, linked.id) as conversation_project_id
  from messages m left join requests request on request.id=m.request_id
  left join projects linked on linked.client_id=request.client_id
    and (linked.request_id=request.id or linked.id=request.parent_project_id)`
const where = (t: Thread) => (t.projectId
  ? sql`m.conversation_project_id = ${t.projectId}`
  : sql`(m.request_id = ${t.requestId!} or m.conversation_project_id = (
      select p.id from requests r join projects p on p.client_id=r.client_id
        and (p.request_id=r.id or p.id=r.parent_project_id) where r.id=${t.requestId!} limit 1))`)

export async function listMessages(t: Thread, includeInternal: boolean) {
  return sql<MessageRow[]>`
    select m.id, m.body, m.internal, m.created_at, m.author_id, u.full_name as author_name, u.role as author_role
    from (${resolvedMessages()}) m join users u on u.id = m.author_id
    where ${where(t)} and ${includeInternal ? sql`true` : sql`not m.internal`}
    order by m.created_at`
}

export async function postMessage(t: Thread, authorId: string, body: string, internal: boolean) {
  await sql`
    insert into messages (project_id, request_id, author_id, body, internal)
    values (${t.projectId ?? null}, ${t.requestId ?? null}, ${authorId}, ${body}, ${internal})`
  await markRead(t, authorId)
}

export async function markRead(t: Thread, userId: string) {
  // Keep each original message key read so older notification links agree.
  const keys = await sql<{ thread: string }[]>`select distinct case when m.project_id is not null then 'p:'||m.project_id else 'r:'||m.request_id end as thread
    from (${resolvedMessages()}) m where ${where(t)}`
  for (const key of [...new Set([threadKey(t), ...keys.map(k => k.thread)])]) {
  await sql`
    insert into message_reads (user_id, thread, read_at) values (${userId}, ${key}, now())
    on conflict (user_id, thread) do update set read_at = now()`
  }
}

/** Unread messages from staff, across every thread a client owns. */
export async function clientUnreadCount(clientId: string) {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n
    from messages m
    left join projects p on p.id = m.project_id
    left join requests r on r.id = m.request_id
    left join message_reads mr on mr.user_id = ${clientId}
      and mr.thread = case when m.project_id is not null then 'p:' || m.project_id else 'r:' || m.request_id end
    where not m.internal and m.author_id <> ${clientId}
      and (p.client_id = ${clientId} or r.client_id = ${clientId})
      and (mr.read_at is null or m.created_at > mr.read_at)`
  return row.n
}

/** Link to the client's most recent thread with an unread message, so the dashboard opens the conversation itself. */
export async function clientLatestUnreadHref(clientId: string) {
  const [row] = await sql<{ project_code: string | null; request_reference: string | null }[]>`
    select p.code as project_code, r.reference as request_reference
    from (${resolvedMessages()}) m
    left join projects p on p.id = m.conversation_project_id
    left join requests r on r.id = m.request_id
    left join message_reads mr on mr.user_id = ${clientId}
      and mr.thread = case when m.project_id is not null then 'p:' || m.project_id else 'r:' || m.request_id end
    where not m.internal and m.author_id <> ${clientId}
      and (p.client_id = ${clientId} or r.client_id = ${clientId})
      and (mr.read_at is null or m.created_at > mr.read_at)
    order by m.created_at desc
    limit 1`
  if (row?.project_code) return `/portal/projects/${row.project_code}?tab=messages`
  if (row?.request_reference) return `/portal/requests/${row.request_reference}#messages`
  return '/portal/projects'
}

/** Threads where the client wrote last and the team hasn't replied: the staff inbox. */
export async function threadsAwaitingReply() {
  return sql<{ thread: string; project_id: string | null; request_id: string | null; label: string; project_stage: string | null; client_name: string; last_at: Date; body: string; href: string }[]>`
    with last as (
      select distinct on (coalesce(m.conversation_project_id, m.request_id))
        m.conversation_project_id as project_id, m.request_id, m.author_id, m.body, m.created_at
      from (${resolvedMessages()}) m where not m.internal
      order by coalesce(m.conversation_project_id, m.request_id), m.created_at desc, m.id desc
    )
    select
      case when l.project_id is not null then 'p:' || l.project_id else 'r:' || l.request_id end as thread,
      l.project_id, l.request_id, p.stage as project_stage,
      coalesce(p.code || ' · ' || p.title, r.reference || ' · ' || r.title) as label,
      u.full_name as client_name, l.created_at as last_at, left(l.body, 160) as body,
      case when l.project_id is not null then '/staff/projects/' || p.code || '?tab=messages' else '/staff/requests/' || r.reference || '#messages' end as href
    from last l
    join users u on u.id = l.author_id
    left join projects p on p.id = l.project_id
    left join requests r on r.id = l.request_id
    where u.role = 'client'
    order by l.created_at desc
    limit 50`
}
