import Link from 'next/link'
import { briefProfile, type BriefContext } from '@/lib/service-briefs'
import { fmtDate, kes } from './format'

type Project = BriefContext & {
  code: string; created_at: Date; onboarding_submitted_at: unknown; data_consent_at: unknown; payment_status: string; nda_status: string
  lead_analyst_id: string | null; field_agent_id: string | null; analyst_name: string | null; agent_name: string | null; brief_approved?: boolean | null
}
type Owner = 'team' | 'client' | 'admin'
type Step = { key: string; label: string; done: boolean; owner: Owner; text: string; action?: { label: string; href: string }; extra?: { label: string; href: string } }

const ownerLabel: Record<Owner, string> = { team: 'Your team', client: 'Client', admin: 'Admin' }

/**
 * Staff checklist from an accepted proposal to a booked visit: every step in order, who it waits on,
 * and the one button that moves it. Clients see their own version in VisitPlan.
 */
export default function VisitReadiness({ project: p, deposit, admin = false }: {
  project: Project
  deposit: { invoice_id?: string; code: string; due_kes: number; payment_notified: boolean } | null
  admin?: boolean
}) {
  const base = `/staff/projects/${p.code}`
  const remind = { label: 'Send a reminder', href: `${base}?tab=messages` }
  const profile = briefProfile(p)
  const briefIn = !!p.onboarding_submitted_at && !!p.data_consent_at
  const teamIn = !!p.lead_analyst_id && !!p.field_agent_id
  const paid = ['deposit_received', 'paid', 'waived'].includes(p.payment_status)

  const depositStep: Step = paid
    ? { key: 'deposit', label: 'Deposit received', done: true, owner: 'client', text: p.payment_status === 'waived' ? 'Payment waived by an admin.' : 'Fieldwork can go ahead.' }
    : deposit?.payment_notified
      ? { key: 'deposit', label: 'Confirm the deposit', done: false, owner: 'admin', text: `The client sent a payment reference for ${deposit.code}. Check it against the bank or M-Pesa records.${admin ? '' : ' An admin confirms it.'}`, action: admin ? { label: 'Confirm payment', href: `${base}?tab=operations` } : undefined }
      : { key: 'deposit', label: 'Client pays the deposit', done: false, owner: 'client', text: deposit ? `${kes(deposit.due_kes)} due on ${deposit.code}. Card and M-Pesa payments through Paystack confirm automatically.` : 'The deposit invoice is issued when the proposal is accepted.', action: remind,
        // Before the client pays, an admin can still change the amount, add a discount or move the due date.
        extra: admin && deposit?.invoice_id ? { label: 'Edit invoice', href: `${base}/invoices/${deposit.invoice_id}?edit=1#edit-invoice` } : undefined }

  const steps: Step[] = [
    { key: 'accepted', label: 'Proposal accepted', done: true, owner: 'client', text: `Project opened ${fmtDate(p.created_at)}.` },
    { key: 'team', label: teamIn ? 'Team assigned' : 'Assign the team', done: teamIn, owner: 'team', text: teamIn ? `${p.analyst_name} leads the work; ${p.agent_name} carries out the visit.` : 'Choose the lead analyst and field agent. They can prepare while the client finishes the steps below.', action: { label: 'Assign team', href: '#team' } },
    { key: 'brief', label: `Client sends the ${profile.tab.toLowerCase()} and consent`, done: briefIn, owner: 'client', text: briefIn ? `Received ${fmtDate(p.onboarding_submitted_at as Date)}.` : 'The client fills this in on their project page. You can read it under the brief tab once sent.', action: remind },
    depositStep,
    ...(p.nda_status === 'requested' ? [{ key: 'nda', label: 'Prepare the confidentiality agreement', done: false, owner: 'team' as Owner, text: 'The client asked for an NDA before work starts.', action: { label: 'Open agreement', href: `${base}?tab=agreement` } }]
      : p.nda_status === 'prepared' ? [{ key: 'nda', label: 'Client signs the confidentiality agreement', done: false, owner: 'client' as Owner, text: 'Sent for signature.', action: remind }]
      : p.nda_status === 'signed' ? [{ key: 'nda', label: 'Confidentiality agreement signed', done: true, owner: 'client' as Owner, text: 'Signed by the client.' }] : []),
    { key: 'check', label: 'Check the brief against the scope', done: briefIn && !!p.brief_approved, owner: 'team', text: !briefIn ? 'Available once the client sends the brief.' : p.brief_approved ? 'Checked and approved for planning.' : 'Confirm it matches the accepted proposal and contact restrictions.', action: briefIn ? { label: 'Review brief', href: '#engagement' } : undefined },
    { key: 'visit', label: 'Schedule the visit', done: false, owner: 'team', text: 'Pick the date, arrival time and checklist. The client is told automatically.' },
  ]
  // Only the visit step needs everything before it; the rest can happen in any order.
  const ready = steps.slice(0, -1).every((s) => s.done)
  steps[steps.length - 1].action = ready ? { label: 'Schedule visit', href: '#plan-visit' } : undefined
  if (!ready) steps[steps.length - 1].text = 'Unlocks once every step above is done.'
  const done = steps.filter((s) => s.done).length

  return (
    <section className="panel panel-pad space-y-4" aria-labelledby="getting-started">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="getting-started" className="text-lg">Getting started</h2>
        <p className="text-sm text-muted">{done} of {steps.length} done</p>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((s) => (
          <li key={s.key} className="flex flex-wrap items-start gap-3 py-3 text-sm">
            <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold ${s.done ? 'bg-ink text-white' : 'border border-line-strong text-muted'}`}>{s.done ? '✓' : ''}</span>
            <span className="min-w-0 flex-1 basis-56">
              <strong className={`block ${s.done ? 'text-ink-2' : 'text-ink'}`}>{s.label}<span className="sr-only">{s.done ? ': done' : ': to do'}</span></strong>
              <span className="mt-0.5 block text-ink-2">{s.text}</span>
            </span>
            {!s.done && (
              <span className="flex flex-wrap items-center gap-2">
                <span className={`chip chip--plain ${s.owner === 'client' ? 'chip--none' : 'chip--warn'}`}>{s.owner === 'client' ? 'Waiting on client' : ownerLabel[s.owner]}</span>
                {s.action && <Link className="btn btn-secondary btn-small no-underline" href={s.action.href}>{s.action.label}</Link>}
                {s.extra && <Link className="btn btn-secondary btn-small no-underline" href={s.extra.href}>{s.extra.label}</Link>}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
