'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import { projectFor } from '@/lib/data/projects'
import { cancelInvoice, issueInvoice, recordPayment, configureMonitoring, dispatchMonitoringCycle, generateMonitoringCycles, reissueCycleInvoice, reopenProject, resolveServiceRequest } from '@/lib/data/operations'
import { emailInvoice } from '@/lib/invoice-send'
import { sql, withActor } from '@/lib/db'
import { logEvent, notifyUser } from '@/lib/activity'
import { formText } from '@/lib/validation'
export async function staffOperationsAction(form: FormData) {
  const user = await requireStaff(['analyst','admin'])
  const access = await projectFor(user,String(form.get('projectId') ?? ''))
  if (!access?.canManage) return
  const p = access.project
  const text = (key: string) => formText(form,key,2000) ?? ''
  const num = (key: string) => Number(text(key))
  const returnTab = text('operation') === 'nda' ? 'agreement' : ['monitoring','cycles','dispatch','reissue_cycle'].includes(text('operation')) ? 'monitoring' : ['resolve','reopen_project'].includes(text('operation')) ? 'settings' : text('operation') === 'alert' ? 'alerts' : 'operations'
  try {
    switch (text('operation')) {
      case 'invoice': {
        const id = await issueInvoice(p.id,user.id,{label:text('label'),amount:num('amount'),deposit:num('deposit'),dueOn:text('dueOn') || null,beyondContract:form.get('beyondContract') === 'on'})
        if (form.get('send') === 'on') await emailInvoice(id,p.id,user.id,'issued')
        break
      }
      case 'payment': {
        const kind = text('kind') === 'refund' ? 'refund' : 'payment'
        await recordPayment(p.id,user.id,{invoiceId:text('invoiceId'),amount:num('amount'),kind,reference:text('reference'),note:text('note'),noticeId:text('noticeId') || undefined})
        // The updated invoice is the client's receipt. Sending it never undoes the recorded entry.
        await emailInvoice(text('invoiceId'),p.id,user.id,kind,num('amount')).catch((e) => console.error('[invoice] email failed', e))
        break
      }
      case 'send_invoice': await emailInvoice(text('invoiceId'),p.id,user.id,'resend'); break
      case 'cancel_invoice': {
        const [invoice] = await sql`select code from invoices where id=${text('invoiceId')} and project_id=${p.id}`
        await cancelInvoice(p.id,user.id,text('invoiceId'),text('reason'))
        await notifyUser(p.client_id,{title:`Invoice ${invoice?.code ?? ''} cancelled: ${p.title}`,body:`Reason: ${text('reason')}
Nothing is owed on this invoice.`,href:`/portal/projects/${p.code}?tab=operations`})
        break
      }
      case 'decline_notice': {
        if (text('response').length < 5) throw new Error('Explain what the client should correct.')
        const updated = await withActor(user.id,async tx => tx`update payment_notices set status='declined',reviewed_at=now(),reviewed_by=${user.id},response=${text('response')}
          where id=${text('noticeId')} and project_id=${p.id} and status='pending' returning id`)
        if (updated.length) await notifyUser(p.client_id,{title:`Payment reference needs attention: ${p.title}`,body:text('response'),href:`/portal/projects/${p.code}?tab=operations`})
        break
      }
      case 'monitoring': {
        await configureMonitoring(p.id,user.id,{interval:num('interval'),fee:num('fee'),next:text('next'),end:text('end') || null,status:text('status')})
        await notifyUser(p.client_id,{title:`Monitoring plan updated: ${p.title}`,body:'Review the fee and visit frequency. New or changed terms require your acceptance before another cycle is generated.',href:`/portal/projects/${p.code}?tab=monitoring`})
        break
      }
      case 'cycles': await generateMonitoringCycles(user.id); break
      case 'dispatch': await dispatchMonitoringCycle(p.id,user.id,text('cycleId')); break
      case 'reopen_project': {
        await reopenProject(p.id,user.id,text('reason'))
        await logEvent({actorId:user.id,projectId:p.id,type:'project.reopened',summary:`Project reopened: ${text('reason')}`,clientVisible:true})
        await notifyUser(p.client_id,{title:`${p.title} is open again`,body:text('reason'),href:`/portal/projects/${p.code}`})
        break
      }
      case 'reissue_cycle': {
        const id = await reissueCycleInvoice(p.id,user.id,text('cycleId'))
        await emailInvoice(id,p.id,user.id,'issued').catch((e) => console.error('[invoice] email failed', e))
        break
      }
      case 'resolve': {
        const status = text('status') === 'completed' ? 'completed' : 'declined'
        await resolveServiceRequest(p.id,user.id,text('requestId'),status,text('resolution'))
        await notifyUser(p.client_id,{title:`Service request ${status}: ${p.title}`,body:text('resolution'),href:`/portal/projects/${p.code}?tab=operations`})
        break
      }
      case 'nda': {
        const [file] = await sql`select id from files where id=${text('fileId')} and project_id=${p.id} and category='agreement' and status='ready'`
        if (!file) throw new Error('Upload the NDA as an agreement PDF for this project first.')
        await withActor(user.id,async tx => {
          const [project] = await tx`select nda_status from projects where id=${p.id} for update`
          if (project.nda_status === 'signed') throw new Error('A signed NDA cannot be replaced.')
          await tx`update projects set nda_status='prepared',nda_file_id=${file.id} where id=${p.id}`
          await tx`update files set visible_to_client=true where id=${file.id}`
        })
        await notifyUser(p.client_id,{title:`NDA ready: ${p.title}`,href:`/portal/projects/${p.code}?tab=agreement`})
        break
      }
      case 'alert': {
        if (text('resolution').length < 5) throw new Error('Record how the risk was resolved.')
        await withActor(user.id,async tx => tx`update project_alerts set resolved_at=now(),resolution=${text('resolution')} where id=${text('alertId')} and project_id=${p.id} and resolved_at is null`)
        break
      }
      default: throw new Error('Unknown operation.')
    }
  } catch(e) {
    const message = encodeURIComponent(e instanceof Error ? e.message : 'Could not save.')
    const back = text('returnTo')
    if (back.startsWith(`/staff/projects/${p.code}/invoices/`) && /^[\w/-]+$/.test(back)) redirect(`${back}?error=${message}`)
    redirect(`/staff/projects/${p.code}?tab=${returnTab}&error=${message}`)
  }
  revalidatePath(`/staff/projects/${p.code}`); revalidatePath(`/portal/projects/${p.code}`)
  revalidatePath('/staff')
  // The invoice preview page sends people back to itself; only that path is accepted.
  const back = text('returnTo')
  if (back.startsWith(`/staff/projects/${p.code}/invoices/`) && /^[\w/-]+$/.test(back)) redirect(`${back}?saved=1`)
  redirect(`/staff/projects/${p.code}?tab=${returnTab}&saved=1`)
}
