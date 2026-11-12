import 'server-only'
import { randomUUID } from 'node:crypto'
import { site } from '@/lib/site'
import { sql } from '@/lib/db'
import { emailActionUrl, renderEmailHtml } from '@/lib/email-template'

// Outgoing email via Resend (resend.com). Without RESEND_API_KEY the message
// is printed to the server console instead, which is how sign-up and reset
// links are tested locally. Never throws: a failed email must not undo the
// action that triggered it.

export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export type EmailAttachment = { filename: string; content: Uint8Array }

export async function sendEmail(msg: { to: string | string[]; subject: string; text: string; actionPath?: string; replyTo?: string; attachments?: EmailAttachment[]; copyTeam?: boolean }) {
  const to = [...new Set((Array.isArray(msg.to) ? msg.to : [msg.to]).map(email => email.trim().toLowerCase()).filter(Boolean))]
  // Separate outbox messages keep internal recipients private and give copies independent retries.
  const copies = msg.copyTeam ? teamInboxes().filter(email => !to.includes(email)) : []
  for (const recipient of copies) {
    await sendEmail({ ...msg, to: recipient, copyTeam: false })
  }
  const key = process.env.RESEND_API_KEY
  const body = `${msg.text}\n\n—\nAngaVeritas · ${site.location}\n${site.email}`
  // Attachments are stored with the message (base64) so a retry sends exactly the same file.
  const attachments = msg.attachments?.length ? msg.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) : null
  const actionPath = emailActionUrl(msg.actionPath, appUrl()) ? msg.actionPath! : null
  const [queued] = await sql`insert into email_outbox(recipients,subject,body,reply_to,attachments,action_path) values (${to},${msg.subject},${body},${msg.replyTo ?? site.email},${attachments ? sql.json(attachments) : null},${actionPath}) returning id`
  if (!key) {
    if (process.env.NODE_ENV !== 'development') return
    const files = attachments ? `\n[email] Attachments: ${attachments.map((a) => `${a.filename} (${Math.round((a.content.length * 3) / 4 / 1024)} KB)`).join(', ')}` : ''
    console.log(`\n[email] To: ${to.join(', ')}\n[email] Subject: ${msg.subject}\n${body}${files}\n[email] (not sent: RESEND_API_KEY is not set)\n`)
    return
  }
  await deliverQueuedEmail(queued.id)
}

type OutgoingEmail = {
  id: string
  recipients: string[]
  reply_to?: string | null
  subject: string
  body: string
  action_path?: string | null
  attachments?: { filename: string; content: string }[] | null
}

async function deliverEmail(key: string, email: OutgoingEmail) {
  const url = appUrl()
  const action = emailActionUrl(email.action_path, url)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `av-email-${email.id}` },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'AngaVeritas <no-reply@angaveritas.com>',
      to: email.recipients,
      reply_to: email.reply_to ?? site.email,
      subject: email.subject,
      text: action ? `${email.body}\n\n${action}` : email.body,
      html: renderEmailHtml(email.subject, email.body, { logoUrl: `${url}/images/email-logo.png`, siteUrl: url, location: site.location, email: site.email, actionPath: email.action_path }),
      ...(email.attachments ? { attachments: email.attachments } : {}),
    }),
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`)
}

/** Send credential links without writing usable tokens to the email outbox. */
export async function sendAuthEmail(email: { to: string; subject: string; text: string; actionPath: string }) {
  const key = process.env.RESEND_API_KEY
  const action = emailActionUrl(email.actionPath, appUrl())
  if (!action) return false
  if (!key) {
    if (process.env.NODE_ENV !== 'development') return false
    console.log(`[email] To: ${email.to}\n[email] Subject: ${email.subject}\n${action}`)
    return true
  }
  try {
    await deliverEmail(key, { id: randomUUID(), recipients: [email.to], subject: email.subject, body: email.text, action_path: email.actionPath })
    return true
  } catch {
    console.error('[email] Authentication email could not be delivered')
    return false
  }
}

export async function deliverQueuedEmail(id?: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: 0, blocked: true }
  const claimed = await sql.begin(async tx => {
    const [item] = await tx`select * from email_outbox where
      (status in ('pending','failed') or (status='sending' and locked_at < now()-interval '10 minutes'))
      and attempts < 5 and next_attempt_at <= now() and ${id ? tx`id=${id}` : tx`true`} order by created_at for update skip locked limit 1`
    if (!item) return null
    await tx`update email_outbox set status='sending',locked_at=now(),attempts=attempts+1 where id=${item.id}`
    return item
  })
  if (!claimed) return { sent: 0, blocked: false }
  try {
    await deliverEmail(key, claimed as unknown as OutgoingEmail)
    await sql`update email_outbox set status='sent',sent_at=now(),last_error=null,locked_at=null where id=${claimed.id}`
    return { sent: 1, blocked: false }
  } catch (err) {
    await sql`update email_outbox set status='failed',last_error=${err instanceof Error ? err.message : 'Email delivery failed'},locked_at=null,
      next_attempt_at=now() + make_interval(secs => ${Math.min(86400, 60 * 2 ** Number(claimed.attempts))}) where id=${claimed.id}`
    return { sent: 0, blocked: false }
  }
}

/** Address for team alerts (new requests, onboarding submitted, client messages). */
export const teamInboxes = () => [...new Set([site.email, ...(process.env.NOTIFY_EMAIL ?? '').split(/[,;\n]/)].map(email => email.trim().toLowerCase()).filter(Boolean))]
