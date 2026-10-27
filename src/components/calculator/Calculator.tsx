'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Breakdown from '@/components/Breakdown'
import { AppIcon } from '@/components/app/icons'
import type { PricingConfig } from '@/lib/pricing/config'
import { computeQuote, formatKes, tierFor, type QuoteResult } from '@/lib/pricing/engine'
import { complexityQuestions, standardDeliverables, type ComplexityAnswers } from '@/lib/pricing/questions'
import AccountFields, { emptyRegister, type Account } from './AccountFields'
import BriefFields, { emptyBrief, type Brief } from './BriefFields'
import LocationPicker, { type Place } from './LocationPicker'

type Distance = { oneWayKm: number; roundTripKm: number; method: 'road' | 'estimate' }

const STEPS = ['Service', 'Location', 'Project scope', 'Deliverables', 'Speed', 'Your project'] as const
const STORE_KEY = 'av-estimate-v2'

const serviceHints: Record<string, string> = {
  ground_verification: 'Confirm a site, business or asset exists and matches what you were told.',
  supplier_verification: 'Check a supplier or contractor is real and capable before you pay.',
  project_monitoring: 'Site visit comparing progress with the plan, with photos and video.',
  due_diligence: 'Investigate a business or opportunity before you invest or partner.',
  feasibility: 'Research demand, costs and risks before starting a venture.',
}

const serviceIcons: Record<string, string> = {
  ground_verification: 'mapPinArea',
  supplier_verification: 'handshake',
  project_monitoring: 'hardHat',
  due_diligence: 'storefront',
  feasibility: 'chartLineUp',
}

export type CalculatorProps = {
  config: PricingConfig
  usdRate: number
  signedInAs: { name: string; email: string } | null
  initialService?: string | null
  parentProject?: { code: string; title: string; location: Place | null } | null
}

export default function Calculator({ config, usdRate, signedInAs, initialService, parentProject }: CalculatorProps) {
  const [step, setStep] = useState(initialService ? 1 : 0)
  const [service, setService] = useState<string | null>(initialService ?? null)
  const [place, setPlace] = useState<Place | null>(parentProject?.location ?? null)
  const [siteCount, setSiteCount] = useState(1)
  const [extraSites, setExtraSites] = useState<{ place: Place | null; distance: Distance | null }[]>([])
  const [skipLocation, setSkipLocation] = useState(false)
  const [distance, setDistance] = useState<Distance | null>(null)
  const [answers, setAnswers] = useState<number[]>([0, 0, 0, 0, 0])
  const [addons, setAddons] = useState<string[]>([])
  const [urgency, setUrgency] = useState('standard')
  const [brief, setBrief] = useState<Brief>(parentProject ? { ...emptyBrief, title: `Follow-up: ${parentProject.title}` } : emptyBrief)
  const [account, setAccount] = useState<Account>(emptyRegister)
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restored = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  const stepChanged = useRef(false)

  // Keep progress if the page is refreshed or the visitor resets a password in another tab.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (initialService || parentProject) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null')
      if (!saved) return
      setStep(saved.step ?? 0)
      setService(saved.service ?? null)
      setSiteCount(saved.siteCount ?? (saved.answers?.[0] === 3 ? 4 : saved.answers?.[0] === 2 ? 2 : 1))
      setExtraSites(saved.extraSites ?? [])
      setPlace(saved.place ?? null)
      setSkipLocation(!!saved.skipLocation)
      setDistance(saved.distance ?? null)
      if (Array.isArray(saved.answers) && saved.answers.length === 5) setAnswers(saved.answers)
      setAddons(saved.addons ?? [])
      setUrgency(saved.urgency ?? 'standard')
      if (saved.brief) setBrief({ ...emptyBrief, ...saved.brief })
    } catch {
      // Storage unavailable: start fresh.
    }
  }, [initialService, parentProject])

  useEffect(() => {
    if (!restored.current) return
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ step, service, place, skipLocation, distance, answers, addons, urgency, brief, siteCount, extraSites }))
    } catch {
      // Ignore: progress just won't survive a refresh.
    }
  }, [step, service, place, skipLocation, distance, answers, addons, urgency, brief, siteCount, extraSites])

  // Location for a follow-up is already known: measure it once.
  useEffect(() => {
    if (!parentProject?.location || distance) return
    fetch(`/api/distance?lat=${parentProject.location.lat}&lng=${parentProject.location.lng}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDistance(d))
      .catch(() => {})
  }, [parentProject, distance])

  const isCustom = service === 'custom'
  const answered = answers.every((a) => a > 0)
  const services = config.services.filter((s) => s.active)
  const addonList = config.addons.filter((a) => a.active)
  const speeds = config.urgency.filter((u) => u.active)
  const lastStep = isCustom ? 1 : 5

  const result: QuoteResult | null = useMemo(() => {
    if (!service || isCustom) return null
    try {
      return computeQuote(
        { serviceCode: service, roundTripKm: distance?.roundTripKm ?? 0, answers: answers.map((a) => a || 1) as ComplexityAnswers, addonCodes: addons, urgencyCode: urgency, siteCount, additionalRoundTripKm: extraSites.filter(s => s.distance).map(s => s.distance!.roundTripKm) },
        config,
      )
    } catch {
      return null
    }
  }, [service, isCustom, distance, answers, addons, urgency, config, siteCount, extraSites])

  const canContinue = [!!service, skipLocation || !!distance, answered, true, !!urgency, true][step]

  function go(to: number) {
    setError(null)
    setStep(to)
    stepChanged.current = true
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // After a step change, move focus to the new step so keyboard and screen reader users start there.
  useEffect(() => {
    if (!stepChanged.current) return
    stepChanged.current = false
    panel.current?.focus({ preventScroll: true })
  }, [step])

  async function submit() {
    setError(null)
    if (brief.title.trim().length < 3) return setError('Please give the project a short name.')
    if (isCustom && brief.description.trim().length < 10) return setError('Please describe what you need checked.')
    if (!signedInAs && account.mode === 'register' && !account.consent) return setError('Please accept the Terms and Privacy Policy to create your account.')
    setSubmitting(true)
    try {
      const payload = {
        kind: isCustom ? 'custom' : 'estimate',
        serviceCode: isCustom ? undefined : service,
        location: skipLocation ? null : place,
        answers: isCustom ? undefined : answers,
        addonCodes: isCustom ? undefined : addons,
        urgencyCode: isCustom ? undefined : urgency,
        parentProjectCode: parentProject?.code,
        siteCount,
        additionalLocations: extraSites.filter(s => s.place).map(s => s.place),
        brief,
        account: signedInAs ? undefined : account,
        website: honeypot,
      }
      const res = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
      try {
        sessionStorage.removeItem(STORE_KEY)
      } catch {}
      window.location.assign(data.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const tierPreview = answered ? tierFor(answers.reduce((s, a) => s + a, 0), config) : null

  const partial = !answered || (!distance && !skipLocation)
  const usd = (kes: number) => (Math.round(kes / usdRate / 5) * 5).toLocaleString('en-US')

  return (
    <>
      {parentProject && (
        <p className="alert alert-ok mb-5">
          Follow-up inspection for <strong>{parentProject.code} · {parentProject.title}</strong>. It will be added to the same project.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="panel outline-none" ref={panel} tabIndex={-1} aria-labelledby="calc-step-label">
          {!isCustom && <p id="calc-step-label" className="sr-only">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>}
          {isCustom && <p id="calc-step-label" className="sr-only">Step {step + 1}: {step === 0 ? 'Service' : 'Your project'}</p>}

          {!isCustom && (
            <nav className="est-steps" aria-label="Progress">
              <div className="est-steps__meta">
                <span>Step {step + 1} of {STEPS.length}</span>
                <strong>{STEPS[step]}</strong>
              </div>
              <div className="est-steps__bar" aria-hidden="true"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
              <ol>
                {STEPS.map((label, i) => (
                  <li key={label}>
                    <button
                      type="button"
                      disabled={i > step}
                      onClick={() => go(i)}
                      aria-current={i === step ? 'step' : undefined}
                      className={`est-step${i === step ? ' is-now' : i < step ? ' is-done' : ''}`}
                    >
                      <span className="est-step__dot">{i < step ? <AppIcon name="check" /> : i + 1}</span>
                      <span className="est-step__label">{label}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="est-body">
            {step === 0 && (
              <Fieldset legend="What do you need?" hint="Choose the service closest to your situation. You can change it later.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <Choice key={s.code} name="service" checked={service === s.code} onChange={() => setService(s.code)}>
                      <span className="tile"><AppIcon name={serviceIcons[s.code] ?? 'briefcase'} /></span>
                      <span className="est-option__title">{s.name}</span>
                      <span className="est-option__text">{serviceHints[s.code] ?? ''}</span>
                      <span className="est-option__price">from {formatKes(s.baseFee)}</span>
                    </Choice>
                  ))}
                  <Choice name="service" checked={isCustom} onChange={() => setService('custom')}>
                    <span className="tile tile--none"><AppIcon name="message" /></span>
                    <span className="est-option__title">Something else</span>
                    <span className="est-option__text">Describe what you need and we&apos;ll prepare a custom proposal.</span>
                    <span className="est-option__price">Custom price</span>
                  </Choice>
                </div>
              </Fieldset>
            )}

            {isCustom && step === 1 && (
              <div className="space-y-7">
                <Fieldset legend="Where is it?" hint="Optional. Helps us plan travel.">
                  <LocationPicker value={place} optional onChange={(p) => setPlace(p)} onDistance={() => {}} />
                </Fieldset>
                <BriefFields value={brief} onChange={setBrief} custom />
                {!signedInAs && <AccountFields value={account} onChange={setAccount} />}
              </div>
            )}

            {!isCustom && step === 1 && (
              <Fieldset legend="Where is the site?" hint={`We travel from ${config.origin.label}. Travel is priced by round-trip road distance.`}>
                {!skipLocation && (
                  <LocationPicker
                    value={place}
                    onChange={(p) => {
                      setPlace(p)
                      setDistance(null)
                    }}
                    onDistance={setDistance}
                    distance={distance}
                  />
                )}
                <label className="label mt-5 max-w-[12rem]">Number of sites<input className="input" type="number" min="1" max="20" value={siteCount} onChange={e => { const n = Math.min(20,Math.max(1,Number(e.target.value)||1)); setSiteCount(n); setAnswers(a => a.map((v,i) => i === 0 ? n === 1 ? 1 : n <= 3 ? 2 : 3 : v)); setExtraSites(s => s.slice(0,n-1)) }} /></label>
                {extraSites.map((site,index) => <div className="mt-4" key={index}><p className="label">Additional site {index+2}</p><LocationPicker value={site.place} distance={site.distance} optional onChange={p => setExtraSites(s => s.map((item,i) => i === index ? {place:p,distance:null} : item))} onDistance={d => setExtraSites(s => s.map((item,i) => i === index ? {...item,distance:d} : item))} /></div>)}
                {siteCount > extraSites.length+1 && <button className="est-add" type="button" onClick={() => setExtraSites(s => [...s,{place:null,distance:null}])}><AppIcon name="plus" /> Add another site location</button>}
                {siteCount > 1 && <p className="hint mt-2">Each located site is estimated as a separate return trip. Shared routes and unknown site fees are confirmed in the proposal.</p>}
                <label className="check mt-5">
                  <input
                    type="checkbox"
                    checked={skipLocation}
                    onChange={(e) => {
                      setSkipLocation(e.target.checked)
                      if (e.target.checked) {
                        setPlace(null)
                        setDistance(null)
                      }
                    }}
                  />
                  I don&apos;t know the exact location yet. Travel will be confirmed in the proposal.
                </label>
              </Fieldset>
            )}

            {!isCustom && step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="est-legend">How big is the job?</h2>
                  <p className="hint mt-1">Five plain questions. We price on effort, never on what your investment is worth.</p>
                </div>
                {complexityQuestions.map((q, qi) => (
                  <fieldset key={q.id}>
                    <legend className="est-question"><span>{qi + 1}</span>{q.question}</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {q.options.map((opt, oi) => (
                        <Choice key={opt} name={q.id} checked={answers[qi] === oi + 1} onChange={() => { setAnswers((a) => a.map((v, i) => (i === qi ? oi + 1 : v))); if (qi === 0) { const n = oi === 0 ? 1 : oi === 1 ? 2 : 4; setSiteCount(n); setExtraSites(s => s.slice(0,n-1)) } }} compact>
                          <span className="est-option__text text-ink">{opt}</span>
                        </Choice>
                      ))}
                    </div>
                  </fieldset>
                ))}
                {tierPreview && (
                  <p className="est-note">
                    <AppIcon name="sparkle" />
                    <span>Based on your answers, this is a <strong>{tierPreview.name.toLowerCase()}</strong> job. The estimate shows how that affects the professional fee.</span>
                  </p>
                )}
              </div>
            )}

            {!isCustom && step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="est-legend">What you receive</h2>
                  <p className="hint mt-1">Every report includes these. Add anything else you need below.</p>
                  <ul className="est-included">
                    {standardDeliverables.map((d) => <li key={d}><AppIcon name="check" />{d}</li>)}
                  </ul>
                </div>
                <Fieldset legend="Optional add-ons">
                  <div className="grid gap-2">
                    {addonList.map((a) => {
                      const on = addons.includes(a.code)
                      return (
                        <Choice key={a.code} type="checkbox" checked={on} onChange={() => setAddons((xs) => (on ? xs.filter((x) => x !== a.code) : [...xs, a.code]))} row>
                          <span className="est-option__title flex-1">{a.name}</span>
                          <span className="est-option__price mt-0">+ {formatKes(a.price)}{a.unit ? ` ${a.unit}` : ''}</span>
                        </Choice>
                      )
                    })}
                  </div>
                </Fieldset>
              </div>
            )}

            {!isCustom && step === 4 && (
              <Fieldset legend="When do you need the report?" hint="Faster delivery means rescheduling staff and travelling at once. The surcharge covers those costs.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {speeds.map((u) => (
                    <Choice key={u.code} name="urgency" checked={urgency === u.code} onChange={() => setUrgency(u.code)}>
                      <span className="est-option__title">{u.name}</span>
                      <span className="est-option__text">
                        {u.delivery}
                        {u.code === 'emergency' ? ' · only when a team is available' : ''}
                      </span>
                      <span className="est-option__price">{u.pct ? `+${u.pct}%${u.pctMax !== undefined ? `–${u.pctMax}%` : ''}` : 'No extra charge'}</span>
                    </Choice>
                  ))}
                </div>
              </Fieldset>
            )}

            {!isCustom && step === 5 && result && (
              <div className="space-y-7">
                <div>
                  <h2 className="est-legend">Send your request</h2>
                  <ul className="est-picks" aria-label="Your choices">
                    <li>{result.service.name}</li>
                    <li>{skipLocation ? 'Location to be confirmed' : place?.label}</li>
                    <li>{result.complexity.tierName} scope</li>
                    <li>{result.urgency.name} delivery</li>
                  </ul>
                </div>
                <BriefFields value={brief} onChange={setBrief} />
                {signedInAs ? (
                  <p className="est-note">
                    <AppIcon name="user" />
                    <span>Submitting as <strong>{signedInAs.name}</strong> ({signedInAs.email}). You&apos;ll follow this request from your dashboard.</span>
                  </p>
                ) : (
                  <AccountFields value={account} onChange={setAccount} />
                )}
              </div>
            )}

            <div aria-hidden="true" className="hp">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </label>
            </div>

            {error && <p role="alert" className="alert alert-bad mt-5">{error}</p>}
          </div>

          <div className="est-foot">
            {step > 0 ? (
              <button type="button" className="est-back" onClick={() => go(step - 1)}>
                <AppIcon name="arrowLeft" /> Back
              </button>
            ) : (
              <span />
            )}
            <div className="flex flex-col items-end gap-1.5">
              {step === lastStep ? (
                <button type="button" className="btn btn-primary" disabled={submitting} onClick={submit}>
                  {submitting ? 'Sending…' : signedInAs ? 'Submit request' : account.mode === 'register' ? 'Create account and submit' : 'Sign in and submit'}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!canContinue} onClick={() => go(step + 1)}>
                  Continue <AppIcon name="arrowRight" />
                </button>
              )}
              {step === lastStep && <p className="hint m-0">Nothing is charged until you accept a formal proposal.</p>}
            </div>
          </div>
          {!isCustom && result && (
            <div className="est-mobile-total">
              <div>
                <span>{partial ? 'Estimate so far' : 'Estimated total'}</span>
                <strong>{formatKes(result.total)}{result.totalMax !== undefined && ` – ${formatKes(result.totalMax)}`}</strong>
              </div>
              <a href="#estimate-breakdown">See breakdown</a>
            </div>
          )}
        </div>

        {!isCustom && (
          <aside className="panel lg:sticky lg:top-24" id="estimate-breakdown" aria-live="polite">
            <div className="panel-head">
              <h2>Your estimate</h2>
              {result && <span className={`chip chip--plain ${partial ? 'chip--none' : 'chip--ok'}`}>{partial ? 'In progress' : 'Complete'}</span>}
            </div>
            <div className="panel-pad">
              {result ? (
                <>
                  <p className="est-total">
                    {formatKes(result.total)}
                    {result.totalMax !== undefined && <> – {formatKes(result.totalMax)}</>}
                  </p>
                  <p className="mt-1 text-[0.8rem] text-muted">
                    about USD {usd(result.total)}{result.totalMax !== undefined && `–${usd(result.totalMax)}`}
                    {partial ? ' · so far, more lines are added as you answer' : ''}
                  </p>
                  <div className="mt-3">
                    <Breakdown result={result} travelPending={!distance && !skipLocation} complexityPending={!answered} hideTotal />
                  </div>
                  {distance?.method === 'estimate' && <p className="hint mt-3">Road distance service unavailable: travel uses an estimated distance and will be confirmed.</p>}
                  <p className="hint mt-3">An estimate, not a quote. We confirm the final price in a formal proposal before any work starts.</p>
                </>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="tile tile--none"><AppIcon name="calculator" /></span>
                  <p className="text-sm text-ink-2">Choose a service and your price builds up here, line by line.</p>
                </div>
              )}
            </div>
            <div className="est-next">
              <p className="kicker">What happens next</p>
              <ol>
                <li>Send the request. It creates your free account.</li>
                <li>An analyst reviews it and sends a formal proposal.</li>
                <li>Work starts only when you accept it online.</li>
              </ol>
            </div>
          </aside>
        )}
      </div>
    </>
  )
}

function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="est-legend">{legend}</legend>
      {hint ? <p className="hint mb-4 mt-1">{hint}</p> : <div className="mb-3" />}
      {children}
    </fieldset>
  )
}

/** A selectable card. The real input covers the card (invisible), so mouse, keyboard and label queries all work. */
function Choice({ type = 'radio', name, checked, onChange, children, compact, row }: { type?: 'radio' | 'checkbox'; name?: string; checked: boolean; onChange: () => void; children: React.ReactNode; compact?: boolean; row?: boolean }) {
  return (
    <label className={`est-option${checked ? ' is-on' : ''}${compact ? ' est-option--compact' : ''}${row ? ' est-option--row' : ''}`}>
      <input type={type} name={name} checked={checked} onChange={onChange} className="est-option__input" />
      {children}
      <span className="est-option__tick" aria-hidden="true"><AppIcon name="check" /></span>
    </label>
  )
}
