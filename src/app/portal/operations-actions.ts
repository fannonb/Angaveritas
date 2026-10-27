'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireClient } from '@/lib/auth/session'
import { projectFor } from '@/lib/data/projects'
import { completeProjectByClient, serviceRequest, submitPaymentNotice } from '@/lib/data/operations'
import { withActor } from '@/lib/db'
import { logEvent, notifyTeam } from '@/lib/activity'
import { formText } from '@/lib/validation'
export async function clientOperationsAction(form: FormData) {
  const user = await requireClient()
  const access = await projectFor(user,String(form.get('projectId') ?? ''))
  if (!access?.isClient) return
  const p = access.project
  const operation = String(form.get('operation') ?? '')
  const returnTab = operation === 'nda' ? 'agreement' : operation === 'request' ? 'settings' : operation === 'monitoring_accept' ? 'monitoring' : operation === 'complete_project' ? 'overview' : 'operations'
  try {
    if (operation === 'payment_notice') {
      await submitPaymentNotice(p.id,user.id,{invoiceId:String(form.get('invoiceId') ?? ''),amount:Number(form.get('amount')),reference:formText(form,'reference',200) ?? '',note:formText(form,'note',2000) ?? ''})
      await notifyTeam({title:`${p.code}: payment notification to reconcile`,href:`/staff/projects/${p.code}?tab=operations`,staffIds:[p.lead_analyst_id]})
    } else if (operation === 'monitoring_accept') {
      if (!user.email_verified_at || form.get('agree') !== 'on') throw new Error('Confirm your email and accept the monitoring fee and frequency.')
      await withActor(user.id,async tx => {
        const [plan] = await tx`select * from projects where id=${p.id} and client_id=${user.id} for update`
        if (plan.monitoring_status !== 'active' || !plan.monitoring_interval_days || !plan.monitoring_fee_kes || String(plan.monitoring_plan_version) !== String(form.get('version')))
          throw new Error('The monitoring plan changed. Refresh and review the terms again.')
        await tx`update projects set monitoring_accepted_version=monitoring_plan_version,monitoring_accepted_by=${user.id},monitoring_accepted_at=now() where id=${p.id}`
      })
      await notifyTeam({title:`${p.code}: monitoring plan accepted`,href:`/staff/projects/${p.code}?tab=operations`,staffIds:[p.lead_analyst_id]})
    } else if (operation === 'request') {
      const kind = String(form.get('kind') ?? '')
      await serviceRequest(p.id,user.id,kind,formText(form,'reason',2000) ?? '')
      await notifyTeam({title:`${p.code}: ${kind.replaceAll('_',' ')} requested`,href:`/staff/projects/${p.code}?tab=operations`,staffIds:[p.lead_analyst_id]})
    } else if (operation === 'nda') {
      const name = formText(form,'name',120) ?? ''
      if (!user.email_verified_at || name.toLowerCase() !== user.full_name.toLowerCase() || form.get('agree') !== 'on') throw new Error('Confirm your email, type your account name and accept the displayed NDA.')
      await withActor(user.id,async tx => {
        const [project] = await tx`select * from projects where id=${p.id} and client_id=${user.id} for update`
        if (project.nda_status !== 'prepared' || project.nda_file_id !== String(form.get('fileId'))) throw new Error('The NDA changed. Refresh and review it before accepting.')
        await tx`update projects set nda_status='signed',nda_signed_name=${name},nda_signed_at=now() where id=${p.id}`
      })
      await notifyTeam({title:`${p.code}: NDA signed`,href:`/staff/projects/${p.code}?tab=agreement`,staffIds:[p.lead_analyst_id]})
    } else if (operation === 'complete_project') {
      if (form.get('confirm') !== 'on') throw new Error('Tick the box to confirm the project is finished.')
      await completeProjectByClient(p.id,user.id)
      await logEvent({actorId:user.id,projectId:p.id,type:'project.completed',summary:'Client marked the project complete',clientVisible:true})
      await notifyTeam({title:`${p.code}: client marked the project complete`,body:'Messages and follow-up requests stay open.',href:`/staff/projects/${p.code}`,staffIds:[p.lead_analyst_id]})
    } else if (operation === 'acknowledge') {
      await withActor(user.id,async tx => tx`update project_alerts set acknowledged_at=coalesce(acknowledged_at,now()) where id=${String(form.get('alertId'))} and project_id=${p.id}`)
    } else throw new Error('Unknown operation.')
  } catch(e) { redirect(`/portal/projects/${p.code}?tab=${returnTab}&error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not save.')}`) }
  revalidatePath(`/portal/projects/${p.code}`); revalidatePath(`/staff/projects/${p.code}`)
  revalidatePath('/staff')
  redirect(`/portal/projects/${p.code}?tab=${returnTab}&saved=1`)
}
