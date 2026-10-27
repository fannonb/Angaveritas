'use server'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import { markNotificationsRead } from '@/lib/data/misc'

export async function markStaffNotificationsReadAction() {
  const user = await requireStaff()
  await markNotificationsRead(user.id)
  revalidatePath('/staff', 'layout')
}
