'use client'

import { useEffect, useRef, useState } from 'react'

type Copy = { text: string; from: string }

/**
 * The one place a field agent writes notes. Saving uses the revision-checked notes API, so a dropped
 * connection never loses what is on screen. Keeping a copy on the phone is opt-in, for private devices.
 */
export default function FieldNotes({ inspectionId, userId, notes, revision }: { inspectionId: string; userId: string; notes: string; revision: string }) {
  const key = `av-field-notes:${userId}:${inspectionId}`
  const [text, setText] = useState(notes)
  const [base, setBase] = useState(revision)
  const [keepCopy, setKeepCopy] = useState(false)
  const [copy, setCopy] = useState<Copy | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const saved = useRef(notes)

  useEffect(() => {
    try {
      setKeepCopy(localStorage.getItem('av-field-notes-copy') === '1')
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Copy | null
      if (stored && stored.text !== saved.current) setCopy(stored)
    } catch {}
  }, [key])

  // A newer revision with the same saved notes (the visit was started, say) is safe to build on.
  useEffect(() => {
    if (notes === saved.current) setBase(revision)
    else if (text === saved.current) { setText(notes); setBase(revision) }
    saved.current = notes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, revision])

  const store = (value: string) => { try { localStorage.setItem(key, JSON.stringify({ text: value, from: saved.current })) } catch {} }

  function change(value: string) {
    setText(value)
    setMessage('')
    if (keepCopy) store(value)
  }

  function toggleCopy(on: boolean) {
    setKeepCopy(on)
    try {
      localStorage.setItem('av-field-notes-copy', on ? '1' : '0')
      if (on) store(text)
      else localStorage.removeItem(key)
    } catch {
      setMessage('This phone cannot keep a copy. Leave this page open until your notes are saved.')
    }
  }

  function restore(c: Copy) {
    setText(c.text)
    setCopy(null)
    setMessage(c.from === saved.current ? 'Notes put back. Save them to send them.' : 'Notes put back, but someone has changed the saved notes since. Check before saving: saving replaces them.')
  }

  async function save() {
    setBusy(true)
    try {
      const response = await fetch('/api/field-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inspectionId, notes: text, revision: base }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) return setMessage(result.error ?? 'Could not save your notes.')
      setBase(result.revision)
      saved.current = text
      try { localStorage.removeItem(key) } catch {}
      setMessage(`Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`)
    } catch {
      setMessage(keepCopy ? 'No signal. A copy is kept on this phone. Press Save again when you are back online.' : 'No signal. Your notes are still here: keep this page open and press Save again when you are back online.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel panel-pad space-y-3">
      <h2 className="text-lg">Notes</h2>
      <p className="hint">Times, who you spoke to, conditions, anything odd. Only staff see these.</p>
      {copy && (
        <div className="alert alert-warn flex flex-wrap items-center justify-between gap-2">
          <span>This phone has notes that were not saved.</span>
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => restore(copy)}>Put them back</button>
        </div>
      )}
      <textarea className="input min-h-[10rem]" name="fieldNotes" aria-label="Notes" value={text} maxLength={20000} onChange={(e) => change(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save notes'}</button>
        <span role="status" className="text-sm text-muted">{message || (text !== saved.current ? 'Not saved yet' : '')}</span>
      </div>
      <label className="check text-sm"><input type="checkbox" checked={keepCopy} onChange={(e) => toggleCopy(e.target.checked)} />Keep a copy on this phone in case the signal drops</label>
    </section>
  )
}
