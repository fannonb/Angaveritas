'use server'
import { requireClient } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
export async function notificationPreferenceAction(form:FormData) {
  const user=await requireClient()
  await sql`update users set email_updates=${form.get('emailUpdates') === 'on'} where id=${user.id}`
  revalidatePath('/portal/account')
}
