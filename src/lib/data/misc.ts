import 'server-only'
import { sql } from '@/lib/db'

// ---------- Notifications ----------

export type NotificationRow = { id: number; title: string; body: string | null; href: string | null; read_at: Date | null; created_at: Date }

export async function listNotifications(userId: string, limit = 30) {
  return sql<NotificationRow[]>`select * from notifications where user_id = ${userId} order by created_at desc limit ${limit}`
}

/** One page of a person's notifications, newest first. */
export async function notificationsPage(userId: string, page = 1, pageSize = 10) {
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from notifications where user_id = ${userId}`
  const pages = Math.max(1, Math.ceil(count.n / pageSize))
  const current = Math.min(Math.max(1, page), pages)
  const items = await sql<NotificationRow[]>`select * from notifications where user_id = ${userId} order by created_at desc limit ${pageSize} offset ${(current - 1) * pageSize}`
  return { items, total: count.n, page: current, pages }
}

export async function unreadNotificationCount(userId: string) {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from notifications where user_id = ${userId} and read_at is null`
  return row.n
}

export async function markNotificationsRead(userId: string, id?: number) {
  if (id) await sql`update notifications set read_at = now() where user_id = ${userId} and id = ${id} and read_at is null`
  else await sql`update notifications set read_at = now() where user_id = ${userId} and read_at is null`
}

// ---------- Website enquiries ----------

export type EnquiryRow = {
  id: string
  name: string
  email: string
  phone: string | null
  preferred_contact: string | null
  based_in: string | null
  company: string | null
  service: string | null
  project_location: string | null
  message: string
  status: 'new' | 'replied' | 'converted' | 'closed'
  user_id: string | null
  created_at: Date
  owner_id: string | null
  next_follow_up: string | null
  internal_notes: string | null
  request_id: string | null
}

export async function createEnquiry(e: Omit<EnquiryRow, 'id' | 'status' | 'created_at' | 'user_id' | 'owner_id' | 'next_follow_up' | 'internal_notes' | 'request_id'> & { userId: string | null; ipHash: string }) {
  const [row] = await sql<{ id: string }[]>`
    insert into enquiries (name, email, phone, preferred_contact, based_in, company, service, project_location, message, user_id, ip_hash, consent_at)
    values (${e.name}, ${e.email}, ${e.phone}, ${e.preferred_contact}, ${e.based_in}, ${e.company}, ${e.service},
      ${e.project_location}, ${e.message}, ${e.userId}, ${e.ipHash}, now())
    returning id`
  return row.id
}

export async function recentEnquiriesFromIp(ipHash: string) {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from enquiries where ip_hash = ${ipHash} and created_at > now() - interval '1 hour'`
  return row.n
}

export async function listEnquiries(status: EnquiryRow['status'] | 'open' | 'all' = 'open') {
  return sql<EnquiryRow[]>`
    select * from enquiries
    where ${status === 'all' ? sql`true` : status === 'open' ? sql`status = 'new'` : sql`status = ${status}`}
    order by created_at desc limit 300`
}

export async function setEnquiryStatus(id: string, status: EnquiryRow['status']) {
  await sql`update enquiries set status = ${status} where id = ${id}`
}

// ---------- Audit log ----------

export async function recentEvents(limit = 100) {
  return sql<{ id: number; type: string; summary: string; created_at: Date; actor_name: string | null; project_code: string | null; request_reference: string | null }[]>`
    select e.id, e.type, e.summary, e.created_at, u.full_name as actor_name, p.code as project_code, r.reference as request_reference
    from events e
    left join users u on u.id = e.actor_id
    left join projects p on p.id = e.project_id
    left join requests r on r.id = e.request_id
    order by e.created_at desc limit ${limit}`
}
