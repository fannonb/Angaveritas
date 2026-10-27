import 'server-only'
import { sql, withActor } from '@/lib/db'
import type { Confidence, FindingStatus, InspectionStatus } from '@/lib/labels'

export type InspectionRow = {
  id: string
  project_id: string
  code: string
  title: string
  status: InspectionStatus
  scheduled_for: string | null
  agent_id: string | null
  agent_name: string | null
  objectives: string | null
  field_notes: string | null
  started_at: Date | null
  submitted_at: Date | null
  reviewed_at: Date | null
  reviewed_by_name: string | null
  created_at: Date
  updated_at: Date
  site_id: string | null
  evidence_count: number
  finding_count: number
}

export type FindingRow = {
  id: string
  inspection_id: string
  position: number
  area: string
  observation: string
  status: FindingStatus
  confidence: Confidence
  evidence_grade: string | null
  action: string | null
  evidence_ids: string[]
  risk_category: string | null
  likelihood: number | null
  impact: number | null
}

const base = () => sql`
  select i.*, a.full_name as agent_name, rv.full_name as reviewed_by_name,
    (select count(*)::int from files f where f.inspection_id = i.id and f.category = 'evidence' and f.status = 'ready') as evidence_count,
    (select count(*)::int from findings x where x.inspection_id = i.id) as finding_count
  from inspections i
  left join users a on a.id = i.agent_id
  left join users rv on rv.id = i.reviewed_by`

export async function listInspections(projectId: string) {
  return sql<InspectionRow[]>`${base()} where i.project_id = ${projectId} order by i.scheduled_for nulls last, i.created_at`
}

export async function getInspection(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [row] = await sql<InspectionRow[]>`${base()} where i.id = ${id}`
  return row ?? null
}

/** Inspections a field agent should act on, soonest first. */
export async function listAgentInspections(agentId: string) {
  return sql<(InspectionRow & { project_code: string; project_title: string; location_label: string | null })[]>`
    select x.*, p.code as project_code, p.title as project_title, p.location_label
    from (${base()} where i.agent_id = ${agentId} and i.status in ('scheduled', 'in_progress')) x
    join projects p on p.id = x.project_id
    order by x.scheduled_for nulls last`
}

export async function createInspection(projectId: string, i: { title: string; scheduledFor: string | null; agentId: string | null; objectives: string | null; siteId?: string | null }, actorId: string) {
  const [row] = await sql<{ id: string; code: string }[]>`
    insert into inspections (project_id, title, scheduled_for, agent_id, objectives, created_by,site_id)
    values (${projectId}, ${i.title}, ${i.scheduledFor}, ${i.agentId}, ${i.objectives}, ${actorId},${i.siteId ?? null})
    returning id, code`
  return row
}

export async function updateInspectionPlan(id: string, i: { title: string; scheduledFor: string | null; agentId: string | null; objectives: string | null }) {
  await sql`
    update inspections set title = ${i.title}, scheduled_for = ${i.scheduledFor}, agent_id = ${i.agentId}, objectives = ${i.objectives}
    where id = ${id}`
}

export async function saveFieldNotes(id: string, notes: string | null, actorId: string) {
  await withActor(actorId, async tx => tx`update inspections set field_notes = ${notes}, field_notes_by = ${actorId} where id = ${id}`)
}

export async function setInspectionStatus(id: string, status: InspectionStatus, actorId: string) {
  await withActor(actorId, async sql => sql`
    update inspections set status = ${status}::inspection_status,
      started_at = case when ${status}::text = 'in_progress' then coalesce(started_at, now()) else started_at end,
      submitted_at = case when ${status}::text = 'submitted' then now() else submitted_at end,
      reviewed_at = case when ${status}::text = 'reviewed' then now() else reviewed_at end,
      reviewed_by = case when ${status}::text = 'reviewed' then ${actorId}::uuid else reviewed_by end
    where id = ${id}`)
}

// ---------- Findings ----------

export async function listFindings(inspectionId: string) {
  return sql<FindingRow[]>`select * from findings where inspection_id = ${inspectionId} order by position, created_at`
}

export async function listProjectFindings(projectId: string, reviewedOnly: boolean) {
  return sql<(FindingRow & { inspection_code: string })[]>`
    select f.*, i.code as inspection_code from findings f join inspections i on i.id = f.inspection_id
    where i.project_id = ${projectId} and ${reviewedOnly ? sql`i.status = 'reviewed'` : sql`true`}
    order by i.scheduled_for nulls last, f.position`
}

export async function addFinding(inspectionId: string, f: Omit<FindingRow, 'id' | 'inspection_id' | 'position'>, actorId: string) {
  await withActor(actorId, async sql => sql`
    insert into findings (inspection_id, position, area, observation, status, confidence, evidence_grade, action, created_by, evidence_ids, risk_category, likelihood, impact)
    values (${inspectionId}, (select coalesce(max(position), 0) + 1 from findings where inspection_id = ${inspectionId}),
      ${f.area}, ${f.observation}, ${f.status}, ${f.confidence}, ${f.evidence_grade}, ${f.action}, ${actorId}, ${f.evidence_ids}, ${f.risk_category}, ${f.likelihood}, ${f.impact})`)
}

export async function updateFinding(id: string, inspectionId: string, f: Omit<FindingRow, 'id' | 'inspection_id' | 'position'>, actorId: string) {
  await withActor(actorId, async sql => sql`
    update findings set area = ${f.area}, observation = ${f.observation}, status = ${f.status}, confidence = ${f.confidence},
      evidence_grade = ${f.evidence_grade}, action = ${f.action}, evidence_ids = ${f.evidence_ids}, risk_category = ${f.risk_category}, likelihood = ${f.likelihood}, impact = ${f.impact}, updated_by = ${actorId}
    where id = ${id} and inspection_id = ${inspectionId}`)
}

export async function deleteFinding(id: string, inspectionId: string, actorId: string) {
  await withActor(actorId, async tx => tx`delete from findings where id = ${id} and inspection_id = ${inspectionId}`)
}

export type InspectionCheck = { id: string; label: string; required: boolean; outcome: 'pending' | 'checked' | 'could_not_check' | 'another_visit'; note: string; evidence_ids: string[] }
export async function listInspectionChecks(inspectionId: string) {
  return sql<InspectionCheck[]>`select * from inspection_checks where inspection_id=${inspectionId} order by required desc,position,id`
}

export async function listInspectionCorrections(inspectionId: string) {
  return sql<{ id: string; reason: string; due_on: string | null; assigned_name: string; requested_name: string; resolved_at: Date | null; resolution: string | null; label: string | null }[]>`
    select c.*, a.full_name assigned_name, r.full_name requested_name, ch.label
    from inspection_corrections c join users a on a.id=c.assigned_to join users r on r.id=c.requested_by
    left join inspection_checks ch on ch.id=c.check_id where c.inspection_id=${inspectionId} order by c.created_at desc`
}
