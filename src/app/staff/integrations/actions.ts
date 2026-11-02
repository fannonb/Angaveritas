'use server'
import { requireStaff } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { deliverQueuedEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'
import { processPaystackEvent, reviewPaystackAttempt } from '@/lib/data/paystack'
export async function retryEmailAction(form: FormData) {
  await requireStaff(['admin'])
  const id = String(form.get('id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return
  await sql`update email_outbox set status='pending',attempts=0,next_attempt_at=now(),last_error=null where id=${id} and status in ('pending','failed')`
  await deliverQueuedEmail(id)
  revalidatePath('/staff/integrations')
}

export async function retryPaystackEventAction(form: FormData) {
  await requireStaff(['admin'])
  const id = String(form.get('id') ?? '')
  if (!/^[0-9a-f]{64}$/.test(id)) return
  await sql`update gateway_events set status='pending',next_attempt_at=now() where provider='paystack' and event_id=${id} and status in ('pending','review')`
  await processPaystackEvent(id).catch(() => {})
  revalidatePath('/staff/integrations')
}

export async function reviewPaystackAttemptAction(form:FormData) {
  const user=await requireStaff(['admin'])
  const reference=String(form.get('reference') ?? '')
  if (!/^av-(test|live)-[0-9a-f-]{36}$/.test(reference)) return
  await reviewPaystackAttempt(reference,user.id,String(form.get('note') ?? ''))
  revalidatePath('/staff/integrations')
  revalidatePath('/portal/payments','layout')
  revalidatePath('/portal/projects','layout')
}
