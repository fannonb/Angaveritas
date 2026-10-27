import { z } from 'zod'
import { getUser } from '@/lib/auth/session'
import { allowedMime, createPendingFile } from '@/lib/data/files'
import { getInspection } from '@/lib/data/inspections'
import { projectFor } from '@/lib/data/projects'
import { json, sameOrigin } from '@/lib/request'
import { makeStorageKey, MAX_UPLOAD_BYTES, uploadTarget } from '@/lib/storage'
import { fieldCollectionProblem } from '@/lib/workflow'

const startSchema = z.object({
  projectId: z.string().uuid(),
  inspectionId: z.string().uuid().nullable().optional(),
  category: z.enum(['evidence', 'client_document', 'report', 'internal', 'agreement']),
  drone: z.boolean().optional(),
  filename: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  mime: z.string().max(120),
  caption: z.string().trim().max(500).optional(),
})

// Step 1 of an upload: checks permission and file type, records a pending
// file and returns where to send the bytes.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Invalid request.' }, 403)
  const user = await getUser()
  if (!user) return json({ error: 'Please sign in again.' }, 401)
  const parsed = startSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid upload.' }, 422)
  const f = parsed.data

  const access = await projectFor(user, f.projectId)
  if (!access) return json({ error: 'Project not found.' }, 404)

  // Who may add what
  if (access.isClient && f.category !== 'client_document') return json({ error: 'Not allowed.' }, 403)
  if (!access.isClient && f.category === 'client_document') return json({ error: 'Not allowed.' }, 403)
  if (f.category === 'report' && !access.canManage) return json({ error: 'Only analysts can upload reports.' }, 403)
  if (f.category === 'agreement' && !access.canManage) return json({ error: 'Only analysts can upload agreements.' }, 403)
  if ((f.category === 'evidence' || f.category === 'internal') && !access.canFieldwork) return json({ error: 'Not allowed.' }, 403)

  const mime = f.mime.toLowerCase()
  let mediaType = allowedMime[mime]
  if (!mediaType) return json({ error: 'This file type is not accepted. Use photos (JPG, PNG, HEIC), videos (MP4, MOV) or documents (PDF, Word, Excel).' }, 415)
  if (f.category === 'report' && mime !== 'application/pdf') return json({ error: 'Reports must be PDF files.' }, 415)
  if (f.category === 'agreement' && mime !== 'application/pdf') return json({ error: 'Agreements must be PDF files.' }, 415)
  if (f.drone && mediaType === 'photo') mediaType = 'drone'
  if (mediaType !== 'video' && f.size > 50 * 1024 * 1024) return json({ error: 'Photos and documents can be up to 50 MB.' }, 413)

  let inspectionId: string | null = null
  if (f.inspectionId) {
    const insp = await getInspection(f.inspectionId)
    if (!insp || insp.project_id !== f.projectId) return json({ error: 'Inspection not found.' }, 404)
    if (user.role === 'field_agent' && insp.agent_id !== user.id && !(insp.agent_id === null && access.project.field_agent_id === user.id)) return json({ error: 'Not allowed.' }, 403)
    if (f.category === 'evidence' && !['scheduled', 'in_progress'].includes(insp.status)) return json({ error: 'Reopen the inspection before adding evidence.' }, 409)
    if (f.category === 'evidence') {
      const problem = fieldCollectionProblem(access.project, insp)
      if (problem) return json({ error: problem }, 409)
    }
    inspectionId = insp.id
  }
  if (f.category === 'evidence' && !inspectionId) return json({ error: 'Add evidence to an assigned inspection.' }, 422)
  if (user.role === 'field_agent' && f.category !== 'evidence') return json({ error: 'Field agents can upload inspection evidence only.' }, 403)

  const storageKey = makeStorageKey(`projects/${f.projectId}/${f.category}`, f.filename)
  const fileId = await createPendingFile({
    projectId: f.projectId,
    inspectionId,
    category: f.category,
    mediaType,
    filename: f.filename,
    mime,
    size: f.size,
    storageKey,
    caption: f.caption || null,
    // Evidence is released to the client when the inspection is reviewed; client documents are always theirs.
    visibleToClient: f.category === 'client_document',
    uploadedBy: user.id,
  })
  return json({ fileId, upload: await uploadTarget(fileId, storageKey) }, 201)
}
