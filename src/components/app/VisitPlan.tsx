import Link from 'next/link'
import { briefProfile, type BriefContext } from '@/lib/service-briefs'
import { fmtVisit } from './format'

type Project = BriefContext & {
  code: string; stage: string; onboarding_submitted_at: unknown; data_consent_at: unknown
  payment_status: string; nda_status: string; analyst_name: string | null
  next_inspection: string | null; next_arrival: string | null
}

/** Shown from the brief until the visit: what is ready, what we are arranging, and how to prepare. */
export const showVisitPlan = (p: Project) => ['onboarding', 'planning'].includes(p.stage) || (p.stage === 'fieldwork' && !!p.next_inspection)

// The client's view of visit preparation. Staff see VisitReadiness instead.
export default function VisitPlan({ project: p, paymentPending = false, embedded = false }: { project: Project; paymentPending?: boolean; embedded?: boolean }) {
  const base = `/portal/projects/${p.code}`
  const profile = briefProfile(p)
  const activity = profile.code === 'ground_verification' ? 'Site visit' : profile.activity
  const booked = !!p.next_inspection
  const rows: { label: string; done: boolean; text: string; action?: { label: string; href: string } }[] = [
    { label: profile.tab, done: !!p.onboarding_submitted_at && !!p.data_consent_at, text: p.onboarding_submitted_at ? 'Received. Your analyst is reviewing it.' : 'Tell us what to check so we can plan the work.', action: { label: 'Complete', href: `${base}?tab=onboarding` } },
    { label: 'Deposit', done: ['deposit_received', 'paid', 'waived'].includes(p.payment_status), text: ['deposit_received', 'paid'].includes(p.payment_status) ? 'Received. Thank you.' : p.payment_status === 'waived' ? 'Not needed for this project.' : paymentPending ? 'Our payment team is confirming it. No need to pay again.' : '60% of the approved fee, due before the visit.', action: paymentPending ? undefined : { label: 'Pay deposit', href: `${base}?tab=operations` } },
    ...(p.nda_status === 'none' ? [] : [{ label: 'Confidentiality agreement', done: p.nda_status === 'signed', text: p.nda_status === 'prepared' ? 'Ready for you to sign.' : 'Your analyst is preparing it.', action: p.nda_status === 'prepared' ? { label: 'Review and sign', href: `${base}?tab=agreement` } : undefined }]),
    { label: 'Your analyst', done: !!p.analyst_name, text: p.analyst_name ? `${p.analyst_name} leads your project and plans the visit.` : 'We are assigning your analyst.' },
    { label: activity, done: booked, text: booked ? fmtVisit(p.next_inspection, p.next_arrival) : 'We are booking the date. We will email you the date and arrival time.' },
  ]
  const ready = rows.filter(r => r.done).length
  const Wrap = embedded ? 'div' : 'section'
  return (
    <Wrap className={embedded ? 'space-y-3' : 'panel panel-pad space-y-4'} aria-label="Visit plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={embedded ? 'text-base' : 'text-lg'}>{booked ? `Your ${activity.toLowerCase()} is booked` : 'Getting ready for your visit'}</h2>
        <p className="text-sm text-muted">{ready} of {rows.length} ready</p>
      </div>
      <ol className="divide-y divide-line">
        {rows.map(r => (
          <li key={r.label} className="flex flex-wrap items-start gap-3 py-3 text-sm">
            <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold ${r.done ? 'bg-ink text-white' : 'border border-line-strong text-muted'}`}>{r.done ? '✓' : ''}</span>
            <span className="min-w-0 flex-1 basis-48">
              <strong className="block">{r.label}<span className="sr-only">{r.done ? ': done' : ': not yet'}</span></strong>
              <span className={r.done && r.label === activity ? 'mt-0.5 block font-semibold text-ink' : 'mt-0.5 block text-ink-2'}>{r.text}</span>
            </span>
            {!r.done && r.action && <Link className="btn btn-secondary btn-small" href={r.action.href}>{r.action.label}</Link>}
          </li>
        ))}
      </ol>
      {booked && profile.physicalLocation && (
        <div className="rounded-lg bg-paper p-4 text-sm">
          <h3 className="text-sm font-semibold">Before the visit</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
            <li>Let the people on site know our field agent is coming that day.</li>
            <li>Arrange access: gate, keys or any permission we need to enter.</li>
            <li>Have any documents you want us to see on site ready, such as permits or plans.</li>
          </ul>
        </div>
      )}
      <p className="text-sm text-ink-2">{booked ? 'Need a different date or time?' : 'Questions about the plan?'} <Link href={`${base}?tab=messages`}>Message your analyst</Link></p>
    </Wrap>
  )
}
