import { z } from 'zod'
import { getUser } from '@/lib/auth/session'
import { getInspection } from '@/lib/data/inspections'
import { projectFor } from '@/lib/data/projects'
import { withActor } from '@/lib/db'
import { sameOrigin } from '@/lib/request'
import { fieldCollectionProblem } from '@/lib/workflow'
const schema=z.object({inspectionId:z.string().uuid(),notes:z.string().max(20000),revision:z.string().datetime()})
export async function POST(req:Request) {
  if(!sameOrigin(req)) return Response.json({error:'Invalid request.'},{status:403})
  const user=await getUser()
  if(!user || user.role === 'client') return Response.json({error:'Staff sign-in required.'},{status:401})
  const parsed=schema.safeParse(await req.json().catch(() => null))
  if(!parsed.success) return Response.json({error:'Invalid draft.'},{status:422})
  const insp=await getInspection(parsed.data.inspectionId)
  const access=insp ? await projectFor(user,insp.project_id) : null
  if(!insp || !access?.canFieldwork || user.role === 'field_agent' && insp.agent_id !== user.id && !(insp.agent_id === null && access.project.field_agent_id === user.id)) return Response.json({error:'Inspection not found.'},{status:404})
  if(!['scheduled','in_progress'].includes(insp.status)) return Response.json({error:'This inspection is locked. Reopen it before syncing.'},{status:409})
  const problem=fieldCollectionProblem(access.project,insp)
  if(problem) return Response.json({error:problem},{status:409})
  const row=await withActor(user.id,async tx => {
    const [current]=await tx`select updated_at,status from inspections where id=${insp.id} for update`
    // PostgreSQL timestamps have microseconds; compare the millisecond revision shown to the browser.
    if(!['scheduled','in_progress'].includes(current.status) || new Date(current.updated_at).toISOString() !== parsed.data.revision) return null
    const [updated]=await tx`update inspections set field_notes=${parsed.data.notes},field_notes_by=${user.id} where id=${insp.id} returning updated_at`
    return updated
  })
  if(!row) return Response.json({error:'The inspection changed since this draft was loaded. Copy your draft and reload to reconcile it.'},{status:409})
  return Response.json({revision:new Date(row.updated_at).toISOString()})
}
