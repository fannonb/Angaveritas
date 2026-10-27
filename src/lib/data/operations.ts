import 'server-only'
import { sql, withActor } from '@/lib/db'
import { fieldworkProblem } from '@/lib/workflow'
import type { ProjectRow } from './projects'
import type postgres from 'postgres'
import { emailInvoice } from '@/lib/invoice-send'

/**
 * Recomputes the project payment status from the ledger. A status written later than the most
 * recent ledger change (a manager override such as a waiver or an old manual payment, or the
 * deliberate awaiting-payment status of a generated cycle) is left alone; recording a payment or
 * invoice after it resumes automatic reconciliation. A waiver only gives way to a fully paid
 * ledger; a manager lifts it by choosing another status.
 */
export async function reconcileProjectPayment(tx: postgres.TransactionSql, projectId: string) {
  const [guard] = await tx<{ current: string; set_at: Date | null; ledger_at: Date | null }[]>`
    select p.payment_status as current, p.payment_status_set_at as set_at, greatest(
      (select max(i.created_at) from invoices i where i.project_id = ${projectId}),
      (select max(pay.created_at) from payments pay join invoices inv on inv.id = pay.invoice_id where inv.project_id = ${projectId})
    ) as ledger_at
    from projects p where p.id = ${projectId}`
  if (!guard || (guard.set_at && guard.set_at >= (guard.ledger_at ?? new Date(0)))) return
  const totals = await tx`
    select i.amount_kes,i.deposit_kes,coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end)::int from payments where invoice_id=i.id),0) paid from invoices i where project_id=${projectId} and status='issued'`
  const status = totals.length && totals.every(i => i.paid >= i.amount_kes) ? 'paid' : totals.length && totals.every(i => i.paid >= i.deposit_kes) ? 'deposit_received' : 'awaiting_payment'
  if (guard.current === 'waived' && status !== 'paid') return
  await tx`update projects set payment_status=${status}, payment_status_set_at=now() where id=${projectId}`
}
export type Invoice = { id: string; code: string; label: string; amount_kes: number; deposit_kes: number; paid_kes: number; due_on: string | null; status: string; sent_at: Date | null; reminder_sent_at: Date | null; cancel_reason: string | null; created_at: Date }
export async function projectOperations(projectId: string) {
  const [invoices, payments, requests, alerts, agreements, cycles, settings, notices, nextSeq] = await Promise.all([
    sql<Invoice[]>`select i.*, coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end)::int from payments where invoice_id=i.id),0) paid_kes from invoices i where project_id=${projectId} order by created_at desc`,
    sql`select p.*, i.code invoice_code from payments p join invoices i on i.id=p.invoice_id where i.project_id=${projectId} order by p.created_at desc`,
    sql`select * from service_requests where project_id=${projectId} order by created_at desc`,
    sql`select * from project_alerts where project_id=${projectId} order by created_at desc`,
    sql`select * from files where project_id=${projectId} and category='agreement' and status='ready' order by created_at desc`,
    sql`select c.*, i.code inspection_code, inv.status invoice_status, inv.code invoice_code, inv.cancel_reason invoice_cancel_reason from monitoring_cycles c left join inspections i on i.id=c.inspection_id left join invoices inv on inv.id=c.invoice_id where c.project_id=${projectId} order by cycle_on desc`,
    sql`select
      p.id, p.code, p.title, p.contract_value_kes, p.payment_status,
      p.nda_status, p.nda_file_id, p.nda_signed_name, p.nda_signed_at,
      p.monitoring_status, p.monitoring_interval_days, p.monitoring_fee_kes,
      p.next_cycle_on, p.monitoring_end_on, p.monitoring_plan_version,
      p.monitoring_accepted_version, p.monitoring_accepted_at,
      pr.id as proposal_id, pr.total_kes as proposal_total_kes,
      pr.deposit_kes as proposal_deposit_kes, pr.title as proposal_title
    from projects p
    left join proposals pr on pr.id = p.proposal_id
    where p.id = ${projectId}`,
    sql`select n.*,i.code invoice_code from payment_notices n join invoices i on i.id=n.invoice_id where n.project_id=${projectId} order by n.created_at desc`,
    sql`select coalesce('AVB-' || (last_value + case when is_called then 1 else 0 end), 'AVB-1001') as next_code from invoice_number_seq`,
  ])
  return {
    invoices,
    payments,
    requests,
    alerts,
    agreements,
    cycles,
    notices,
    settings: settings[0],
    nextInvoiceCode: (nextSeq[0]?.next_code as string) ?? 'AVB-1001',
  }
}

/** The first unpaid deposit on a project, or null when the visit is not waiting on payment. */
export async function projectDepositDue(projectId: string) {
  const [row] = await sql<{ code: string; due_kes: number; payment_notified: boolean }[]>`
    select code, due_kes,coalesce((select sum(amount_kes) from payment_notices where invoice_id=x.invoice_id and status='pending'),0)>=due_kes as payment_notified from (
      select i.id invoice_id,i.code, i.created_at,
        i.deposit_kes - coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments where invoice_id = i.id), 0) as due_kes
      from invoices i join projects p on p.id = i.project_id
      where i.project_id = ${projectId} and i.status = 'issued' and p.payment_status = 'awaiting_payment'
    ) x where due_kes > 0 order by created_at limit 1`
  return row ?? null
}

/** Issued invoices on a project with money still owed (oldest first). */
export async function unpaidInvoices(projectId: string) {
  return sql<{ id: string; code: string; unpaid_kes: number }[]>`
    select * from (
      select i.id, i.code,
        i.amount_kes - coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments where invoice_id = i.id), 0) as unpaid_kes
      from invoices i
      where i.project_id = ${projectId} and i.status = 'issued'
    ) x where unpaid_kes > 0 order by x.code`
}

/**
 * The money still owed once the deposit is settled, for the client project page and portal home
 * prompt. Invoices with a pending payment notification wait for the team instead, and waived
 * projects ask for nothing.
 */
export async function projectBalanceDue(projectId: string) {
  const [row] = await sql<{ total: number; codes: string | null }[]>`
    select coalesce(sum(x.unpaid_kes),0)::int total, string_agg(x.code,', ' order by x.code) codes
    from (
      select i.id, i.code,
        i.amount_kes - coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end)::int from payments where invoice_id=i.id),0) as unpaid_kes
      from invoices i join projects p on p.id=i.project_id
      where i.project_id=${projectId} and i.status='issued' and p.payment_status<>'waived'
        and not exists(select 1 from payment_notices n where n.invoice_id=i.id and n.status='pending')
    ) x where x.unpaid_kes > 0`
  return row && row.total > 0 ? { total: row.total, codes: row.codes ?? '' } : null
}

/**
 * Clients open a project's published reports only once the balance is paid (or payment is waived).
 * Returns null when the reports are open, otherwise what is still owed and on which invoices.
 */
export async function reportLock(projectId: string) {
  const [open] = await sql<{ unlocked: boolean }[]>`select client_reports_unlocked(${projectId}) as unlocked`
  if (open?.unlocked) return null
  const [row] = await sql<{ owed: number; codes: string }[]>`
    select coalesce(sum(u.unpaid),0)::int as owed, coalesce(string_agg(u.code, ', ' order by u.code), '') as codes
    from (
      select i.code, i.amount_kes - coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end)::int from payments where invoice_id=i.id),0) as unpaid
      from invoices i where i.project_id=${projectId} and i.status='issued'
    ) u where u.unpaid > 0`
  return { owedKes: row?.owed ?? 0, codes: row?.codes ?? '' }
}

/**
 * The client marks a delivered project complete once the report is published, the balance is paid and
 * no visit or monitoring is open. Reports, messages, Payments and follow-up requests stay available.
 */
export async function completeProjectByClient(projectId: string, clientId: string) {
  await withActor(clientId, async tx => {
    const [p] = await tx<{ stage: string; client_id: string; monitoring_status: string }[]>`
      select stage, client_id, monitoring_status from projects where id = ${projectId} for update`
    if (!p || p.client_id !== clientId) throw new Error('Project not found.')
    if (p.stage !== 'delivered') throw new Error('You can mark the project complete once its report is ready.')
    if (p.monitoring_status === 'active') throw new Error('Stop monitoring before marking the project complete.')
    const [open] = await tx`select 1 from inspections where project_id = ${projectId} and status in ('scheduled', 'in_progress', 'submitted') limit 1`
    if (open) throw new Error('A site visit is still open on this project.')
    const [published] = await tx`select 1 from reports where project_id = ${projectId} and status = 'published' limit 1`
    if (!published) throw new Error('The report must be published before the project can be marked complete.')
    const [unlocked] = await tx<{ ok: boolean }[]>`select client_reports_unlocked(${projectId}) as ok`
    if (!unlocked?.ok) throw new Error('Pay the remaining balance before marking the project complete.')
    await tx`update projects set stage = 'closed', closed_at = now() where id = ${projectId}`
  })
}

/**
 * Staff reopen a completed project for further questions or follow-up review. Projects cancelled through
 * a cancellation request stay closed; those need a new follow-up project instead.
 */
export async function reopenProject(projectId: string, actorId: string, reason: string) {
  if (reason.trim().length < 5) throw new Error('Give a reason for reopening the project.')
  await withActor(actorId, async tx => {
    const [p] = await tx<{ stage: string }[]>`select stage from projects where id = ${projectId} for update`
    if (!p || p.stage !== 'closed') throw new Error('Only a closed project can be reopened.')
    const [cancelled] = await tx`select 1 from service_requests where project_id = ${projectId} and kind = 'cancellation' and status = 'completed' limit 1`
    if (cancelled) throw new Error('This project was cancelled. Start a follow-up project instead.')
    const [published] = await tx`select 1 from reports where project_id = ${projectId} and status = 'published' limit 1`
    if (!published) throw new Error('Only a project with a published report can be reopened.')
    await tx`update projects set stage = 'delivered', closed_at = null where id = ${projectId}`
  })
}

/**
 * Gentle reminders for issued invoices due within three days or overdue, on open, non-waived
 * projects with no pending payment notification. A claimed invoice is reminded once, then at most
 * weekly, until it is paid; the count is bounded so a scheduled worker never runs long.
 */
export async function sendBalanceReminders(actorId: string | null, limit = 10) {
  const picks = await sql<{ id: string; project_id: string }[]>`
    select i.id, i.project_id
    from invoices i join projects p on p.id = i.project_id
    where i.status = 'issued' and p.stage <> 'closed' and p.payment_status <> 'waived'
      and coalesce(i.due_on, i.created_at::date + 14) <= current_date + 3
      and (i.reminder_sent_at is null or i.reminder_sent_at < now() - interval '7 days')
      and i.amount_kes > coalesce((select sum(case when kind = 'payment' then amount_kes else -amount_kes end)::int from payments where invoice_id = i.id), 0)
      and not exists(select 1 from payment_notices n where n.invoice_id = i.id and n.status = 'pending')
    order by coalesce(i.due_on, i.created_at::date + 14) limit ${limit}`
  let sent = 0
  for (const pick of picks) {
    const claimed = await sql.begin(async tx => {
      const [row] = await tx<{ id: string; project_id: string }[]>`
        select id, project_id from invoices where id = ${pick.id} and status = 'issued'
          and (reminder_sent_at is null or reminder_sent_at < now() - interval '7 days') for update`
      if (!row) return null
      await tx`update invoices set reminder_sent_at = now() where id = ${row.id}`
      return row
    })
    if (!claimed) continue
    try {
      await emailInvoice(claimed.id, claimed.project_id, actorId, 'reminder')
      sent++
    } catch (e) {
      await sql`update invoices set reminder_sent_at = null where id = ${claimed.id}`
      console.error('[billing] balance reminder failed', e)
    }
  }
  return sent
}

/**
 * A manual (supplementary) invoice. Billing beyond the accepted contract value needs `beyondContract`,
 * so the accepted proposal's invoice is never issued twice by mistake.
 */
export async function issueInvoice(projectId: string, actorId: string, input: { label: string; amount: number; deposit: number; dueOn: string | null; beyondContract?: boolean }) {
  if (!input.label.trim() || !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1e8 || !Number.isSafeInteger(input.deposit) || input.deposit < 0 || input.deposit > input.amount) throw new Error('Enter a description, positive total and deposit no greater than the total.')
  return withActor(actorId, async tx => {
    const [billed] = await tx`select coalesce(p.contract_value_kes,0)::int contract,
      coalesce((select sum(amount_kes) from invoices where project_id=p.id and status='issued'),0)::int invoiced
      from projects p where p.id=${projectId} for update`
    if (billed && billed.invoiced + input.amount > billed.contract && !input.beyondContract)
      throw new Error(`This would bill KES ${(billed.invoiced + input.amount).toLocaleString('en-US')} against a contract of KES ${billed.contract.toLocaleString('en-US')}. Tick the box to confirm it is additional work, or cancel the duplicate invoice first.`)
    const label = input.label.trim()
    const [invoice] = await tx`insert into invoices(project_id,label,amount_kes,deposit_kes,due_on,created_by,line_items)
      values (${projectId},${label},${input.amount},${input.deposit},${input.dueOn},${actorId},${tx.json([{ label, amount: input.amount }])}) returning id`
    await reconcileProjectPayment(tx,projectId)
    return invoice.id as string
  })
}

/** Cancels an invoice that has no recorded payments (the database enforces this too). */
export async function cancelInvoice(projectId: string, actorId: string, invoiceId: string, reason: string) {
  if (reason.trim().length < 5) throw new Error('Give a reason for cancelling the invoice.')
  await withActor(actorId, async tx => {
    const [paid] = await tx`select 1 from payments where invoice_id=${invoiceId} limit 1`
    if (paid) throw new Error('This invoice has recorded payments. Record a refund instead of cancelling it.')
    const updated = await tx`update invoices set status='cancelled',cancelled_at=now(),cancelled_by=${actorId},cancel_reason=${reason.trim()}
      where id=${invoiceId} and project_id=${projectId} and status='issued' returning id`
    if (!updated.length) throw new Error('Invoice not found or already cancelled.')
    await tx`update payment_notices set status='declined',reviewed_at=now(),reviewed_by=${actorId},response=${'Invoice cancelled: ' + reason.trim()}
      where invoice_id=${invoiceId} and status='pending'`
    await reconcileProjectPayment(tx,projectId)
  })
}

export async function recordPayment(projectId: string, actorId: string, input: { invoiceId: string; amount: number; kind: 'payment' | 'refund'; reference: string; note: string; noticeId?: string }) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1e8 || !input.reference.trim() || !input.note.trim()) throw new Error('Enter amount, a unique payment reference and a reconciliation note.')
  await withActor(actorId, async tx => {
    const [invoice] = await tx`select * from invoices where id=${input.invoiceId} and project_id=${projectId} and status='issued' for update`
    if (!invoice) throw new Error('Invoice not found or cancelled.')
    const [balance] = await tx`select coalesce(sum(case when kind='payment' then amount_kes else -amount_kes end),0)::int paid from payments where invoice_id=${invoice.id}`
    if (input.kind === 'refund' && input.amount > balance.paid) throw new Error('Refund cannot exceed the recorded payment.')
    if (input.kind === 'payment' && input.amount + balance.paid > invoice.amount_kes) throw new Error('Payment exceeds the invoice balance.')
    try {
      await tx`insert into payments(invoice_id,amount_kes,kind,reference,note,recorded_by) values (${invoice.id},${input.amount},${input.kind},${input.reference},${input.note},${actorId})`
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new Error('This transaction reference is already recorded. Payment references are unique: use the exact reference on the client receipt.')
      throw e
    }
    if (input.noticeId) {
      const notices = await tx`update payment_notices set status='confirmed',reviewed_at=now(),reviewed_by=${actorId},response=${input.note}
        where id=${input.noticeId} and invoice_id=${invoice.id} and project_id=${projectId} and status='pending'
          and lower(trim(reference))=lower(trim(${input.reference})) and amount_kes=${input.amount} returning id`
      if (!notices.length) throw new Error('Payment notification changed. Refresh before confirming it.')
    } else if (input.kind === 'payment') {
      // A manual entry that exactly matches a pending notification closes it instead of leaving
      // the client's claim dangling; a partial or mismatched entry deliberately leaves it open.
      await tx`update payment_notices set status='confirmed',reviewed_at=now(),reviewed_by=${actorId},response=${input.note}
        where invoice_id=${invoice.id} and project_id=${projectId} and status='pending'
          and lower(trim(reference))=lower(trim(${input.reference})) and amount_kes=${input.amount}`
    }
    await reconcileProjectPayment(tx,projectId)
  })
}

export async function submitPaymentNotice(projectId: string, clientId: string, input: { invoiceId: string; amount: number; reference: string; note: string }) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1e8 || input.reference.trim().length < 3) throw new Error('Enter the amount and transaction reference from your receipt.')
  await withActor(clientId, async tx => {
    const [invoice] = await tx`select i.id from invoices i join projects p on p.id=i.project_id
      where i.id=${input.invoiceId} and i.project_id=${projectId} and p.client_id=${clientId} and i.status='issued' for share of i,p`
    if (!invoice) throw new Error('Invoice not found or cancelled.')
    const existing = await tx`select 1 from payment_notices where lower(trim(reference))=lower(trim(${input.reference}))`
    if (existing.length) throw new Error('This reference has already been sent. Check its status below or message your analyst.')
    await tx`insert into payment_notices(invoice_id,project_id,submitted_by,amount_kes,reference,note)
      values(${invoice.id},${projectId},${clientId},${input.amount},${input.reference.trim()},${input.note})`
  })
}

export async function serviceRequest(projectId: string, actorId: string, kind: string, reason: string) {
  if (!['cancellation','monitoring_pause','monitoring_cancel','data_access','consent_withdrawal'].includes(kind) || reason.trim().length < 5) throw new Error('Choose a request type and explain what you need.')
  await withActor(actorId, async tx => {
    const existing = await tx`select 1 from service_requests where project_id=${projectId} and kind=${kind} and status='requested'`
    if (existing.length) throw new Error('A request of this type is already awaiting a response.')
    await tx`insert into service_requests(project_id,kind,reason,requested_by) values (${projectId},${kind},${reason},${actorId})`
  })
}

export async function resolveServiceRequest(projectId: string, actorId: string, id: string, status: 'completed' | 'declined', resolution: string) {
  if (resolution.trim().length < 5) throw new Error('Record the response and any refund or follow-up arrangements.')
  await withActor(actorId, async tx => {
    const [r] = await tx`update service_requests set status=${status},resolution=${resolution},resolved_by=${actorId},resolved_at=now() where id=${id} and project_id=${projectId} and status='requested' returning kind`
    if (!r) throw new Error('Request no longer open.')
    if (status === 'completed') {
      if (r.kind === 'cancellation') {
        await tx`update inspections set status='cancelled' where project_id=${projectId} and status in ('scheduled','in_progress')`
        await tx`update projects set stage='closed',closed_at=now(),monitoring_status='cancelled' where id=${projectId}`
      }
      if (r.kind === 'monitoring_pause' || r.kind === 'monitoring_cancel') await tx`update projects set monitoring_status=${r.kind === 'monitoring_pause' ? 'paused' : 'cancelled'} where id=${projectId}`
      if (r.kind === 'consent_withdrawal') await tx`update projects set data_consent_at=null,monitoring_status='paused' where id=${projectId}`
    }
  })
}

export async function configureMonitoring(projectId: string, actorId: string, input: { interval: number; fee: number; next: string; end: string | null; status: string }) {
  if (!Number.isInteger(input.interval) || input.interval < 7 || input.interval > 366 || !Number.isSafeInteger(input.fee) || input.fee <= 0 || input.fee > 1e8 || !/^\d{4}-\d{2}-\d{2}$/.test(input.next) || !['active','paused','cancelled'].includes(input.status)) throw new Error('Set the cycle interval, fee, next date and plan status.')
  if (input.end && input.end < input.next) throw new Error('The end date cannot precede the next cycle.')
  await withActor(actorId, async tx => tx`update projects set engagement='retainer',monitoring_status=${input.status},monitoring_interval_days=${input.interval},monitoring_fee_kes=${input.fee},next_cycle_on=${input.next},monitoring_end_on=${input.end} where id=${projectId}`)
}

/** Idempotent cycle generation. Invoices come first; the paid cycle can then be dispatched. */
export async function generateMonitoringCycles(actorId: string) {
  return withActor(actorId, async tx => {
    const projects = await tx`select * from projects where stage <> 'closed' and monitoring_status='active'
      and monitoring_accepted_at is not null and monitoring_accepted_version=monitoring_plan_version
      and next_cycle_on <= current_date and (monitoring_end_on is null or next_cycle_on <= monitoring_end_on) order by id for update skip locked`
    let generated = 0
    for (const p of projects) {
      if (!p.data_consent_at || !p.onboarding_submitted_at || !p.monitoring_fee_kes || !p.monitoring_interval_days) continue
      const previous = await tx`select 1 from monitoring_cycles where project_id=${p.id} and cycle_on=${p.next_cycle_on}`
      if (previous.length) {
        await tx`update projects set next_cycle_on=greatest(next_cycle_on + ${p.monitoring_interval_days}::int,current_date + ${p.monitoring_interval_days}::int) where id=${p.id}`
        continue
      }
      const [invoice] = await tx`insert into invoices(project_id,label,amount_kes,deposit_kes,due_on,created_by) values (${p.id},${`Monitoring cycle ${p.next_cycle_on}`},${p.monitoring_fee_kes},${p.monitoring_fee_kes},${p.next_cycle_on},${actorId}) returning id`
      await tx`insert into monitoring_cycles(project_id,cycle_on,invoice_id) values (${p.id},${p.next_cycle_on},${invoice.id})`
      await tx`update projects set payment_status='awaiting_payment',payment_status_set_at=now(),next_cycle_on=greatest(next_cycle_on + ${p.monitoring_interval_days}::int,current_date + ${p.monitoring_interval_days}::int) where id=${p.id}`
      await tx`insert into notifications(user_id,title,href) values (${p.client_id},'Your next monitoring cycle is ready',${`/portal/projects/${p.code}?tab=operations`})`
      generated++
    }
    return generated
  })
}

export async function dispatchMonitoringCycle(projectId: string, actorId: string, cycleId: string) {
  await withActor(actorId, async tx => {
    const [cycle] = await tx`select * from monitoring_cycles where id=${cycleId} and project_id=${projectId} for update`
    const [p] = await tx<ProjectRow[]>`select * from projects where id=${projectId} for update`
    if (!cycle || cycle.inspection_id) throw new Error('This cycle has already been dispatched or was not found.')
    const [invoice]=await tx`select deposit_kes,coalesce((select sum(case when kind='payment' then amount_kes else -amount_kes end) from payments where invoice_id=i.id),0)::int paid from invoices i where i.id=${cycle.invoice_id} and i.status='issued'`
    if(!invoice || invoice.paid < invoice.deposit_kes) throw new Error('Record the cycle payment before dispatch.')
    const [plan] = await tx`select monitoring_status,monitoring_accepted_at,monitoring_accepted_version,monitoring_plan_version from projects where id=${projectId}`
    if (plan.monitoring_status !== 'active' || p.stage === 'closed') throw new Error('The monitoring plan is not active.')
    if (!plan.monitoring_accepted_at || plan.monitoring_accepted_version !== plan.monitoring_plan_version) throw new Error('The client must accept the current monitoring fee and frequency first.')
    const problem = fieldworkProblem(p, p.field_agent_id)
    if (problem) throw new Error(problem)
    const [inspection] = await tx`insert into inspections(project_id,title,agent_id,scheduled_for,objectives,created_by) values (${projectId},${`Monitoring ${cycle.cycle_on}`},${p.field_agent_id},greatest(${cycle.cycle_on}::date,current_date),${p.claims},${actorId}) returning id`
    await tx`update monitoring_cycles set inspection_id=${inspection.id} where id=${cycle.id}`
  })
}

/**
 * A cycle's invoice can be cancelled (for example as a duplicate) but the cycle is pinned to it.
 * A fresh invoice reattaches the visit so it can still be scheduled once the replacement is paid.
 */
export async function reissueCycleInvoice(projectId: string, actorId: string, cycleId: string) {
  return withActor(actorId, async tx => {
    const [cycle] = await tx`select * from monitoring_cycles where id=${cycleId} and project_id=${projectId} for update`
    if (!cycle) throw new Error('Cycle not found.')
    if (cycle.inspection_id) throw new Error('This cycle was already dispatched.')
    const [old] = await tx`select * from invoices where id=${cycle.invoice_id} and status='cancelled'`
    if (!old) throw new Error('Only a cancelled cycle invoice can be reissued.')
    const [invoice] = await tx`insert into invoices(project_id,label,amount_kes,deposit_kes,due_on,created_by,line_items)
      values (${projectId},${old.label},${old.amount_kes},${old.deposit_kes},${cycle.cycle_on},${actorId},${tx.json([{ label: old.label, amount: old.amount_kes }])}) returning id`
    await tx`update monitoring_cycles set invoice_id=${invoice.id} where id=${cycle.id}`
    await reconcileProjectPayment(tx,projectId)
    return invoice.id as string
  })
}
