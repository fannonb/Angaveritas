import 'server-only'
import { sql, withActor } from '@/lib/db'
import type { SessionUser } from '@/lib/auth/session'
import type { Health, ProjectStage } from '@/lib/labels'
import { TECHNICAL_EVENT_PATTERN } from '@/lib/workflow'

export type ProjectRow = {
  id: string
  code: string
  client_id: string
  request_id: string | null
  proposal_id: string | null
  title: string
  service_code: string | null
  service_name: string | null
  engagement: 'one_off' | 'retainer'
  stage: ProjectStage
  health: Health
  health_note: string | null
  location_label: string | null
  county: string | null
  location_lat: number | null
  location_lng: number | null
  site_directions: string | null
  site_access_notes: string | null
  claims: string | null
  concerns: string | null
  investment_value_kes: string | null
  onboarding_submitted_at: Date | null
  data_consent_at: Date | null
  lead_analyst_id: string | null
  field_agent_id: string | null
  planning_notes: string | null
  contract_value_kes: number | null
  payment_status: string
  nda_status: 'none' | 'requested' | 'prepared' | 'signed'
  start_date: string | null
  due_date: string | null
  closed_at: Date | null
  created_at: Date
  updated_at: Date
}

export type ProjectView = ProjectRow & {
  client_name: string
  client_email: string
  client_phone: string | null
  client_based_in: string | null
  analyst_name: string | null
  agent_name: string | null
  request_reference: string | null
  next_inspection: string | null
  published_reports: number
}

const view = () => sql`
  select p.*,
    c.full_name as client_name, c.email as client_email, c.phone as client_phone, c.based_in as client_based_in,
    a.full_name as analyst_name, f.full_name as agent_name, r.reference as request_reference,
    (select min(i.scheduled_for)::text from inspections i
       where i.project_id = p.id and i.status in ('scheduled', 'in_progress') and i.scheduled_for >= current_date) as next_inspection,
    (select count(*)::int from reports rp where rp.project_id = p.id and rp.status = 'published') as published_reports
  from projects p
  join users c on c.id = p.client_id
  left join users a on a.id = p.lead_analyst_id
  left join users f on f.id = p.field_agent_id
  left join requests r on r.id = p.request_id`

// ---------- Access ----------

export type ProjectAccess = {
  project: ProjectView
  isClient: boolean
  /** Analysts and admins: full control. */
  canManage: boolean
  /** Field agents on this project, plus managers: can record fieldwork. */
  canFieldwork: boolean
}

/**
 * Loads a project if — and only if — this user may see it:
 * the client who owns it, a field agent assigned to it (or to one of its
 * inspections), or any analyst or admin.
 */
export async function projectFor(user: Pick<SessionUser, 'id' | 'role'>, id: string): Promise<ProjectAccess | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [project] = await sql<ProjectView[]>`${view()} where p.id = ${id}`
  if (!project) return null
  if (user.role === 'client') {
    return project.client_id === user.id ? { project, isClient: true, canManage: false, canFieldwork: false } : null
  }
  if (user.role === 'analyst' || user.role === 'admin') return { project, isClient: false, canManage: true, canFieldwork: true }
  // field agent
  const assigned =
    project.field_agent_id === user.id ||
    (await sql`select 1 from inspections where project_id = ${id} and agent_id = ${user.id} limit 1`).length > 0
  return assigned ? { project, isClient: false, canManage: false, canFieldwork: true } : null
}

export async function projectByCodeFor(user: SessionUser, code: string) {
  const [row] = await sql<{ id: string }[]>`select id from projects where code = ${code}`
  return row ? projectFor(user, row.id) : null
}

// ---------- Lists ----------

export async function listProjectsForClient(clientId: string) {
  // Open work first (newest first), then completed work by when it was completed.
  return sql<ProjectView[]>`${view()} where p.client_id = ${clientId} order by (p.stage = 'closed'), coalesce(p.closed_at, p.created_at) desc`
}

// Matches the definitions behind the staff overview counts in data/dashboard.ts.
export const projectNeeds = { at_risk: 'At risk', unassigned: 'Need a team assigned', unpaid: 'Awaiting payment', balance: 'Balance outstanding' } as const
export type ProjectNeed = keyof typeof projectNeeds

export async function listProjectsForStaff(user: SessionUser, opts: { stage?: ProjectStage | 'active' | 'all'; search?: string; clientId?: string; need?: ProjectNeed } = {}) {
  const stage = opts.stage ?? 'active'
  const q = opts.search?.trim() ? `%${opts.search.trim().replace(/[%_]/g, '')}%` : null
  return sql<ProjectView[]>`
    ${view()}
    where ${stage === 'all' ? sql`true` : stage === 'active' ? sql`p.stage <> 'closed'` : sql`p.stage = ${stage}`}
      and ${opts.clientId ? sql`p.client_id = ${opts.clientId}` : sql`true`}
      and ${
        opts.need === 'at_risk' ? sql`p.health in ('at_risk', 'high_risk')`
        : opts.need === 'unassigned' ? sql`p.stage in ('onboarding', 'planning', 'fieldwork') and (p.field_agent_id is null or p.lead_analyst_id is null)`
        : opts.need === 'unpaid' ? sql`p.payment_status = 'awaiting_payment'`
        : opts.need === 'balance' ? sql`p.payment_status in ('deposit_received', 'paid') and exists(
            select 1 from invoices i where i.project_id = p.id and i.status = 'issued'
              and i.amount_kes > coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments pay where pay.invoice_id = i.id), 0))`
        : sql`true`
      }
      and ${
        user.role === 'field_agent'
          ? sql`(p.field_agent_id = ${user.id} or exists (select 1 from inspections i where i.project_id = p.id and i.agent_id = ${user.id}))`
          : sql`true`
      }
      and ${q ? sql`(p.code ilike ${q} or p.title ilike ${q} or c.full_name ilike ${q} or p.location_label ilike ${q} or p.county ilike ${q})` : sql`true`}
    order by case p.health when 'high_risk' then 0 when 'at_risk' then 1 else 2 end, p.updated_at desc
    limit 300`
}

export async function projectStageCounts() {
  const rows = await sql<{ stage: ProjectStage; n: number }[]>`select stage, count(*)::int as n from projects group by stage`
  return Object.fromEntries(rows.map((r) => [r.stage, r.n])) as Partial<Record<ProjectStage, number>>
}

// ---------- Client onboarding (stage 4) ----------

export async function saveOnboarding(
  projectId: string,
  clientId: string,
  o: { title: string; locationLabel: string | null; county: string | null; siteDirections: string | null; siteAccessNotes: string | null; claims: string | null; concerns: string | null; investmentValueKes: number | null },
) {
  await withActor(clientId, async sql => sql`
    update projects set title = ${o.title}, location_label = ${o.locationLabel}, county = ${o.county},
      site_directions = ${o.siteDirections}, site_access_notes = ${o.siteAccessNotes}, claims = ${o.claims},
      concerns = ${o.concerns}, investment_value_kes = ${o.investmentValueKes}
    where id = ${projectId} and client_id = ${clientId}`)
}

export async function submitOnboarding(projectId: string, clientId: string) {
  return withActor(clientId, async sql => {
  const [row] = await sql<{ id: string }[]>`
    update projects set onboarding_submitted_at = now(), data_consent_at = coalesce(data_consent_at, now()),
      stage = case when stage = 'onboarding' then 'planning'::project_stage else stage end
    where id = ${projectId} and client_id = ${clientId} and (onboarding_submitted_at is null or data_consent_at is null)
    returning id`
  return !!row
  })
}

// ---------- Contacts ----------

export type ContactRow = { id: string; name: string; role: string | null; phone: string | null; email: string | null; notes: string | null; may_contact: boolean; created_at: Date }

export async function listContacts(projectId: string) {
  return sql<ContactRow[]>`select * from project_contacts where project_id = ${projectId} order by created_at`
}

export async function addContact(projectId: string, c: { name: string; role: string | null; phone: string | null; email: string | null; notes: string | null; mayContact: boolean }, actorId: string) {
  await sql`
    insert into project_contacts (project_id, name, role, phone, email, notes, may_contact, created_by)
    values (${projectId}, ${c.name}, ${c.role}, ${c.phone}, ${c.email}, ${c.notes}, ${c.mayContact}, ${actorId})`
}

export async function removeContact(projectId: string, contactId: string) {
  await sql`delete from project_contacts where id = ${contactId} and project_id = ${projectId}`
}

// ---------- Staff management ----------

export async function updateProjectStaff(
  projectId: string,
  u: {
    title: string
    stage: ProjectStage
    health: Health
    healthNote: string | null
    engagement: 'one_off' | 'retainer'
    leadAnalystId: string | null
    fieldAgentId: string | null
    startDate: string | null
    dueDate: string | null
    paymentStatus: string
    planningNotes: string | null
    locationLabel: string | null
    county: string | null
    lat: number | null
    lng: number | null
  },
  actorId: string,
) {
  return withActor(actorId, async sql => {
  const [prev] = await sql<ProjectRow[]>`select * from projects where id = ${projectId}`
  await sql`
    update projects set title = ${u.title}, stage = ${u.stage}, health = ${u.health}, health_note = ${u.healthNote},
      engagement = ${u.engagement}, lead_analyst_id = ${u.leadAnalystId}, field_agent_id = ${u.fieldAgentId},
      start_date = ${u.startDate}, due_date = ${u.dueDate}, payment_status = ${u.paymentStatus},
      payment_status_set_at = ${prev.payment_status !== u.paymentStatus ? sql`now()` : sql`payment_status_set_at`},
      planning_notes = ${u.planningNotes}, location_label = ${u.locationLabel}, county = ${u.county},
      location_lat = ${u.lat}, location_lng = ${u.lng},
      closed_at = ${u.stage === 'closed' ? sql`coalesce(closed_at, now())` : null}
    where id = ${projectId}`
  return prev
  })
}

/**
 * Assigns the working team. Changing the field agent also moves visits that
 * are still open and were unassigned or belonged to the previous project
 * agent, so the new agent can actually open the work. Submitted, reviewed and
 * cancelled visits keep their original agent for the record.
 */
export async function assignProjectTeam(
  projectId: string,
  team: { leadAnalystId: string | null; fieldAgentId: string | null },
  actorId: string,
) {
  return withActor(actorId, async (tx) => {
    const [prev] = await tx<ProjectRow[]>`select * from projects where id = ${projectId} for update`
    if (!prev) throw new Error('Project not found.')
    await tx`
      update projects set lead_analyst_id = ${team.leadAnalystId}, field_agent_id = ${team.fieldAgentId}
      where id = ${projectId}`
    let moved: { id: string; code: string }[] = []
    if (team.fieldAgentId && prev.field_agent_id !== team.fieldAgentId) {
      moved = await tx<{ id: string; code: string }[]>`
        update inspections set agent_id = ${team.fieldAgentId}
        where project_id = ${projectId}
          and status in ('scheduled', 'in_progress')
          and (agent_id is null or agent_id = ${prev.field_agent_id})
        returning id, code`
    }
    return { prev, moved }
  })
}

export async function setProjectStage(projectId: string, stage: ProjectStage) {
  await sql`update projects set stage = ${stage} where id = ${projectId}`
}

// ---------- Timeline ----------

export type EventRow = { id: number; type: string; summary: string; created_at: Date; actor_name: string | null; actor_role: string | null; client_visible: boolean }

export async function projectEvents(projectId: string, clientView: boolean, requestId?: string | null) {
  return sql<EventRow[]>`
    select e.id, e.type, e.summary, e.created_at, e.client_visible, u.full_name as actor_name, u.role as actor_role
    from events e left join users u on u.id = e.actor_id
    where (e.project_id = ${projectId} ${requestId ? sql`or e.request_id = ${requestId}` : sql``})
      and ${clientView ? sql`e.client_visible` : sql`true`}
      and e.type !~ ${TECHNICAL_EVENT_PATTERN}
    order by e.created_at desc, e.id desc
    limit 200`
}

export async function requestEvents(requestId: string, clientView: boolean) {
  return sql<EventRow[]>`
    select e.id, e.type, e.summary, e.created_at, e.client_visible, u.full_name as actor_name, u.role as actor_role
    from events e left join users u on u.id = e.actor_id
    where e.request_id = ${requestId} and ${clientView ? sql`e.client_visible` : sql`true`}
      and e.type !~ ${TECHNICAL_EVENT_PATTERN}
    order by e.created_at desc, e.id desc
    limit 200`
}
