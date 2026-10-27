'use client'

import { useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

function Send({ internal }: { internal: boolean }) {
  const { pending } = useFormStatus()
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <button className="btn btn-primary btn-small" type="submit" disabled={pending}>
        {pending ? 'Sending…' : internal ? 'Save internal note' : 'Send'}
      </button>
    </div>
  )
}

export function MessageForm({ action, hidden, staff }: { action: (form: FormData) => Promise<void>; hidden: Record<string, string>; staff?: boolean }) {
  const form = useRef<HTMLFormElement>(null)
  const [internal,setInternal] = useState(false)
  return (
    <form
      ref={form}
      action={async (fd) => {
        await action(fd)
        form.current?.reset()
        setInternal(false)
      }}
      className="space-y-2 border-0 border-t border-solid border-line pt-3"
    >
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {staff && <fieldset className="space-y-2"><legend className="label">Who should see this?</legend><label className="check"><input type="radio" name="audience" value="client" checked={!internal} onChange={() => setInternal(false)} />Client conversation</label><label className="check"><input type="radio" name="audience" value="team" checked={internal} onChange={() => setInternal(true)} />Internal note — team only</label></fieldset>}
      {internal && <><input type="hidden" name="internal" value="on" /><p className="alert alert-warn text-sm">Only staff can see this note. The client will not receive it.</p></>}
      <label className="label">
        <span className="sr-only">Message</span>
        <textarea className="input" name="body" required maxLength={8000} placeholder="Write a message…" />
      </label>
      <Send internal={internal} />
    </form>
  )
}
