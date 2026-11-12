import 'server-only'
import { sql } from '@/lib/db'
import type { Role } from '@/lib/labels'
import { formatLocation } from '@/lib/location'
import { analystProjectScope, analystRequestScope } from './projects'

export type UserRow = {
  id: string
  email: string
  password_hash: string | null
  full_name: string
  phone: string | null
  whatsapp: string | null
  based_in: string | null
  country_code: string | null
  region_code: string | null
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

export async function createClientAccount(u: { email: string; passwordHash: string | null; fullName: string; phone: string; whatsapp?: string | null; countryCode: string; regionCode: string; timezone?: string }) {
  const [row] = await sql<{ id: string }[]>`
    insert into users (email, password_hash, full_name, phone, whatsapp, based_in, country_code, region_code, timezone, role, consent_at)
    values (${u.email.trim().toLowerCase()}, ${u.passwordHash}, ${u.fullName}, ${u.phone}, ${u.whatsapp ?? null}, ${formatLocation(u.countryCode, u.regionCode)}, ${u.countryCode}, ${u.regionCode},
            ${u.timezone ?? 'Africa/Nairobi'}, 'client', now())
    on conflict (email) do nothing
    returning id`
  return row?.id ?? null
}

export async function createStaffAccount(u: { email: string; fullName: string; role: Role; phone?: string | null }) {
  const [row] = await sql<{ id: string }[]>`
    insert into users (email, full_name, role, phone, email_verified_at)
    values (${u.email.trim().toLowerCase()}, ${u.fullName}, ${u.role}, ${u.phone ?? null}, null)
    on conflict (email) do nothing
    returning id`
  return row?.id ?? null
}

export async function setPassword(userId: string, passwordHash: string) {
  await sql.begin(async tx => {
    await tx`update users set password_hash = ${passwordHash} where id = ${userId} and disabled_at is null`
    await tx`update user_tokens set used_at=now() where user_id=${userId} and used_at is null`
  })
}

export async function updateProfile(userId: string, p: { fullName: string; phone: string | null; whatsapp?: string | null; countryCode: string; regionCode: string; timezone: string }) {
  await sql`
    update users set full_name = ${p.fullName}, phone = ${p.phone}, whatsapp = ${p.whatsapp ?? null}, based_in = ${formatLocation(p.countryCode, p.regionCode)},
      country_code=${p.countryCode},region_code=${p.regionCode},timezone = ${p.timezone}
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
    if (disabled) {
      await tx`delete from sessions where user_id=${userId}`
      await tx`update user_tokens set used_at=now() where user_id=${userId} and used_at is null`
    }
  })
}

function analystClientScope(analystId: string) {
  return sql`(exists (select 1 from projects p where p.client_id=u.id and ${analystProjectScope(analystId)})
    or exists (select 1 from requests r where r.client_id=u.id and ${analystRequestScope(analystId)}))`
}

export async function analystCanReadClient(clientId: string, analystId: string) {
  return (await sql`select 1 from users u where u.id=${clientId} and u.role='client' and ${analystClientScope(analystId)}`).length > 0
}

export async function listClients(search?: string, analystId?: string) {
  const q = search?.trim() ? `%${search.trim().replace(/[%_]/g, '')}%` : null
  return sql<(UserRow & { requests: number; projects: number; active_projects: number })[]>`
    select u.*,
      (select count(*)::int from requests r where r.client_id = u.id and ${analystId ? analystRequestScope(analystId) : sql`true`}) as requests,
      (select count(*)::int from projects p where p.client_id = u.id and ${analystId ? analystProjectScope(analystId) : sql`true`}) as projects,
      (select count(*)::int from projects p where p.client_id = u.id and p.stage <> 'closed' and ${analystId ? analystProjectScope(analystId) : sql`true`}) as active_projects
    from users u
    where u.role = 'client'
      and ${analystId ? analystClientScope(analystId) : sql`true`}
      and ${q ? sql`(u.full_name ilike ${q} or u.email ilike ${q} or u.phone ilike ${q} or u.whatsapp ilike ${q})` : sql`true`}
    order by u.created_at desc
    limit 300`
}

export async function countAdmins() {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from users where role = 'admin' and disabled_at is null`
  return row.n
}
