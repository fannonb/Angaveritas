import { logEvent, notifyTeam } from '@/lib/activity'
import { getUser } from '@/lib/auth/session'
import { completeFile, getFile, uploadWriteProblem } from '@/lib/data/files'
import { projectFor } from '@/lib/data/projects'
import { json, rateLimited, sameOrigin } from '@/lib/request'

export const maxDuration = 60

// Step 3: the bytes are stored. Hash them, read photo metadata, flag anything
// that needs a manual check, and record it in the project history.
export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  if (!sameOrigin(req)) return json({ error: 'Invalid request.' }, 403)
  const user = await getUser()
  if (!user) return json({ error: 'Please sign in again.' }, 401)
  const pending = await getFile(params.id)
  if (!pending || pending.uploaded_by !== user.id) return json({ error: 'Upload not found.' }, 404)
  const currentAccess = pending.project_id ? await projectFor(user, pending.project_id) : null
  if (!currentAccess) return json({ error: 'Project access has changed.' }, 403)
  const problem = await uploadWriteProblem(user, pending)
  if (problem) return json({ error: problem }, 409)
  if (pending.status === 'ready') return json({ ok: true, file: pending })
  if (await rateLimited(`upload-complete:${user.id}`,60,60_000)) return json({ error: 'Too many attempts. Try again in a minute.' },429)

  let result
  try {
    result = await completeFile(pending.id)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Upload failed.' }, 400)
  }
  const { file, finalized } = result
  if (!file.project_id || !finalized) return json({ ok: true, file: { id: file.id, evidence_code: file.evidence_code, integrity_flag: file.integrity_flag } })

  const access = await projectFor(user, file.project_id)
  if (file.category === 'client_document') {
    await logEvent({ actorId: user.id, projectId: file.project_id, type: 'file.client_uploaded', summary: `Document added: ${file.filename}`, clientVisible: true })
    if (access) {
      await notifyTeam({
        title: `${access.project.code}: client added a document`,
        body: `${user.full_name} uploaded "${file.filename}" to ${access.project.title}.`,
        href: `/staff/projects/${access.project.code}?tab=site`,
        staffIds: [access.project.lead_analyst_id],
      })
    }
  } else {
    await logEvent({
      actorId: user.id,
      projectId: file.project_id,
      type: 'file.uploaded',
      summary: `${file.category === 'evidence' ? `Evidence ${file.evidence_code}` : file.category === 'report' ? 'Report PDF' : 'Internal file'} uploaded: ${file.filename}${file.integrity_flag ? ` (needs check: ${file.integrity_flag})` : ''}`,
    })
  }
  return json({ ok: true, file: { id: file.id, evidence_code: file.evidence_code, integrity_flag: file.integrity_flag } })
}
