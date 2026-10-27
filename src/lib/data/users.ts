import 'server-only'
import { sql } from '@/lib/db'
import type { Role } from '@/lib/labels'

export type UserRow = {
  id: string
  email: string
  password_hash: string | null
  full_name: string
  phone: string | null
  based_in: string | null
  timezone: string
  role: Role
  email_verified_at: Date | null
  disabled_at: Date | null
  last_login_at: Date | null
  created_at: Date
}

export async function findUserByEmail(email: string) {
  const [row] = await sql<UserRow[]>`select * from users where email = ${email.trim().toLowerCase()}`
  return row ?? null
}

export async function getUserById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [row] = await sql<UserRow[]>`select * from users where id = ${id}`
  return row ?? null
}

export async function createClientAccount(u: { email: string; passwordHash: string; fullName: string; phone: string; basedIn?: string | null; timezone?: string }) {
  const [row] = await sql<{ id: string }[]>`
    insert into users (email, password_hash, full_name, phone, based_in, timezone, role, consent_at)
    values (${u.email.toLowerCase()}, ${u.passwordHash}, ${u.fullName}, ${u.phone}, ${u.basedIn ?? null},
            ${u.timezone ?? 'Africa/Nairobi'}, 'client', now())
    returning id`
  return row.id
}

export async function createStaffAccount(u: { email: string; fullName: string; role: Role; phone?: string | null }) {
  const [row] = await sql<{ id: string }[]>`
    insert into users (email, full_name, role, phone, email_verified_at)
    values (${u.email.toLowerCase()}, ${u.fullName}, ${u.role}, ${u.phone ?? null}, null)
    returning id`
  return row.id
}

export async function setPassword(userId: string, passwordHash: string) {
  await sql`update users set password_hash = ${passwordHash} where id = ${userId}`
}

export async function markEmailVerified(userId: string) {
  await sql`update users set email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`
}

export async function updateProfile(userId: string, p: { fullName: string; phone: string | null; basedIn: string | null; timezone: string }) {
  await sql`
    update users set full_name = ${p.fullName}, phone = ${p.phone}, based_in = ${p.basedIn}, timezone = ${p.timezone}
    where id = ${userId}`
}

export async function listStaff() {
  return sql<UserRow[]>`select * from users where role <> 'client' order by disabled_at nulls first, role, full_name`
}

export async function listAssignableStaff() {
  return sql<{ id: string; full_name: string; role: Role }[]>`
    select id, full_name, role from users where role <> 'client' and disabled_at is null order by full_name`
}

export async function setStaffRole(userId: string, role: Role) {
  await sql.begin(async tx => {
    // Serialise account-access changes before counting admins. Separate page
    // checks can both succeed when two admins submit changes simultaneously.
    await tx`select pg_advisory_xact_lock(710013)`
    const [user] = await tx`select role,disabled_at from users where id=${userId} for update`
    if (!user || user.role === 'client') return
    if (user.role === 'admin' && !user.disabled_at && role !== 'admin') {
      const [other] = await tx`select count(*)::int n from users where role='admin' and disabled_at is null and id<>${userId}`
      if (!other.n) throw new Error('Keep at least one active admin account.')
    }
    await tx`update users set role=${role} where id=${userId}`
  })
}

export async function setDisabled(userId: string, disabled: boolean) {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(710013)`
    const [user] = await tx`select role,disabled_at from users where id=${userId} for update`
    if (!user) return
    if (disabled && user.role === 'admin' && !user.disabled_at) {
      const [other] = await tx`select count(*)::int n from users where role='admin' and disabled_at is null and id<>${userId}`
      if (!other.n) throw new Error('Keep at least one active admin account.')
    }
    await tx`update users set disabled_at=${disabled ? tx`now()` : null} where id=${userId}`
    if (disabled) await tx`delete from sessions where user_id=${userId}`
  })
}

export async function listClients(search?: string) {
  const q = search?.trim() ? `%${search.trim().replace(/[%_]/g, '')}%` : null
  return sql<(UserRow & { requests: number; projects: number; active_projects: number })[]>`
    select u.*,
      (select count(*)::int from requests r where r.client_id = u.id) as requests,
      (select count(*)::int from projects p where p.client_id = u.id) as projects,
      (select count(*)::int from projects p where p.client_id = u.id and p.stage <> 'closed') as active_projects
    from users u
    where u.role = 'client'
      and ${q ? sql`(u.full_name ilike ${q} or u.email ilike ${q} or u.phone ilike ${q})` : sql`true`}
    order by u.created_at desc
    limit 300`
}

export async function countAdmins() {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from users where role = 'admin' and disabled_at is null`
  return row.n
}
