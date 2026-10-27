import 'server-only'
import exifr from 'exifr'
import { sql, withActor } from '@/lib/db'
import { haversineKm } from '@/lib/geo'
import { inspectObject, scanObject } from '@/lib/storage'
import type { SessionUser } from '@/lib/auth/session'
import { fieldCollectionProblem, filePermission } from '@/lib/workflow'
import { projectFor } from './projects'
import { getInspection } from './inspections'
import { uploadProblem } from '@/lib/upload-validation'

export type FileCategory = 'evidence' | 'client_document' | 'report' | 'internal' | 'agreement'
export type MediaType = 'photo' | 'video' | 'drone' | 'document' | 'other'

export type FileRow = {
  id: string
  project_id: string | null
  request_id: string | null
  inspection_id: string | null
  inspection_code: string | null
  category: FileCategory
  media_type: MediaType
  evidence_code: string | null
  filename: string
  mime: string
  size_bytes: string
  storage_key: string
  status: 'pending' | 'ready' | 'failed'
  sha256: string | null
  caption: string | null
  gps_lat: number | null
  gps_lng: number | null
  taken_at: Date | null
  integrity_flag: string | null
  visible_to_client: boolean
  uploaded_by: string
  uploader_name: string
  uploader_role: string
  created_at: Date
  field_access: boolean
  qa_note: string | null
  qa_by: string | null
  qa_at: Date | null
}

/** Allowed uploads. Anything else is refused before a byte is stored. */
export const allowedMime: Record<string, MediaType> = {
  'image/jpeg': 'photo',
  'image/png': 'photo',
  'image/webp': 'photo',
  'image/heic': 'photo',
  'image/heif': 'photo',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
}

const base = () => sql`
  select f.*, i.code as inspection_code, u.full_name as uploader_name, u.role as uploader_role
  from files f join users u on u.id = f.uploaded_by left join inspections i on i.id = f.inspection_id`

export async function createPendingFile(f: {
  projectId: string | null
  requestId?: string | null
  inspectionId: string | null
  category: FileCategory
  mediaType: MediaType
  filename: string
  mime: string
  size: number
  storageKey: string
  caption: string | null
  visibleToClient: boolean
  uploadedBy: string
}) {
  const [row] = await sql<{ id: string }[]>`
    insert into files (project_id, request_id, inspection_id, category, media_type, filename, mime, size_bytes, storage_key,
      caption, visible_to_client, uploaded_by)
    values (${f.projectId}, ${f.requestId ?? null}, ${f.inspectionId}, ${f.category}, ${f.mediaType}, ${f.filename}, ${f.mime},
      ${f.size}, ${f.storageKey}, ${f.caption}, ${f.visibleToClient}, ${f.uploadedBy})
    returning id`
  return row.id
}

export async function getFile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [row] = await sql<FileRow[]>`${base()} where f.id = ${id}`
  return row ?? null
}

export async function mayReadFile(user: Pick<SessionUser, 'id' | 'role'>, file: FileRow) {
  if (!file.project_id || file.status !== 'ready') return false
  const [project] = await sql`select client_id, field_agent_id from projects where id = ${file.project_id}`
  if (!project) return false
  if (user.role === 'client' && file.category === 'evidence') {
    const released = await sql`select 1 where
      exists(select 1 from inspections where id=${file.inspection_id} and project_id=${file.project_id} and status='reviewed')
      or exists(select 1 from report_evidence e join reports r on r.id=e.report_id where e.file_id=${file.id} and r.status='published')`
    if (!released.length) return false
  }
  // A client cannot open a published report, or the evidence attached to it, until the balance is paid.
  if (user.role === 'client') {
    const linked = await sql`select 1 from reports r where r.project_id = ${file.project_id} and r.status = 'published'
      and (r.pdf_file_id = ${file.id} or exists(select 1 from report_evidence e where e.report_id = r.id and e.file_id = ${file.id}))`
    if (linked.length) {
      const [open] = await sql<{ unlocked: boolean }[]>`select client_reports_unlocked(${file.project_id}) as unlocked`
      if (!open?.unlocked) return false
    }
  }
  const assigned = user.role === 'field_agent' && file.inspection_id
    ? (await sql`select 1 from inspections where id = ${file.inspection_id} and project_id = ${file.project_id} and
        (agent_id = ${user.id} or (agent_id is null and ${project.field_agent_id === user.id}))`).length > 0 : false
  const projectAssigned = user.role === 'field_agent' && (project.field_agent_id === user.id ||
    (await sql`select 1 from inspections where project_id = ${file.project_id} and agent_id = ${user.id}`).length > 0)
  const published = file.category === 'report' &&
    (await sql`select 1 from reports where project_id = ${file.project_id} and pdf_file_id = ${file.id} and status = 'published' and snapshot is not null`).length > 0
  if (user.role === 'field_agent' && !projectAssigned) return false
  return filePermission(user, file, { ownsProject: project.client_id === user.id, assignedInspection: !!assigned, publishedReport: published })
}

/** Recheck permission at every upload step; registration is not a permanent grant. */
export async function uploadWriteProblem(user: Pick<SessionUser, 'id' | 'role'>, file: FileRow) {
  if (file.uploaded_by !== user.id || !file.project_id) return 'Upload not found.'
  const access = await projectFor(user, file.project_id)
  if (!access) return 'Project access has changed.'
  if (access.isClient) return file.category === 'client_document' ? null : 'Not allowed.'
  if (user.role === 'field_agent' && file.category !== 'evidence') return 'Not allowed.'
  if (file.category === 'evidence') {
    const inspection = file.inspection_id ? await getInspection(file.inspection_id) : null
    if (!inspection || inspection.project_id !== file.project_id) return 'Inspection not found.'
    if (user.role === 'field_agent' && inspection.agent_id !== user.id) return 'Inspection assignment has changed.'
    return fieldCollectionProblem(access.project, inspection)
  }
  return access.canManage ? null : 'Not allowed.'
}

/**
 * Called once the bytes are stored: records the hash (tamper evidence), reads
 * GPS and capture time from photo metadata, and flags evidence that needs a
 * manual check before it can support a finding.
 */
export async function completeFile(id: string) {
  const f = await getFile(id)
  if (!f || f.status !== 'pending') throw new Error('Upload not found.')
  let info: Awaited<ReturnType<typeof inspectObject>>
  try {
    info = await inspectObject(f.storage_key)
  } catch {
    await sql`update files set status = 'failed' where id = ${id}`
    throw new Error('The upload did not arrive. Please try again.')
  }

  let lat: number | null = null
  const problem = uploadProblem(f.mime, Number(f.size_bytes), info.size, info.head)
  if (problem) {
    await sql`update files set status = 'failed' where id = ${id}`
    throw new Error(problem)
  }
  try { await scanObject(f.storage_key) } catch (e) {
    await sql`update files set status='failed' where id=${id}`
    throw e
  }
  let lng: number | null = null
  let takenAt: Date | null = null
  if (f.media_type === 'photo' || f.media_type === 'drone') {
    try {
      const meta = await exifr.parse(info.head, { gps: true, exif: true, tiff: true, xmp: false, icc: false, iptc: false })
      if (meta && Number.isFinite(meta.latitude) && Number.isFinite(meta.longitude)) {
        lat = meta.latitude
        lng = meta.longitude
      }
      const t = meta?.DateTimeOriginal ?? meta?.CreateDate
      if (t instanceof Date && !Number.isNaN(t.getTime())) takenAt = t
    } catch {
      // Not every image has readable metadata; that is flagged below.
    }
  }

  const flags: string[] = []
  if (f.category === 'evidence' && (f.media_type === 'photo' || f.media_type === 'drone')) {
    if (takenAt && takenAt.getTime() > Date.now() + 86400_000) flags.push('Capture time is in the future')
    if (takenAt && Date.now() - takenAt.getTime() > 180 * 86400_000) flags.push(`Captured ${takenAt.toISOString().slice(0, 10)}, over 180 days before upload`)
    if (lat !== null && lng !== null && f.project_id) {
      const [p] = await sql<{ location_lat: number | null; location_lng: number | null }[]>`
        select coalesce(s.lat,p.location_lat) location_lat, coalesce(s.lng,p.location_lng) location_lng from projects p
          left join inspections i on i.id=${f.inspection_id} and i.project_id=p.id left join project_sites s on s.id=i.site_id where p.id = ${f.project_id}`
      if (p?.location_lat != null && p.location_lng != null) {
        const km = haversineKm({ lat, lng }, { lat: p.location_lat, lng: p.location_lng })
        if (km > 10) flags.push(`Taken ${km.toFixed(1)} km from the recorded site location`)
      }
    }
  }

  await sql`
    update files set status = 'ready', size_bytes = ${info.size}, sha256 = ${info.sha256},
      gps_lat = ${lat}, gps_lng = ${lng}, taken_at = ${takenAt}, integrity_flag = ${flags.length ? flags.join('; ') : null},
      evidence_code = case when category = 'evidence' then 'AV-E-' || lpad(nextval('evidence_number_seq')::text, 5, '0') else null end
    where id = ${id}`
  return getFile(id)
}

export async function listProjectFiles(projectId: string, opts: { clientView: boolean; category?: FileCategory; inspectionId?: string; fieldAgentId?: string }) {
  return sql<FileRow[]>`
    ${base()}
    where f.project_id = ${projectId} and f.status = 'ready'
      and ${opts.clientView ? sql`f.category <> 'internal' and (f.visible_to_client or f.uploaded_by = (select client_id from projects where id = ${projectId}))
        and (f.category <> 'evidence' or i.status='reviewed' or exists (
          select 1 from report_evidence e join reports r on r.id=e.report_id where e.file_id=f.id and r.status='published'))
        and (f.category <> 'report' or exists(select 1 from reports r where r.pdf_file_id=f.id and r.status='published' and r.snapshot is not null))` : sql`true`}
      and ${opts.category ? sql`f.category = ${opts.category}` : sql`true`}
      and ${opts.inspectionId ? sql`f.inspection_id = ${opts.inspectionId}` : sql`true`}
      and ${opts.fieldAgentId ? sql`((f.category = 'client_document' and f.field_access) or (f.category = 'evidence' and exists (
        select 1 from inspections i join projects p on p.id = i.project_id where i.id = f.inspection_id and i.project_id = ${projectId}
          and (i.agent_id = ${opts.fieldAgentId} or (i.agent_id is null and p.field_agent_id = ${opts.fieldAgentId})))))` : sql`true`}
    order by f.created_at desc`
}

export async function updateFileMeta(id: string, m: { caption: string | null; visibleToClient: boolean; fieldAccess: boolean; qaNote: string | null }, actorId: string) {
  const f = await getFile(id)
  if (!f) return
  if (m.visibleToClient && !f.visible_to_client && f.category === 'evidence') {
    const [insp] = f.inspection_id ? await sql`select status, agent_id from inspections where id = ${f.inspection_id}` : []
    if (!insp || insp.status !== 'reviewed') throw new Error('Review the inspection before releasing evidence.')
    if (!m.qaNote?.trim()) throw new Error('Record the evidence review and why it is safe to release.')
    const [actor] = await sql<{ role: string }[]>`select role from users where id = ${actorId}`
    if (actor?.role !== 'admin' && (f.uploaded_by === actorId || insp.agent_id === actorId)) throw new Error('An independent reviewer must release evidence.')
  }
  await withActor(actorId, async tx => tx`update files set caption = ${m.caption}, visible_to_client = ${m.visibleToClient}, field_access = ${m.fieldAccess},
    qa_note = coalesce(${m.qaNote}, qa_note), qa_by = case when ${!!m.qaNote} then ${actorId}::uuid else qa_by end,
    qa_at = case when ${!!m.qaNote} then now() else qa_at end where id = ${id}`)
}

export async function deleteFileRow(id: string) {
  const [row] = await sql<{ storage_key: string }[]>`delete from files where id = ${id} returning storage_key`
  return row?.storage_key ?? null
}

/** Pending uploads older than a day never completed; callers can clean them up. */
export async function stalePendingFiles() {
  return sql<{ id: string; storage_key: string }[]>`
    select id, storage_key from files where status <> 'ready' and created_at < now() - interval '1 day'`
}
