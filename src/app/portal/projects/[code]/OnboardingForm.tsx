'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveOnboardingAction, type ActionState } from '../../actions'

type Values = {
  projectId: string
  title: string
  locationLabel: string | null
  county: string | null
  siteDirections: string | null
  siteAccessNotes: string | null
  claims: string | null
  concerns: string | null
  investmentValue: string | null
}

// Which button was pressed travels in a hidden field (reliable across browsers).
const setIntent = (e: React.MouseEvent<HTMLButtonElement>, v: string) => {
  const field = e.currentTarget.form?.elements.namedItem('intent') as HTMLInputElement | null
  if (field) field.value = v
}

function Buttons({ submitted, last }: { submitted: boolean; last: boolean }) {
  const { pending } = useFormStatus()
  return (
    <div className="flex flex-wrap justify-end gap-3">
      <button className="btn btn-secondary" type="submit" disabled={pending} onClick={(e) => setIntent(e, '0')}>Save</button>
      {!submitted && last && (
        <button className="btn btn-primary" type="submit" disabled={pending} onClick={(e) => setIntent(e, '1')}>
          {pending ? 'Sending…' : 'Send site details'}
        </button>
      )}
    </div>
  )
}

export default function OnboardingForm({ v, submitted }: { v: Values; submitted: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveOnboardingAction, null)
  const [step,setStep] = useState(0)
  const form = useRef<HTMLFormElement>(null)
  const [review,setReview] = useState<Record<string,string>>({})
  function move(next: number) {
    const fields = form.current?.querySelectorAll<HTMLInputElement>('fieldset[data-preparation-step]:not([hidden]) input')
    for (const field of fields ?? []) { if (!field.checkValidity()) { field.reportValidity(); return } }
    if (form.current) setReview(Object.fromEntries([...new FormData(form.current)].map(([key,value]) => [key,String(value)])))
    setStep(next)
  }
  return (
    <form ref={form} action={action} className="space-y-5">
      <input type="hidden" name="projectId" value={v.projectId} />
      <input type="hidden" name="intent" defaultValue="0" />
      <ol className="grid grid-cols-3 gap-2 py-1" aria-label="Site preparation steps">
        {['1. Find the site', '2. What to check', '3. Review & send'].map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? 'step' : undefined}
            className={`flex items-center justify-center rounded border px-3 py-2 text-center text-xs font-semibold sm:text-sm ${
              step === i
                ? 'border-ink bg-ink text-white'
                : step > i
                ? 'border-line-strong bg-paper text-ink'
                : 'border-line bg-white text-muted'
            }`}
          >
            {label}
          </li>
        ))}
      </ol>
      <fieldset data-preparation-step hidden={step!==0} className="space-y-4">
      <legend className="text-lg font-semibold mb-3">Where should we go?</legend>
      <label className="label">
        Project name
        <input className="input" name="title" defaultValue={v.title} required maxLength={140} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Site location
          <input className="input" name="locationLabel" defaultValue={v.locationLabel ?? ''} maxLength={200} placeholder="Town, area or landmark" />
        </label>
        <label className="label">
          County <span className="opt">(optional)</span>
          <input className="input" name="county" defaultValue={v.county ?? ''} maxLength={80} />
        </label>
      </div>
      <label className="label">
        How do we find the site?
        <textarea className="input" name="siteDirections" defaultValue={v.siteDirections ?? ''} maxLength={4000} placeholder="Directions from the nearest town, a plot or LR number, a Google Maps pin link, landmarks…" />
      </label>
      <label className="label">
        Access <span className="opt">(optional)</span>
        <textarea className="input min-h-[4.5rem]" name="siteAccessNotes" defaultValue={v.siteAccessNotes ?? ''} maxLength={4000} placeholder="Who lets us in, gate times, whether the people on site know we are coming (or should not know)…" />
      </label>
      </fieldset>
      <fieldset data-preparation-step hidden={step!==1} className="space-y-4">
      <legend className="text-lg font-semibold mb-3">What do you want checked?</legend>
      <label className="label">
        What have you been told that we should verify?
        <textarea className="input" name="claims" defaultValue={v.claims ?? ''} maxLength={4000} placeholder="One claim per line, e.g. “Walls are up to ring beam level”, “The title is clean”, “200 laying hens on site”." />
        <span className="hint block">Each claim becomes a line on the field checklist.</span>
      </label>
      <label className="label">
        What worries you most? <span className="opt">(optional)</span>
        <textarea className="input min-h-[4.5rem]" name="concerns" defaultValue={v.concerns ?? ''} maxLength={3000} />
      </label>
      <label className="label">
        Value of the investment, KES <span className="opt">(optional)</span>
        <input className="input" name="investmentValue" defaultValue={v.investmentValue ?? ''} inputMode="numeric" maxLength={20} />
        <span className="hint block">For your dashboard only. It never affects our fee.</span>
      </label>
      </fieldset>
      {step===2 && <div className="space-y-4">
        <h3 className="text-lg">Check your visit brief</h3>
        <dl className="kv"><dt>Project</dt><dd>{review.title}</dd><dt>Location</dt><dd>{review.locationLabel || review.siteDirections || 'Add a location or directions before sending'}</dd><dt>What to check</dt><dd>{review.claims || 'Your analyst will confirm the checks from the agreed scope.'}</dd><dt>Access</dt><dd>{review.siteAccessNotes || 'No access restrictions added'}</dd></dl>
        <p className="hint">People and documents can be added separately. You can update this brief after sending it.</p>
      </div>}
      {!submitted && step===2 && (
        <label className="check">
          <input type="checkbox" name="consent" />
          <span>
            I consent to AngaVeritas processing the project information, documents and contacts I provide to carry out this engagement, in line
            with the Kenya Data Protection Act and the Privacy Policy.
          </span>
        </label>
      )}
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok">{state.message}</p>}
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">{step>0 && <button className="btn btn-secondary" type="button" onClick={() => move(step-1)}>Back</button>}{step<2 && <button className="btn btn-primary" type="button" onClick={() => move(step+1)}>Continue</button>}</div>
        <Buttons submitted={submitted} last={step===2} />
      </div>
    </form>
  )
}
