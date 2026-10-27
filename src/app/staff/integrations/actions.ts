'use server'
import { requireStaff } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { deliverQueuedEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'
export async function retryEmailAction(form: FormData) {
  await requireStaff(['admin'])
  const id = String(form.get('id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return
  await sql`update email_outbox set status='pending',attempts=0,next_attempt_at=now(),last_error=null where id=${id} and status in ('pending','failed')`
  await deliverQueuedEmail(id)
  revalidatePath('/staff/integrations')
}
