'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { homeFor, requireClient, requireUser, safeNext } from '@/lib/auth/session'
import { markNotificationsRead, readNotificationLink } from '@/lib/data/misc'

function notificationId(form: FormData) {
  const id = String(form.get('id') ?? '')
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n ? id : null
}

export async function openNotificationAction(form: FormData) {
  const user = await requireUser()
  const home = homeFor(user)
  const id = notificationId(form)
  const href = safeNext(id ? await readNotificationLink(user.id, id) : null, home)
  revalidatePath(home, 'layout')
  redirect(href)
}

export async function markAllReadAction() {
  const user = await requireUser()
  await markNotificationsRead(user.id)
  revalidatePath(homeFor(user), 'layout')
}

export async function dismissNotificationAction(form: FormData) {
  const user = await requireClient()
  const id = notificationId(form)
  if (!id) return
  await markNotificationsRead(user.id, id)
  revalidatePath('/portal', 'layout')
}
