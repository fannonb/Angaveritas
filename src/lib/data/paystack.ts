import 'server-only'
import crypto from 'node:crypto'
import { z } from 'zod'
import { sql, withActor } from '@/lib/db'
import { appUrl } from '@/lib/email'
import { emailInvoice } from '@/lib/invoice-send'
import { notifyTeam, notifyUser } from '@/lib/activity'
import { reconcileProjectPayment } from './operations'
import { checkoutAmount, checkoutResponse, PaymentError, paymentMismatch, paystackConfig, paystackEnabled, paystackRequest, transactionResponse, webhookEvent } from '@/lib/paystack'

async function paymentActor() {
  const config = paystackConfig()
  if (!config) throw new PaymentError('Online payments are not configured.', 503)
  const [actor] = await sql`select id from users where id=${config.actorId} and role='admin' and disabled_at is null`
  if (!actor) throw new PaymentError('The payment service account needs configuration.', 503)
  return config.actorId
}

export async function startPaystackCheckout(client: { id: string; email: string }, invoiceId: string, purpose: 'deposit' | 'balance') {
  if (!paystackEnabled()) throw new PaymentError('Online payments are not connected yet. Contact your analyst for payment instructions.', 503)
  await paymentActor()
  const config = paystackConfig()!
  const attempt = await withActor(client.id, async tx => {
    const [invoice] = await tx`select i.*,p.payment_status from invoices i join projects p on p.id=i.project_id
      where i.id=${invoiceId} and p.client_id=${client.id} and i.status='issued' for update of i`
    if (!invoice) throw new PaymentError('Invoice not found.', 404)
    if (invoice.payment_status === 'waived') throw new PaymentError('Payment has been waived for this project.')
    if ((await tx`select 1 from payment_notices where invoice_id=${invoiceId} and status='pending' limit 1`).length)
      throw new PaymentError('Your payment reference is being checked. Please wait for confirmation before paying again.')
    if ((await tx`select 1 from paystack_attempts where invoice_id=${invoiceId} and status='review' and reviewed_at is null`).length)
      throw new PaymentError('A previous payment needs review by your analyst before another payment can be opened.')
    const [balance] = await tx`select coalesce(sum(case when kind='payment' then amount_kes else -amount_kes end),0)::int paid from payments where invoice_id=${invoiceId}`
    const amount = checkoutAmount({ amount_kes: invoice.amount_kes, deposit_kes: invoice.deposit_kes, paid: balance.paid }, purpose)
    const [active] = await tx`select * from paystack_attempts where invoice_id=${invoiceId} and environment=${config.environment}
      and status in ('initializing','pending') and created_at > now() - interval '30 minutes' order by created_at desc limit 1`
    if (active) {
      if (active.client_id !== client.id || active.client_email.toLowerCase() !== client.email.toLowerCase())
        throw new PaymentError('An existing checkout needs confirmation by your analyst before another can be opened.')
      if (Number(active.amount_minor) !== amount) throw new PaymentError('A checkout for this invoice is already open. Complete it or check its status first.')
      if (!active.checkout_url) throw new PaymentError('Checkout is being prepared. Check payment status before trying again.')
      return { reference: active.reference as string, checkout_url: active.checkout_url as string }
    }
    const reference = `av-${config.environment}-${crypto.randomUUID()}`
    await tx`insert into paystack_attempts(reference,invoice_id,client_id,client_email,environment,amount_minor,purpose)
      values (${reference},${invoiceId},${client.id},${client.email},${config.environment},${amount},${purpose})`
    return { reference, amount, checkout_url: null }
  })
  if (attempt.checkout_url) return { reference: attempt.reference, checkoutUrl: attempt.checkout_url }
  // The reference was committed before the network request. A timeout is ambiguous and is
  // reconciled by verification rather than blindly initializing another transaction.
  try {
    const data = checkoutResponse.parse(await paystackRequest('/transaction/initialize', {
      email: client.email, amount: attempt.amount, currency: 'KES', reference: attempt.reference,
      callback_url: `${appUrl()}/portal/payments/return`, channels: config.channels,
      metadata: { invoice_id: invoiceId },
    }))
    if (data.reference !== attempt.reference) throw new PaymentError('Paystack returned an unexpected transaction reference.', 502)
    await sql`update paystack_attempts set checkout_url=${data.authorization_url},status=case when status='initializing' then 'pending' else status end,
      updated_at=now() where reference=${attempt.reference}`
    return { reference: attempt.reference, checkoutUrl: data.authorization_url }
  } catch (error) {
    await sql`update paystack_attempts set last_error='Checkout initialization needs verification.',next_check_at=now()+interval '1 minute' where reference=${attempt.reference}`
    throw error
  }
}

export async function reconcilePaystackTransaction(reference: string) {
  const [saved] = await sql`select * from paystack_attempts where reference=${reference}`
  if (!saved || saved.environment !== paystackConfig()?.environment) return 'ignored'
  if (saved.status === 'success' || saved.status === 'review') return saved.status as string
  const actorId = await paymentActor()
  const payment = transactionResponse.parse(await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`))
  let notCompleted: { invoiceId: string; amount: number } | null = null
  let received: { invoiceId: string; amount: number } | null = null
  const result = await withActor(actorId, async tx => {
    // Same invoice lock as manual reconciliation: a real late/duplicate charge is held for review.
    const [invoice] = await tx`select i.*,p.payment_status project_payment_status from invoices i join projects p on p.id=i.project_id
      where i.id=${saved.invoice_id} for update of i`
    const [attempt] = await tx`select * from paystack_attempts where reference=${reference} for update`
    if (attempt.status === 'success' || attempt.status === 'review') return attempt.status as string
    const mismatch = paymentMismatch({ reference, amount_minor: attempt.amount_minor, environment: attempt.environment, client_email: attempt.client_email }, payment)
    if (mismatch) return flagReview(tx, reference, mismatch)
    if (payment.status !== 'success') {
      // Paystack reports an unfinished checkout as abandoned straight away. Give the client the same 30 minutes
      // the checkout stays open for before treating it as not completed.
      const young = Date.now() - new Date(attempt.created_at).getTime() < 30 * 60 * 1000
      const status = payment.status === 'failed' ? 'failed' : payment.status === 'abandoned' ? (young ? 'pending' : 'abandoned') : payment.status === 'reversed' ? 'review' : 'pending'
      await tx`update paystack_attempts set status=${status},checks=checks+1,next_check_at=now()+interval '5 minutes',
        last_error=${status === 'review' ? 'Transaction was reversed; staff reconciliation is required.' : null},updated_at=now() where reference=${reference}`
      if (['failed', 'abandoned'].includes(status) && ['initializing', 'pending'].includes(attempt.status)) notCompleted = { invoiceId: invoice.id, amount: Number(attempt.amount_minor) / 100 }
      return status
    }
    const [totals] = await tx`select coalesce(sum(case when kind='payment' then amount_kes else -amount_kes end),0)::int paid from payments where invoice_id=${invoice.id}`
    const amount = payment.amount / 100
    const existing = await tx`select id from payments where lower(trim(reference))=lower(trim(${reference}))`
    if (existing.length || invoice.status !== 'issued' || invoice.project_payment_status === 'waived' || totals.paid + amount > invoice.amount_kes)
      return flagReview(tx, reference, 'Funds received but payment was waived, the invoice was cancelled, the reference was already recorded, or the balance changed. Reconcile in Paystack before recording or refunding.')
    const [entry] = await tx`insert into payments(invoice_id,amount_kes,kind,provider,reference,note,recorded_by)
      values (${invoice.id},${amount},'payment','paystack',${reference},${`Verified Paystack ${payment.domain} transaction ${payment.id} (${payment.channel ?? 'checkout'})`},${actorId}) returning id`
    await tx`insert into payment_receipts(payment_id) values (${entry.id})`
    await tx`update payment_notices set status='confirmed',reviewed_at=now(),reviewed_by=${actorId},response='Confirmed through Paystack verification.'
      where invoice_id=${invoice.id} and status='pending' and lower(trim(reference))=lower(trim(${reference})) and amount_kes=${amount}`
    await tx`update paystack_attempts set status='success',transaction_id=${String(payment.id)},channel=${payment.channel ?? null},last_error=null,updated_at=now() where reference=${reference}`
    await reconcileProjectPayment(tx, invoice.project_id)
    await tx`insert into events(actor_id,project_id,type,summary,client_visible,data) values (${actorId},${invoice.project_id},'payment.received',
      ${`Payment of KES ${amount.toLocaleString('en-US')} received for ${invoice.code}.`},true,${tx.json({ provider: 'paystack', reference })})`
    received = { invoiceId: invoice.id, amount }
    return 'success'
  })
  // The team hears about money arriving through checkout the same way as a manual payment reference.
  const paid = received as { invoiceId: string; amount: number } | null // set inside the transaction callback
  if (paid) {
    const [i] = await sql<{ code: string; project_code: string; title: string; client_name: string; lead_analyst_id: string | null; owed: number }[]>`
      select i.code, p.code as project_code, p.title, c.full_name as client_name, p.lead_analyst_id,
        i.amount_kes - coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments where invoice_id = i.id), 0) as owed
      from invoices i join projects p on p.id = i.project_id join users c on c.id = p.client_id where i.id = ${paid.invoiceId}`
    if (i) await notifyTeam({
      title: `${i.project_code}: payment received, KES ${paid.amount.toLocaleString('en-US')}`,
      body: `${i.client_name} paid ${i.code} through Paystack for "${i.title}". ${i.owed > 0 ? `KES ${i.owed.toLocaleString('en-US')} still to pay.` : 'The invoice is fully paid.'}`,
      href: `/staff/projects/${i.project_code}?tab=operations`,
      staffIds: [i.lead_analyst_id],
    })
  }
  // Tell the client once, when a checkout first ends without payment, so they can try again.
  const ended = notCompleted as { invoiceId: string; amount: number } | null // set inside the transaction callback
  if (ended) {
    const { invoiceId, amount } = ended
    const [i] = await sql<{ code: string; project_code: string }[]>`select i.code, p.code as project_code from invoices i join projects p on p.id = i.project_id where i.id = ${invoiceId}`
    if (i) await notifyUser(saved.client_id, {
      title: `Payment not completed: ${i.code}`,
      body: `Your payment of KES ${amount.toLocaleString('en-US')} did not go through, so nothing was recorded. You can try again from your invoice. If money left your account, reply with the reference ${reference}.`,
      href: `/portal/projects/${i.project_code}?tab=operations`,
    })
  }
  return result
}

async function flagReview(tx: Parameters<Parameters<typeof withActor>[1]>[0], reference: string, reason: string) {
  await tx`update paystack_attempts set status='review',last_error=${reason},updated_at=now() where reference=${reference}`
  return 'review'
}

export async function savePaystackEvent(body: Uint8Array) {
  const parsed = webhookEvent.parse(JSON.parse(Buffer.from(body).toString('utf8')))
  const id = crypto.createHash('sha256').update(body).digest('hex')
  await sql`insert into gateway_events(provider,event_id,payload) values ('paystack',${id},${sql.json(parsed)}) on conflict do nothing`
  return id
}

const refundResponse = z.object({ id: z.number().int().positive().safe(), domain: z.enum(['test','live']),
  status: z.string(), currency: z.string(), amount: z.number().int().positive().safe(),
  transaction: z.union([z.number().int().positive().safe(),z.object({ id: z.number().int().positive().safe() })]),
})

async function reconcileRefund(id: number, originalReference?: string) {
  const refund = refundResponse.parse(await paystackRequest(`/refund/${id}`))
  if (refund.id !== id || refund.domain !== paystackConfig()?.environment || refund.currency !== 'KES' || refund.amount % 100 !== 0)
    throw new PaymentError('Refund details do not match the supported currency or environment.')
  if (refund.status !== 'processed') return 'pending'
  const transactionId = typeof refund.transaction === 'number' ? refund.transaction : refund.transaction.id
  let [attempt] = await sql`select * from paystack_attempts where transaction_id=${String(transactionId)} and environment=${refund.domain} and status='success'`
  if (!attempt && originalReference) {
    const result = await reconcilePaystackTransaction(originalReference)
    if (result === 'review') throw new PaymentError('Refund requires staff reconciliation of the original payment.')
    ;[attempt] = await sql`select * from paystack_attempts where transaction_id=${String(transactionId)} and environment=${refund.domain} and status='success'`
    if (!attempt && result !== 'ignored') throw new PaymentError('Refund requires reconciliation of the original payment first.',503)
  }
  if (!attempt) return 'ignored'
  const actorId = await paymentActor()
  await withActor(actorId, async tx => {
    const [invoice] = await tx`select * from invoices where id=${attempt.invoice_id} for update`
    const reference = `av-refund-${refund.domain}-${id}`
    if ((await tx`select id from payments where provider='paystack' and reference=${reference}`).length) return
    const [totals] = await tx`select coalesce(sum(case when kind='payment' then amount_kes else -amount_kes end),0)::int paid from payments where invoice_id=${invoice.id}`
    const [refunded] = await tx`select coalesce(sum(amount_kes),0)::int amount from payments where provider='paystack' and kind='refund'
      and note=${`Verified Paystack refund for ${attempt.reference}`}`
    const amount = refund.amount / 100
    if (amount > totals.paid || refunded.amount + amount > Number(attempt.amount_minor)/100)
      throw new PaymentError('Refund exceeds recorded funds; staff reconciliation is required.')
    const [entry] = await tx`insert into payments(invoice_id,amount_kes,kind,provider,reference,note,recorded_by)
      values (${invoice.id},${amount},'refund','paystack',${reference},${`Verified Paystack refund for ${attempt.reference}`},${actorId}) returning id`
    await tx`insert into payment_receipts(payment_id) values (${entry.id})`
    await reconcileProjectPayment(tx, invoice.project_id)
  })
  return 'processed'
}

export async function processPaystackEvent(id: string) {
  const [row] = await sql`select * from gateway_events where provider='paystack' and event_id=${id} and status='pending'`
  if (!row) return
  const event = webhookEvent.parse(row.payload)
  const reference = event.data.reference ?? event.data.transaction_reference
  let status = 'processed'
  try {
    if (event.data.domain && event.data.domain !== paystackConfig()?.environment) status = 'ignored'
    else if (event.event === 'charge.success' && reference) {
      const result = await reconcilePaystackTransaction(reference)
      if (result === 'pending' || result === 'failed' || result === 'abandoned') throw new PaymentError('Successful event is awaiting transaction verification.', 503)
      status = result === 'ignored' ? 'ignored' : result === 'review' ? 'review' : 'processed'
    } else if (event.event === 'refund.processed') {
      if (event.data.id) {
        const result = await reconcileRefund(event.data.id,reference)
        if (result === 'pending') throw new PaymentError('Refund is awaiting final provider confirmation.',503)
        if (result === 'ignored') status = 'ignored'
      }
      else if (reference) {
        // Some refund webhooks contain a transaction reference but no refund ID.
        // Fetch authoritative refunds for the saved provider transaction instead.
        let [original] = await sql`select transaction_id from paystack_attempts where reference=${reference} and environment=${paystackConfig()!.environment}`
        if (!original) status = 'ignored'
        else if (!original.transaction_id) {
          const result = await reconcilePaystackTransaction(reference)
          if (result === 'review') throw new PaymentError('Refund requires staff reconciliation of the original payment.')
          ;[original] = await sql`select transaction_id from paystack_attempts where reference=${reference}`
          if (!original.transaction_id) throw new PaymentError('Refund is waiting for its original payment to be reconciled.',503)
        }
        if (!original) {
          await sql`update gateway_events set status='ignored' where provider='paystack' and event_id=${id}`
          return
        }
        const refunds = z.array(z.object({id:z.number().int().positive().safe(),status:z.string()})).parse(
          await paystackRequest(`/refund?transaction=${encodeURIComponent(original.transaction_id)}&perPage=100&page=1`))
        if (refunds.length===100) throw new PaymentError('Extensive refund history requires staff reconciliation.')
        const processed=refunds.filter(r => r.status==='processed')
        if (!processed.length) throw new PaymentError('Refund is awaiting final provider confirmation.',503)
        // Fan out durable work instead of making an unbounded number of provider calls
        // inside one webhook/job. Subsequent worker runs drain the remaining refunds.
        let immediate=0
        for (const refund of processed) {
          const child=await savePaystackEvent(Buffer.from(JSON.stringify({event:'refund.processed',data:{id:refund.id,transaction_reference:reference,domain:paystackConfig()!.environment}})))
          if (immediate++<2) await processPaystackEvent(child)
        }
      } else throw new PaymentError('Refund notification is missing identifiers. Check the Paystack dashboard.')
    }
    else if (['refund.pending','refund.processing'].includes(event.event)) status = 'processed'
    else if (event.event.startsWith('refund.') || event.event.startsWith('charge.dispute.')) status = 'review'
    else status = 'ignored'
    await sql`update gateway_events set status=${status},last_error=null where provider='paystack' and event_id=${id}`
  } catch (error) {
    const review = error instanceof PaymentError && error.status === 409
    await sql`update gateway_events set status=${review ? 'review' : 'pending'},attempts=attempts+1,next_attempt_at=now()+interval '5 minutes',
      last_error=${error instanceof PaymentError ? error.message : 'Provider verification failed; retry scheduled.'} where provider='paystack' and event_id=${id}`
    if (!review) throw error
  }
}

export async function deliverPaymentReceipt() {
  const [receipt] = await sql`update payment_receipts set locked_until=now()+interval '5 minutes'
    where payment_id=(select payment_id from payment_receipts where sent_at is null and (locked_until is null or locked_until < now())
      limit 1 for update skip locked) returning payment_id`
  if (!receipt) return false
  try {
    const [p] = await sql`select pay.*,i.project_id from payments pay join invoices i on i.id=pay.invoice_id where pay.id=${receipt.payment_id}`
    await emailInvoice(p.invoice_id,p.project_id,p.recorded_by,p.kind,p.amount_kes)
    await sql`update payment_receipts set sent_at=now(),locked_until=null,last_error=null where payment_id=${receipt.payment_id}`
  } catch {
    await sql`update payment_receipts set last_error='Receipt delivery failed; retry scheduled.' where payment_id=${receipt.payment_id}`
  }
  return true
}

export async function runPaystackJobs() {
  const config = paystackConfig()
  if (!config) return { checked: 0, events: 0, receipts: 0 }
  // Bounded work leaves room in the shared job's 60-second execution window.
  const deadline = Date.now() + 20000
  let checked = 0, events = 0, receipts = 0
  const pending = await sql`select reference from paystack_attempts where environment=${config.environment} and status in ('initializing','pending')
    and next_check_at <= now() order by next_check_at limit 3`
  for (const p of pending) {
    if (Date.now() > deadline) break
    try { await reconcilePaystackTransaction(p.reference); checked++ } catch {
      await sql`update paystack_attempts set checks=checks+1,next_check_at=now()+interval '30 minutes',
        last_error='Payment verification will be retried.',updated_at=now() where reference=${p.reference}`
    }
  }
  const queue = await sql`select event_id from gateway_events where provider='paystack' and status='pending' and next_attempt_at <= now()
    order by next_attempt_at limit 3`
  for (const e of queue) {
    if (Date.now() > deadline) break
    try { await processPaystackEvent(e.event_id); events++ } catch { /* retained for retry */ }
  }
  for (let i=0;i<3 && Date.now()<deadline;i++) { if (!await deliverPaymentReceipt()) break; receipts++ }
  return { checked, events, receipts }
}

export async function invoicePaystackAttempts(invoiceId: string) {
  return sql`select reference,status,amount_minor,channel,last_error,reviewed_at,created_at from paystack_attempts where invoice_id=${invoiceId}
    order by (status='review' and reviewed_at is null) desc,created_at desc limit 5`
}

export async function reviewPaystackAttempt(reference:string,actorId:string,note:string) {
  if (note.trim().length<10 || note.length>2000) throw new PaymentError('Describe how the funds were reconciled (10–2,000 characters).')
  await withActor(actorId,async tx => {
    if (!(await tx`select 1 from users where id=${actorId} and role='admin' and disabled_at is null`).length) throw new PaymentError('An administrator must review payment exceptions.',403)
    const [attempt]=await tx`select * from paystack_attempts where reference=${reference}`
    if (!attempt) throw new PaymentError('Payment not found.',404)
    const [invoice]=await tx`select * from invoices where id=${attempt.invoice_id} for update`
    const reviewed=await tx`update paystack_attempts set reviewed_at=now(),reviewed_by=${actorId},review_note=${note.trim()}
      where reference=${reference} and status='review' and reviewed_at is null returning reference`
    if (!reviewed.length) return
    await tx`insert into events(actor_id,project_id,type,summary,data) values (${actorId},${invoice.project_id},'payment.reviewed',
      'Paystack payment exception reviewed by an administrator.',${tx.json({reference,note:note.trim()})})`
  })
}
