'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveInspectionChecksAction } from '../../actions'

type Check = { id: string; label: string; required: boolean; outcome: string; note: string | null; evidence_ids: string[] }
type Evidence = { id: string; evidence_code: string | null; filename: string; caption: string | null }
type Value = { outcome: string; note: string; evidence: string[] }

const outcomes: [string, string][] = [['checked', 'Checked'], ['could_not_check', 'Could not check'], ['another_visit', 'Needs another visit'], ['pending', 'Not yet']]
const placeholders: Record<string, string> = {
  checked: 'What you saw, e.g. walls at roof level, six workers on site',
  could_not_check: 'Why it could not be checked, e.g. gate locked, owner unavailable',
  another_visit: 'What still needs checking and why',
}
const chosenStyle: Record<string, string> = {
  checked: 'border-ink bg-ink text-white',
  could_not_check: 'border-warn bg-warn-bg text-warn',
  another_visit: 'border-warn bg-warn-bg text-warn',
  pending: 'border-line-strong bg-paper text-ink',
}

function Save({ changed }: { changed: number }) {
  const { pending } = useFormStatus()
  return <button className="btn btn-primary" type="submit" disabled={pending || !changed}>{pending ? 'Saving…' : 'Save checks'}</button>
}

const valueOf = (c: Check): Value => ({ outcome: c.outcome, note: c.note ?? '', evidence: c.evidence_ids })
const same = (a: Value, b: Value) => a.outcome === b.outcome && a.note === b.note && a.evidence.length === b.evidence.length && a.evidence.every((e) => b.evidence.includes(e))

// All of a visit's required checks in one form: pick an outcome, say what you found, attach photos, save once.
export default function ChecksForm({ inspectionId, checks, evidence }: { inspectionId: string; checks: Check[]; evidence: Evidence[] }) {
  const [values, setValues] = useState<Record<string, Value>>(() => Object.fromEntries(checks.map((c) => [c.id, valueOf(c)])))
  const set = (id: string, patch: Partial<Value>) => setValues((v) => ({ ...v, [id]: { ...v[id], ...patch } }))
  // Compared with the saved values on every render, so the count clears once the page refreshes after saving.
  const changed = checks.filter((c) => values[c.id] && !same(values[c.id], valueOf(c))).length

  return (
    <form action={saveInspectionChecksAction}>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <ol className="divide-y divide-line">
        {checks.map((c, n) => {
          const v = values[c.id] ?? valueOf(c)
          const open = v.outcome !== 'pending'
          return (
            <li key={c.id} data-check={c.id} className="space-y-3 px-6 py-4">
              <input type="hidden" name="checkId" value={c.id} />
              <div className="flex items-start gap-3">
                <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${v.outcome === 'checked' ? 'bg-ink text-white' : 'bg-paper text-ink-2'}`}>{v.outcome === 'checked' ? '✓' : n + 1}</span>
                <p className="font-semibold leading-snug text-ink">{c.label}{!c.required && <span className="ml-2 text-xs font-normal text-muted">no longer required</span>}</p>
              </div>
              <div className="flex flex-wrap gap-2 pl-9" role="radiogroup" aria-label={`Outcome: ${c.label}`}>
                {outcomes.map(([value, label]) => (
                  <label key={value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold ${v.outcome === value ? chosenStyle[value] : 'border-line text-ink-2 hover:bg-paper'}`}>
                    <input type="radio" className="sr-only" name={`outcome:${c.id}`} value={value} checked={v.outcome === value} onChange={() => set(c.id, { outcome: value })} />
                    {label}
                  </label>
                ))}
              </div>
              {open ? (
                <div className="space-y-3 pl-9">
                  <label className="label">
                    What you found
                    <textarea className="input min-h-[4.5rem]" name={`note:${c.id}`} value={v.note} required minLength={3} maxLength={4000}
                      placeholder={placeholders[v.outcome]} onChange={(e) => set(c.id, { note: e.target.value })} />
                  </label>
                  {evidence.length > 0 && (
                    <fieldset>
                      <legend className="label">Photos that show it <span className="opt">(optional{v.outcome === 'checked' ? '; none chosen links all of this visit’s checked photos' : ''})</span></legend>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {evidence.map((e) => {
                          const on = v.evidence.includes(e.id)
                          return (
                            <label key={e.id} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold ${on ? 'border-ink bg-paper text-ink' : 'border-line text-ink-2 hover:bg-paper'}`}>
                              <input type="checkbox" className="sr-only" name={`evidence:${c.id}`} value={e.id} checked={on}
                                onChange={() => set(c.id, { evidence: on ? v.evidence.filter((x) => x !== e.id) : [...v.evidence, e.id] })} />
                              {on ? '✓ ' : ''}<span className="font-mono">{e.evidence_code}</span> · {e.caption || e.filename}
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                  )}
                </div>
              ) : (
                <input type="hidden" name={`note:${c.id}`} value={v.note} />
              )}
            </li>
          )
        })}
      </ol>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-6 py-3">
        <span className="text-sm text-muted" aria-live="polite">{changed ? `${changed} unsaved ${changed === 1 ? 'change' : 'changes'}` : 'All checks saved'}</span>
        <Save changed={changed} />
      </div>
    </form>
  )
}
