import crypto from 'node:crypto'
import { deliverQueuedEmail } from '@/lib/email'
import { generateMonitoringCycles, sendBalanceReminders } from '@/lib/data/operations'
import { sql } from '@/lib/db'
import { removeStaleUploads } from '@/lib/data/files'
import { removeExpiredRateLimits } from '@/lib/request'
import { runPaystackJobs } from '@/lib/data/paystack'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Background work: email retries, balance reminders, monitoring cycles and upload clean-up.
// Called by Vercel Cron (GET, Authorization: Bearer CRON_SECRET; see vercel.json) or by any
// external scheduler (POST, Authorization: Bearer WORKER_SECRET). Safe to run as often as you like.

function authorised(req: Request) {
  const actual = Buffer.from(req.headers.get('authorization')?.replace(/^Bearer /,'') ?? '')
  return [process.env.WORKER_SECRET, process.env.CRON_SECRET].some(expected => {
    if (!expected) return false
    const secret = Buffer.from(expected)
    return actual.length === secret.length && crypto.timingSafeEqual(actual,secret)
  })
}

async function runJobs(req: Request) {
  if (!authorised(req)) return new Response('Not authorised',{status:401})
  const payments = await runPaystackJobs()
  let cycles = 0
  let worker: string | null = null
  const actorId = process.env.WORKER_USER_ID
  if (actorId && /^[0-9a-f-]{36}$/i.test(actorId)) {
    const [actor] = await sql`select id from users where id=${actorId} and role='admin' and disabled_at is null`
    if (actor) { worker = actor.id; cycles = await generateMonitoringCycles(actorId) }
  }
  const reminders = await sendBalanceReminders(worker)
  const staleUploads = await removeStaleUploads()
  await removeExpiredRateLimits().catch(e => console.error('[jobs] rate limit clean-up failed', e instanceof Error ? e.message : e))
  // Last, so the outbox also carries anything queued above. Bounded to stay inside the request timeout.
  let emails = 0
  for (let i=0;i<20;i++) { const result = await deliverQueuedEmail(); emails += result.sent; if (result.blocked || result.sent === 0) break }
  return Response.json({emails,cycles,reminders,staleUploads,payments})
}

export const GET = runJobs
export const POST = runJobs
