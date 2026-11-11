'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { projectFor } from '@/lib/data/projects'
import { approveBrief, createCase, renewConsent, respondCase, resumeWork } from '@/lib/data/engagements'
import { sql, withActor } from '@/lib/db'
import { notifyTeam, notifyUser } from '@/lib/activity'
import { reconcileProjectPayment } from '@/lib/data/operations'

export async function workflowAction(form:FormData) {
  const user=await requireUser()
  const text=(key:string)=>String(form.get(key)??'').trim().slice(0,6000)
  const access=await projectFor(user,text('projectId'))
  if(!access || (!access.isClient&&!access.canManage))throw new Error('Project not found.')
  const p=access.project
  const base=`/${access.isClient?'portal':'staff'}/projects/${p.code}`
  try {
    switch(text('operation')) {
      case 'approve_brief':
        if(!access.canManage)throw new Error('Only staff can approve the brief.')
        await approveBrief(p.id,user.id,Number(text('version')),Number(text('sites')));break
      case 'consent':
        if(!access.isClient||form.get('agree')!=='on')throw new Error('Confirm your consent before continuing.')
        await renewConsent(p.id,user.id);break
      case 'resume':
        if(!access.canManage)throw new Error('Only staff can resume work.')
        await resumeWork(p.id,user.id,text('note'));break
      case 'case':
        await createCase(p.id,user.id,{kind:text('kind'),detail:text('detail'),amount:Number(text('amount')),date:text('date'),reportId:text('reportId')||undefined,inspectionId:text('inspectionId')||undefined});break
      case 'respond':
        if(access.isClient&&(!user.email_verified_at||form.get('agree')!=='on'))throw new Error('Verify your email and confirm the displayed terms.')
        await respondCase(p.id,text('caseId'),user.id,text('decision'),text('note'));break
      case 'confirm_visit':
        if(!access.isClient||form.get('agree')!=='on')throw new Error('Confirm that access is arranged for this date.')
        const updated=await withActor(user.id,async tx=>tx`update inspections set client_confirmed_at=now() where id=${text('inspectionId')} and project_id=${p.id} and schedule_version=${Number(text('version'))} and status='scheduled' returning id`)
        if(!updated.length)throw new Error('The visit changed. Refresh to review the new date.');break
      case 'select_work':
        if(!access.canManage)throw new Error('Only staff can change the active engagement.')
        await withActor(user.id,async tx=>{
          const [w]=await tx`select * from work_orders where id=${text('workId')} and project_id=${p.id}`
          if(!w)throw new Error('Engagement not found.')
          await tx`update projects set active_work_order_id=${w.id},due_date=${w.due_on} where id=${p.id}`
          await reconcileProjectPayment(tx,p.id,true)
        });break
      default:throw new Error('Unknown action.')
    }
    const title=`${p.code}: ${text('operation').replaceAll('_',' ')} updated`
    if(access.isClient)await notifyTeam({title,href:`/staff/projects/${p.code}?tab=settings`,staffIds:p.lead_analyst_id?[p.lead_analyst_id]:undefined})
    else await notifyUser(p.client_id,{title,href:`/portal/projects/${p.code}?tab=settings`})
  }catch(e){redirect(`${base}?tab=settings&error=${encodeURIComponent(e instanceof Error?e.message:'Could not save.')}`)}
  revalidatePath('/staff','layout');revalidatePath('/portal','layout')
  redirect(`${base}?tab=settings&saved=1`)
}
