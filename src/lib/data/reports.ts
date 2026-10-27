import 'server-only'
import { sql, withActor } from '@/lib/db'
import type { ReportStatus } from '@/lib/labels'
import type { ProjectView } from './projects'
import type { FindingRow } from './inspections'
import type { FileRow } from './files'
import { reportContentProblems } from '@/lib/workflow'

export type ReportSnapshot = { project: ProjectView; findings: FindingRow[]; evidence: FileRow[]; report: Omit<ReportRow, 'snapshot'> }

export type ReportRow = {
  id: string
  project_id: string
  inspection_id: string | null
  inspection_code: string | null
  title: string
  status: ReportStatus
  executive_summary: string
  overall_status: 'ok' | 'warn' | 'bad' | null
  recommended_decision: string | null
  recommendations: string | null
  limitations: string
  pdf_file_id: string | null
  author_id: string | null
  author_name: string | null
  reviewer_id: string | null
  reviewer_name: string | null
  submitted_at: Date | null
  published_at: Date | null
  client_rating: number | null
  client_feedback: string | null
  client_viewed_at: Date | null
  created_at: Date
  updated_at: Date
  scope: string
  methodology: string
  supersedes_id: string | null
  withdrawal_reason: string | null
  snapshot: ReportSnapshot | null
}

const base = () => sql`
  select r.*, i.code as inspection_code, a.full_name as author_name, v.full_name as reviewer_name,
    (select rr.first_viewed_at from report_reads rr join projects p on p.client_id=rr.user_id where rr.report_id=r.id and p.id=r.project_id) as client_viewed_at
  from reports r
  left join inspections i on i.id = r.inspection_id
  left join users a on a.id = r.author_id
  left join users v on v.id = r.reviewer_id`

export async function listReports(projectId: string, publishedOnly: boolean) {
  return sql<ReportRow[]>`
    ${base()} where r.project_id = ${projectId} and ${publishedOnly ? sql`r.status = 'published'` : sql`true`}
    order by coalesce(r.published_at, r.created_at) desc`
}

export async function getReport(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [row] = await sql<ReportRow[]>`${base()} where r.id = ${id}`
  return row ?? null
}

export const defaultLimitations =
  'This report reflects the evidence available within the agreed scope at the time of assessment. GPS confirms where observations were made; it is not a cadastral survey or title search. AngaVeritas does not guarantee investment outcomes, and this report does not replace advice from licensed professionals such as surveyors, lawyers, engineers or auditors where their opinion is required.'

export async function validateReportInspection(projectId: string, inspectionId: string | null) {
  if (!inspectionId) return
  const rows = await sql`select 1 from inspections where id = ${inspectionId} and project_id = ${projectId} and status = 'reviewed'`
  if (!rows.length) throw new Error('Choose a reviewed inspection from this project.')
}

export async function createReport(projectId: string, r: { title: string; inspectionId: string | null; supersedesId?: string | null }, authorId: string) {
  await validateReportInspection(projectId, r.inspectionId)
  return withActor(authorId, async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into reports (project_id, inspection_id, title, limitations, author_id, scope, supersedes_id)
      values (${projectId}, ${r.inspectionId}, ${r.title}, ${defaultLimitations}, ${authorId},
        coalesce((select array_to_string(scope_items, E'\n') from proposals where id = (select proposal_id from projects where id = ${projectId})), ''), ${r.supersedesId ?? null}) returning id`
    return row.id
  })
}

export async function updateReport(
  id: string,
  r: { title: string; inspectionId: string | null; executiveSummary: string; overallStatus: 'ok' | 'warn' | 'bad' | null; recommendedDecision: string | null; recommendations: string | null; limitations: string; pdfFileId: string | null; scope: string; methodology: string },
  actorId: string,
) {
  const report = await getReport(id)
  if (!report || report.status !== 'draft') throw new Error('Return the report to draft before editing it.')
  await validateReportInspection(report.project_id, r.inspectionId)
  await withActor(actorId, async tx => tx`
    update reports set title = ${r.title}, inspection_id = ${r.inspectionId}, executive_summary = ${r.executiveSummary},
      overall_status = ${r.overallStatus}, recommended_decision = ${r.recommendedDecision}, recommendations = ${r.recommendations},
      limitations = ${r.limitations}, pdf_file_id = ${r.pdfFileId}, scope = ${r.scope}, methodology = ${r.methodology}
    where id = ${id} and status = 'draft'`)
}

export async function publishReport(id: string, reviewer: { id: string; full_name: string; role: string }, project: ProjectView) {
  return withActor(reviewer.id, async tx => {
    const [r] = await tx<ReportRow[]>`select * from reports where id = ${id} and project_id = ${project.id} for update`
    if (!r || r.status !== 'in_review') throw new Error('Only a report awaiting review can be published.')
    if (reviewer.role !== 'admin') throw new Error('Only an admin can approve and publish a report.')
    const [p] = await tx<ProjectView[]>`select p.*, c.full_name client_name, a.full_name analyst_name, f.full_name agent_name from projects p
      join users c on c.id = p.client_id left join users a on a.id = p.lead_analyst_id left join users f on f.id = p.field_agent_id where p.id = ${project.id} for update of p`
    const inspections = await tx`select * from inspections where project_id = ${p.id} and status = 'reviewed'
      and ${r.inspection_id ? tx`id = ${r.inspection_id}` : tx`true`} order by id for update`
    if (!inspections.length || (r.inspection_id && inspections.length !== 1)) throw new Error('Reports require reviewed inspections from this project.')
    const ids = inspections.map(i => i.id as string)
    const findings = await tx<FindingRow[]>`select * from findings where inspection_id in ${tx(ids)} order by inspection_id, position, id for share`
    const evidence = await tx<FileRow[]>`select f.* from files f where project_id = ${p.id} and inspection_id in ${tx(ids)}
      and category = 'evidence' and status = 'ready' and visible_to_client and sha256 is not null order by id for share`
    const problems = reportContentProblems(r, findings.length, evidence.length)
    if (problems.length) throw new Error(problems.join(' '))
    if (findings.some(f => f.status !== 'unverified' && (!f.evidence_ids?.length || f.evidence_ids.some(e => !evidence.some(item => item.id === e)))))
      throw new Error('Link each verified finding to released evidence from the report inspections.')
    const [author] = await tx`select full_name from users where id = ${r.author_id}`
    const snapshot = { project: p, findings, evidence, report: { ...r, snapshot: undefined, status: 'published', published_at: new Date(), author_name: author?.full_name ?? null, reviewer_name: reviewer.full_name, reviewer_id: reviewer.id } }
    await tx`update reports set status = 'published', published_at = now(), reviewer_id = ${reviewer.id}, snapshot = ${tx.json(snapshot as never)} where id = ${id}`
    for (const file of evidence) await tx`insert into report_evidence (report_id,file_id) values (${id},${file.id})`
    if (r.pdf_file_id) {
      await tx`insert into report_evidence (report_id,file_id) values (${id},${r.pdf_file_id}) on conflict do nothing`
      await tx`update files set visible_to_client = true where id = ${r.pdf_file_id}`
    }
    const health = r.overall_status === 'ok' ? 'on_track' : r.overall_status === 'warn' ? 'at_risk' : 'high_risk'
    await tx`update projects set stage = case when engagement = 'retainer' then 'monitoring'::project_stage else 'delivered'::project_stage end, health = ${health}::health_status where id = ${p.id}`
    return r
  })
}

export async function withdrawReport(id: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new Error('State why the report is being withdrawn.')
  await withActor(actorId, async tx => {
    const [r] = await tx<ReportRow[]>`select * from reports where id = ${id} for update`
    if (!r || r.status !== 'published') throw new Error('Only a published report can be withdrawn.')
    await tx`update reports set status = 'withdrawn', withdrawal_reason = ${reason} where id = ${id}`
    if (r.pdf_file_id) await tx`update files set visible_to_client = false where id = ${r.pdf_file_id}
      and not exists (select 1 from reports where pdf_file_id = ${r.pdf_file_id} and status = 'published')`
    const [latest] = await tx`select overall_status from reports where project_id = ${r.project_id} and status = 'published' order by published_at desc limit 1`
    await tx`update projects set health = ${latest ? latest.overall_status === 'ok' ? 'on_track' : latest.overall_status === 'warn' ? 'at_risk' : 'high_risk' : 'not_assessed'}::health_status,
      stage = case when stage = 'closed' then stage when ${!latest} then 'analysis'::project_stage else stage end where id = ${r.project_id}`
  })
}

export async function setReportStatus(id: string, status: ReportStatus, actorId: string) {
  if (!['draft','in_review'].includes(status)) throw new Error('Use the publication or withdrawal workflow.')
  await withActor(actorId, async sql => sql`
    update reports set status = ${status}::report_status,
      submitted_at = case when ${status}::text = 'in_review' then now() else submitted_at end,
      published_at = case when ${status}::text = 'published' then now() else published_at end,
      reviewer_id = case when ${status}::text = 'published' then ${actorId}::uuid else reviewer_id end
    where id = ${id} and ((${status} = 'draft' and status = 'in_review') or (${status} = 'in_review' and status = 'draft'))`)
}

export async function rateReport(id: string, projectId: string, rating: number, feedback: string | null) {
  await sql`
    update reports set client_rating = ${rating}, client_feedback = ${feedback}
    where id = ${id} and project_id = ${projectId} and status = 'published' and client_reports_unlocked(project_id)`
}

export async function reportsAwaitingReview() {
  return sql<(ReportRow & { project_code: string; project_title: string })[]>`
    select x.*, p.code as project_code, p.title as project_title
    from (${base()} where r.status = 'in_review') x join projects p on p.id = x.project_id
    order by x.submitted_at`
}
