'use client'

import { startTransition, useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { briefAnswers, briefProfile, type BriefContext, type BriefField } from '@/lib/service-briefs'
import SiteLocationField, { type SiteLocation } from '@/components/app/SiteLocationField'
import { saveOnboardingAction, type ActionState } from '../../actions'

type Values = {
  projectId:string; title:string; locationLabel:string|null; county:string|null; locationLat:number|null; locationLng:number|null
  siteDirections:string|null; siteAccessNotes:string|null; claims:string|null
  concerns:string|null; investmentValue:string|null; context:BriefContext; serviceBrief:unknown
}
const steps = ['Details','What to check','Review & send']
const shortSteps = ['Details','Check','Send']
// stepExtras holds server-rendered blocks (contacts, documents) keyed by step index. They sit outside the brief form because they contain their own forms.
export default function OnboardingForm({v,submitted,locked=false,stepExtras={}}:{v:Values;submitted:boolean;locked?:boolean;stepExtras?:Partial<Record<number,ReactNode>>}) {
  const profile = briefProfile(v.context)
  const formId = useId()
  const [values,setValues] = useState<Record<string,string>>(() => ({title:v.title,locationLabel:v.locationLabel??'',county:v.county??'',locationLat:v.locationLat==null?'':String(v.locationLat),locationLng:v.locationLng==null?'':String(v.locationLng),siteDirections:v.siteDirections??'',siteAccessNotes:v.siteAccessNotes??'',claims:v.claims??'',concerns:v.concerns??'',investmentValue:v.investmentValue??'',...Object.fromEntries(Object.entries(briefAnswers(profile,v.serviceBrief)).map(([k,value]) => [`service.${k}`,value]))}))
  const [consent,setConsent] = useState(false)
  const [state,action,pending] = useActionState<ActionState,FormData>(saveOnboardingAction,null)
  const [step,setStep] = useState(0)
  const [error,setError] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const heading = useRef<HTMLParagraphElement>(null)
  const announced = useRef(0)
  // Focus moves to the step announcement on step change only, not on first render.
  useEffect(() => { if (announced.current === step) return; announced.current = step; heading.current?.focus() },[step])
  const focus = (name:string) => requestAnimationFrame(() => {
    const input = form.current?.elements.namedItem(name) as HTMLElement|null
    input?.closest('details')?.setAttribute('open','')
    input?.focus()
  })
  useEffect(() => {
    if (state?.ok && state.nextStep !== undefined) {setStep(state.nextStep);return}
    if (!state?.field) return
    setStep(profile.fields.find(f => `service.${f.key}`===state.field)?.step??0)
    focus(state.field)
  },[state,profile])
  function validate(steps:number[]) {
    for (const group of steps) {
      const controls = form.current?.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(`fieldset[data-step="${group}"] input,fieldset[data-step="${group}"] textarea,fieldset[data-step="${group}"] select`)
      for (const input of controls??[]) if (!input.checkValidity() || (input.required && !input.value.trim())) {
        setStep(group);setError(`Please check “${input.labels?.[0]?.childNodes[0]?.textContent?.trim()||'the highlighted field'}”.`);focus(input.name);return false
      }
    }
    setError('');return true
  }
  function submit(final:boolean, continuing=false) {
    setError('')
    if ((final || submitted) && !validate([0,1])) return
    if (continuing && !validate(Array.from({length:step+1},(_,at)=>at))) return
    if (final && !submitted && !consent) {setError('Please confirm consent to process the project information.');focus('consent');return}
    if (!form.current) return
    const data = new FormData(form.current)
    data.set('intent',final?'1':continuing?'continue':'0')
    data.set('section',String(step))
    startTransition(() => action(data))
  }
  const control = (name:string) => ({name,value:values[name]??'',onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => setValues(old => ({...old,[name]:e.target.value}))})
  const siteLocation:SiteLocation = {label:values.locationLabel,county:values.county,lat:values.locationLat?Number(values.locationLat):null,lng:values.locationLng?Number(values.locationLng):null}
  const locationRequired = profile.code==='feasibility'||(profile.physicalLocation&&!values.siteDirections.trim())
  function setLocation(next:SiteLocation) {
    setValues(old => ({...old,locationLabel:next.label,county:next.county,locationLat:next.lat==null?'':String(next.lat),locationLng:next.lng==null?'':String(next.lng)}))
  }
  function renderField(f:BriefField) {
    const props = {...control(`service.${f.key}`),id:`brief-${f.key}`,required:!!f.required,className:'input','aria-describedby':f.hint?`hint-${f.key}`:undefined}
    return <label key={f.key} className="label" htmlFor={props.id}>{f.label}{!f.required&&<span className="opt"> (optional)</span>}
      {f.type==='select'?<select {...props}><option value="">Select an option</option>{f.options?.map(o=><option key={o}>{o}</option>)}</select>:f.type==='textarea'?<textarea {...props} maxLength={2000} placeholder={f.placeholder}/>:<input {...props} type={f.type} maxLength={2000} placeholder={f.placeholder}/>}
      {f.hint&&<span id={`hint-${f.key}`} className="hint block">{f.hint}</span>}
    </label>
  }
  function renderStepFields(at:0|1) {
    const fields = profile.fields.filter(f=>f.step===at)
    const optional = fields.filter(f=>!f.required)
    return <>{fields.filter(f=>f.required).map(renderField)}{optional.length>0&&<details className="rounded border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">Additional context (optional)</summary><div className="mt-4 space-y-4">{optional.map(renderField)}</div></details>}</>
  }
  const review = [...profile.fields.map(f=>({label:f.label,value:values[`service.${f.key}`]})),{label:profile.location,value:values.locationLabel},{label:'County / area',value:values.county},{label:profile.directions||'Previous location notes',value:values.siteDirections},{label:profile.access,value:values.siteAccessNotes},{label:profile.claims,value:values.claims},{label:'Main concerns',value:values.concerns},{label:profile.value,value:values.investmentValue}].filter(f=>f.value)
  const extra = (at:number) => stepExtras[at]==null ? null : <div className="border-t border-line pt-5">{stepExtras[at]}</div>
  if (locked) return <div className="panel-pad space-y-5"><p className="alert alert-info">Your brief is saved. Work has started; message your analyst if anything changes.</p><dl className="kv"><dt>Project</dt><dd>{values.title}</dd>{review.map(f=><div className="contents" key={f.label}><dt>{f.label}</dt><dd className="whitespace-pre-line break-words">{f.value}</dd></div>)}</dl>{extra(1)}{extra(2)}</div>
  return <>
    <div className="panel-pad space-y-5">
      <form id={formId} ref={form} noValidate onSubmit={e=>{e.preventDefault();submit(false)}} className="space-y-5">
        <input type="hidden" name="projectId" value={v.projectId}/>
        <p className="text-sm text-ink-2">{profile.intro}</p>
        <p ref={heading} tabIndex={-1} aria-live="polite" className="sr-only">Step {step+1} of 3: {steps[step]}</p>
        <ol className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm" aria-label={`${profile.tab} steps`}>
          {steps.map((label,i)=>(
            <li key={label} aria-current={step===i?'step':undefined} className="flex items-center gap-2">
              {i>0&&<span aria-hidden="true" className="h-px w-3 bg-line sm:w-6"/>}
              <button type="button" className={`inline-flex items-center gap-2 border-0 bg-transparent p-0 [font:inherit] disabled:cursor-not-allowed ${step===i?'font-semibold text-ink':i<step?'text-ink-2 hover:text-ink':'text-muted'}`} disabled={pending || i>step} aria-label={`Step ${i+1}: ${label}${i>step?' (locked)':''}`} onClick={()=>{if(i<=step){setError('');setStep(i)}}}>
                <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full border text-[0.7rem] font-semibold ${step===i?'border-ink bg-ink text-white':i<step?'border-ink-2 text-ink-2':'border-line'}`}>{i<step?'✓':i+1}</span>
                <span className="sm:hidden">{shortSteps[i]}</span><span className="hidden sm:inline">{label}</span>
              </button>
            </li>
          ))}
        </ol>
        {submitted&&<p className="hint">Your brief has been submitted. Required answers must stay complete when you make changes.</p>}
        <fieldset data-step="0" hidden={step!==0} className="space-y-4">
          <legend className="sr-only">{profile.identity}</legend>
          <label className="label">Project name<input {...control('title')} className="input" required minLength={3} maxLength={140}/></label>
          {renderStepFields(0)}
          <SiteLocationField value={siteLocation} onChange={setLocation} label={profile.location} hint={profile.locationHint} required={locationRequired} optional={!locationRequired}/>
          <details className="rounded border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">Location and access notes (optional)</summary><div className="mt-4 space-y-4">
          {profile.directions?<label className="label">{profile.directions}<span className="opt"> (optional)</span><textarea {...control('siteDirections')} className="input" maxLength={4000}/></label>:<input type="hidden" {...control('siteDirections')}/>}
          <label className="label">{profile.access}<span className="opt"> (optional)</span><textarea {...control('siteAccessNotes')} className="input" maxLength={4000}/></label></div></details>
        </fieldset>
        <fieldset data-step="1" hidden={step!==1} className="space-y-4">
          <legend className="sr-only">{profile.scope}</legend>
          {renderStepFields(1)}
          <details className="rounded border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">Concerns and extra context (optional)</summary><div className="mt-4 space-y-4"><label className="label">{profile.claims}<span className="opt"> (optional)</span><textarea {...control('claims')} className="input" maxLength={4000} placeholder={profile.claimsExample}/><span className="hint block">One claim per line. Your analyst will prepare checks within the agreed scope.</span></label>
          <label className="label">What worries you most?<span className="opt"> (optional)</span><textarea {...control('concerns')} className="input" maxLength={3000}/></label>
          <label className="label">{profile.value}<span className="opt"> (optional)</span><input {...control('investmentValue')} className="input" inputMode="numeric" maxLength={20}/><span className="hint block">Context only; this does not change your agreed fee.</span></label></div></details>
        </fieldset>
        {step===2&&<div className="space-y-4"><h3 className="text-base font-semibold">Review your {profile.tab.toLowerCase()}</h3><dl className="kv"><dt>Project</dt><dd>{values.title}</dd>{review.map(f=><div key={f.label} className="contents"><dt>{f.label}</dt><dd className="whitespace-pre-line break-words">{f.value}</dd></div>)}</dl><p className="hint">Your analyst will review this brief against the accepted proposal. Requested reporting frequencies and deadlines are preferences until agreed.</p></div>}
      </form>
      {extra(step)}
      {step===2&&!submitted&&<label className="check"><input type="checkbox" name="consent" form={formId} checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I consent to AngaVeritas processing the project information, documents and contacts I provide to carry out this engagement, in line with the Kenya Data Protection Act and the Privacy Policy.</span></label>}
    </div>
    <div className="sticky bottom-0 z-10 space-y-2 border-t border-line bg-white px-[clamp(1.15rem,2.5vw,1.65rem)] py-3">
      {(error||state?.error)&&<p role="alert" className="text-sm font-medium text-bad">{error||state?.error}</p>}
      {state?.ok&&!error&&<p role="status" className="text-sm text-ink-2">{state.message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">{step>0&&<button className="btn btn-secondary" type="button" disabled={pending} onClick={()=>{setError('');setStep(step-1)}}>Back</button>}{step<2&&<button className="btn btn-primary" type="button" disabled={pending} onClick={()=>submit(false,true)}>{pending?'Saving…':'Save and continue'}</button>}</div>
        <div className="flex flex-wrap gap-2"><button className="btn btn-secondary" type="submit" form={formId} disabled={pending}>{pending?'Saving…':submitted?'Save changes':'Save draft'}</button>{!submitted&&step===2&&<button className="btn btn-primary" type="button" disabled={pending} onClick={()=>submit(true)}>{pending?'Sending…':`Send ${profile.code==='ground_verification'?'site details':profile.tab.toLowerCase()}`}</button>}</div>
      </div>
    </div>
  </>
}
