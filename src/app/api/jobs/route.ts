import crypto from 'node:crypto'
import { deliverQueuedEmail } from '@/lib/email'
import { generateMonitoringCycles, sendBalanceReminders } from '@/lib/data/operations'
import { sql } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const expected = process.env.WORKER_SECRET
  const actual = req.headers.get('authorization')?.replace(/^Bearer /,'') ?? ''
  const supplied = Buffer.from(actual)
  const secret = Buffer.from(expected ?? '')
  if (!expected || supplied.length !== secret.length || !crypto.timingSafeEqual(supplied,secret)) return new Response('Not authorised',{status:401})
  let emails = 0
  // Bounded work: avoid exhausting the hosting request timeout.
  for (let i=0;i<5;i++) { const result = await deliverQueuedEmail(); emails += result.sent; if (result.blocked || result.sent === 0) break }
  let cycles = 0
  let worker: string | null = null
  const actorId = process.env.WORKER_USER_ID
  if (actorId && /^[0-9a-f-]{36}$/i.test(actorId)) {
    const [actor] = await sql`select id from users where id=${actorId} and role='admin' and disabled_at is null`
    if (actor) { worker = actor.id; cycles = await generateMonitoringCycles(actorId) }
  }
  // Reminders only queue email; the next run delivers them with the rest of the outbox.
  const reminders = await sendBalanceReminders(worker)
  return Response.json({emails,cycles,reminders})
}
