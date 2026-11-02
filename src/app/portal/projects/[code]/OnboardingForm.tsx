'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { briefAnswers, briefProfile, type BriefContext, type BriefField } from '@/lib/service-briefs'
import { saveOnboardingAction, type ActionState } from '../../actions'

type Values = {
  projectId:string; title:string; locationLabel:string|null; county:string|null
  siteDirections:string|null; siteAccessNotes:string|null; claims:string|null
  concerns:string|null; investmentValue:string|null; context:BriefContext; serviceBrief:unknown
}
export default function OnboardingForm({v,submitted}:{v:Values;submitted:boolean}) {
  const profile = briefProfile(v.context)
  const [values,setValues] = useState<Record<string,string>>(() => ({title:v.title,locationLabel:v.locationLabel??'',county:v.county??'',siteDirections:v.siteDirections??'',siteAccessNotes:v.siteAccessNotes??'',claims:v.claims??'',concerns:v.concerns??'',investmentValue:v.investmentValue??'',...Object.fromEntries(Object.entries(briefAnswers(profile,v.serviceBrief)).map(([k,value]) => [`service.${k}`,value]))}))
  const [consent,setConsent] = useState(false)
  const [state,action,pending] = useActionState<ActionState,FormData>(saveOnboardingAction,null)
  const [step,setStep] = useState(0)
  const [error,setError] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const focus = (name:string) => requestAnimationFrame(() => {
    const input = form.current?.elements.namedItem(name) as HTMLElement|null
    input?.closest('details')?.setAttribute('open','')
    input?.focus()
  })
  useEffect(() => {
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
  function submit(final:boolean) {
    setError('')
    if (final && !validate([0,1])) return
    if (final && !submitted && !consent) {setError('Please confirm consent to process the project information.');focus('consent');return}
    if (!form.current) return
    const data = new FormData(form.current)
    data.set('intent',final?'1':'0')
    startTransition(() => action(data))
  }
  const control = (name:string) => ({name,value:values[name]??'',onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => setValues(old => ({...old,[name]:e.target.value}))})
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
  return <form ref={form} noValidate onSubmit={e=>{e.preventDefault();submit(false)}} className="space-y-5">
    <input type="hidden" name="projectId" value={v.projectId}/>
    <p className="hint">{profile.intro} Required questions have no “optional” label. Save a draft at any stage.</p>
    <ol className="grid grid-cols-3 gap-2 py-1" aria-label={`${profile.tab} steps`}>{[profile.identity,profile.scope,'Review & send'].map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={`flex items-center justify-center rounded border px-2 py-2 text-center text-xs font-semibold sm:text-sm ${step===i?'border-ink bg-ink text-white':'border-line bg-white text-muted'}`}>{i+1}. {label}</li>)}</ol>
    <fieldset data-step="0" hidden={step!==0} className="space-y-4">
      <legend className="mb-3 text-lg font-semibold">{profile.identity}</legend>
      <label className="label">Project name<input {...control('title')} className="input" required minLength={3} maxLength={140}/></label>
      {renderStepFields(0)}
      <label className="label">{profile.location}{!profile.physicalLocation&&profile.code!=='feasibility'&&<span className="opt"> (optional)</span>}<input {...control('locationLabel')} className="input" required={profile.code==='feasibility'||(profile.physicalLocation&&!values.siteDirections.trim())} maxLength={200} aria-describedby="location-help"/><span id="location-help" className="hint block">{profile.locationHint}</span></label>
      <label className="label">County / area <span className="opt">(optional)</span><input {...control('county')} className="input" maxLength={80}/></label>
      {profile.directions?<label className="label">{profile.directions} <span className="opt">(optional)</span><textarea {...control('siteDirections')} className="input" maxLength={4000}/></label>:<input type="hidden" {...control('siteDirections')}/>}
      <label className="label">{profile.access} <span className="opt">(optional)</span><textarea {...control('siteAccessNotes')} className="input" maxLength={4000}/></label>
    </fieldset>
    <fieldset data-step="1" hidden={step!==1} className="space-y-4">
      <legend className="mb-3 text-lg font-semibold">{profile.scope}</legend>
      {renderStepFields(1)}
      <label className="label">{profile.claims} <span className="opt">(optional)</span><textarea {...control('claims')} className="input" maxLength={4000} placeholder={profile.claimsExample}/><span className="hint block">One claim per line. Your analyst will prepare checks within the agreed scope.</span></label>
      <label className="label">What worries you most? <span className="opt">(optional)</span><textarea {...control('concerns')} className="input" maxLength={3000}/></label>
      <label className="label">{profile.value} <span className="opt">(optional)</span><input {...control('investmentValue')} className="input" inputMode="numeric" maxLength={20}/><span className="hint block">Context only; this does not change your agreed fee.</span></label>
    </fieldset>
    {step===2&&<div className="space-y-4"><h3 className="text-lg">Review your {profile.tab.toLowerCase()}</h3><dl className="kv"><dt>Project</dt><dd>{values.title}</dd>{review.map(f=><div key={f.label} className="contents"><dt>{f.label}</dt><dd className="whitespace-pre-line break-words">{f.value}</dd></div>)}</dl><p className="hint">Add contacts and available documents separately. Your analyst will review this brief against the accepted proposal. Requested reporting frequencies and deadlines are preferences until agreed.</p>{!submitted&&<label className="check"><input type="checkbox" name="consent" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I consent to AngaVeritas processing the project information, documents and contacts I provide to carry out this engagement, in line with the Kenya Data Protection Act and the Privacy Policy.</span></label>}</div>}
    {(error||state?.error)&&<p role="alert" className="alert alert-bad">{error||state?.error}</p>}
    {state?.ok&&!error&&<p role="status" className="alert alert-ok">{state.message}</p>}
    <div className="flex flex-wrap justify-between gap-3"><div className="flex gap-2">{step>0&&<button className="btn btn-secondary" type="button" disabled={pending} onClick={()=>{setError('');setStep(step-1)}}>Back</button>}{step<2&&<button className="btn btn-primary" type="button" disabled={pending} onClick={()=>{if(validate([step]))setStep(step+1)}}>Continue</button>}</div><div className="flex flex-wrap gap-3"><button className="btn btn-secondary" type="submit" disabled={pending}>{pending?'Saving…':'Save'}</button>{!submitted&&step===2&&<button className="btn btn-primary" type="button" disabled={pending} onClick={()=>submit(true)}>{pending?'Sending…':`Send ${profile.code==='ground_verification'?'site details':profile.tab.toLowerCase()}`}</button>}</div></div>
  </form>
}
