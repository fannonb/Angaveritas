import 'server-only'
import { logEvent } from '@/lib/activity'
import { withActor } from '@/lib/db'
import { setProjectStage } from '@/lib/data/projects'

type Visit = { id: string; code: string; status: string }
type Project = { id: string; stage: string }

/**
 * There is no separate Start step: a visit starts with its first recorded photo, check, finding or note.
 * Safe to call on every save; only the first call on a scheduled visit changes anything.
 */
export async function startVisitIfScheduled(insp: Visit, project: Project, actorId: string) {
  if (insp.status !== 'scheduled') return false
  const rows = await withActor(actorId, async (tx) => tx`
    update inspections set status = 'in_progress', started_at = coalesce(started_at, now())
    where id = ${insp.id} and status = 'scheduled' returning id`)
  if (!rows.length) return false
  await visitStarted(insp, project, actorId)
  return true
}

/** What follows a visit starting, for callers that change the status inside their own transaction. */
export async function visitStarted(insp: Visit, project: Project, actorId: string) {
  if (['planning', 'onboarding'].includes(project.stage)) await setProjectStage(project.id, 'fieldwork')
  await logEvent({ actorId, projectId: project.id, type: 'inspection.started', summary: `Fieldwork started (${insp.code})`, clientVisible: true })
}
