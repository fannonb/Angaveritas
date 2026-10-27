'use server'

import { notifyTeam } from '@/lib/activity'
import { getUser, requestIpHash } from '@/lib/auth/session'
import { createEnquiry, recentEnquiriesFromIp } from '@/lib/data/misc'
import { sendEmail } from '@/lib/email'
import { enquirySchema } from '@/lib/validation'

// On failure the submitted values come back so the form can be refilled, with one message per field.
export type EnquiryState = { ok?: boolean; error?: string; fields?: Record<string, string>; values?: Record<string, string> } | null

export async function sendEnquiry(_: EnquiryState, form: FormData): Promise<EnquiryState> {
  const raw = Object.fromEntries(form)
  const values = Object.fromEntries(Object.entries(raw).filter(([k, v]) => k !== 'website' && typeof v === 'string')) as Record<string, string>
  const parsed = enquirySchema.safeParse(raw)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fields[key]) fields[key] = issue.message
    }
    return { error: 'Please correct the highlighted fields.', fields, values }
  }
  const e = parsed.data
  if (e.website) return { ok: true } // bot
  const ipHash = await requestIpHash()
  if ((await recentEnquiriesFromIp(ipHash)) >= 5) return { error: 'Too many messages from your connection. Please email us instead.', values }
  const user = await getUser()
  await createEnquiry({ ...e, userId: user?.id ?? null, ipHash })
  await notifyTeam({
    title: `Website enquiry from ${e.name}`,
    body: [
      `${e.name} · ${e.email}${e.phone ? ` · ${e.phone}` : ''}`,
      `Prefers: ${e.preferred_contact ?? '-'} · Based in: ${e.based_in ?? '-'}${e.company ? ` · ${e.company}` : ''}`,
      `Service: ${e.service ?? '-'} · Location: ${e.project_location ?? '-'}`,
      '',
      e.message,
    ].join('\n'),
    href: '/staff/enquiries',
  })
  await sendEmail({
    to: e.email,
    subject: 'We have received your enquiry',
    text: `Hello ${e.name.split(' ')[0]},\n\nThank you for contacting AngaVeritas. We will reply within one business day (East Africa Time).\n\nYour message:\n${e.message}`,
  })
  return { ok: true }
}
