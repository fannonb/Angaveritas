'use client'

import { briefProfile } from '@/lib/service-briefs'
import { decisionTimelines, investmentBands } from '@/lib/labels'

export type Brief = { title: string; description: string; claims: string; concerns: string; investmentBand: string; decisionTimeline: string }
export const emptyBrief: Brief = { title: '', description: '', claims: '', concerns: '', investmentBand: '', decisionTimeline: '' }

// The needs assessment from the customer journey (stage 2): what the client is
// deciding, what they have been told, and what worries them.
export default function BriefFields({ value, onChange, custom = false, serviceCode }: { value: Brief; onChange: (b: Brief) => void; custom?: boolean; serviceCode?: string }) {
  const profile = briefProfile({service_code:serviceCode})
  const set = (k: keyof Brief) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <fieldset className="space-y-4">
      <legend className="text-lg font-semibold">{profile.title}</legend>
      <p className="hint -mt-2">{profile.intro}</p>
      <label className="label">
        Project name
        <input className="input" maxLength={140} required value={value.title} onChange={set('title')} placeholder={profile.requestExample} />
      </label>
      <label className="label">
        {custom ? 'What do you need checked?' : <>What is the project? <span className="opt">(optional)</span></>}
        <textarea className="input" maxLength={4000} required={custom} value={value.description} onChange={set('description')} placeholder="What it is, who is involved, and where things stand today." />
      </label>
      <label className="label">
        {profile.claims} <span className="opt">(optional)</span>
        <textarea className="input" maxLength={4000} value={value.claims} onChange={set('claims')} placeholder={profile.claimsExample} />
        <span className="hint block">Your analyst uses these priorities to prepare the proposed scope.</span>
      </label>
      <label className="label">
        What worries you most? <span className="opt">(optional)</span>
        <textarea className="input min-h-[4.5rem]" maxLength={3000} value={value.concerns} onChange={set('concerns')} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Approximate investment <span className="opt">(optional)</span>
          <select className="input" value={value.investmentBand} onChange={set('investmentBand')}>
            <option value="">Choose…</option>
            {investmentBands.map((b) => <option key={b}>{b}</option>)}
          </select>
          <span className="hint block">Helps us plan. It never affects the price.</span>
        </label>
        <label className="label">
          When do you need to decide? <span className="opt">(optional)</span>
          <select className="input" value={value.decisionTimeline} onChange={set('decisionTimeline')}>
            <option value="">Choose…</option>
            {decisionTimelines.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
  )
}
