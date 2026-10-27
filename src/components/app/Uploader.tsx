'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Item = { name: string; file: File | null; caption: string; drone: boolean; progress: number; ticket?: { fileId: string; upload: { url: string; headers?: Record<string,string> } }; bytesSent?: boolean; state: 'waiting' | 'uploading' | 'done' | 'error'; note?: string }

function sendBytes(file: File, upload: NonNullable<Item['ticket']>['upload'], progress: (percent: number) => void) {
  return new Promise<void>((resolve,reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT',upload.url)
    xhr.setRequestHeader('Content-Type',file.type || 'application/octet-stream')
    for (const [key,value] of Object.entries(upload.headers ?? {})) xhr.setRequestHeader(key,value)
    xhr.timeout = 180000
    xhr.upload.onprogress = e => { if (e.lengthComputable) progress(Math.round(e.loaded/e.total*100)) }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The file did not upload. Retry when your connection is ready.'))
    xhr.onerror = () => reject(new Error('Connection lost. Keep this page open and retry.'))
    xhr.ontimeout = () => reject(new Error('Upload timed out. Retry when your connection is ready.'))
    xhr.send(file)
  })
}

// Uploads in three steps (see /api/files): register the file, send the bytes
// (to our server or straight to storage), then confirm so the server can hash
// it and read the photo's GPS and time.
export default function Uploader({
  projectId,
  category,
  inspectionId,
  label = 'Add files',
  hint,
  accept,
  capture,
  allowDrone,
}: {
  projectId: string
  category: 'evidence' | 'client_document' | 'report' | 'internal' | 'agreement'
  inspectionId?: string
  label?: string
  hint?: string
  accept?: string
  capture?: boolean
  allowDrone?: boolean
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [caption, setCaption] = useState('')
  const [drone, setDrone] = useState(false)
  const [busy, setBusy] = useState(false)

  const update = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const unsaved = items.filter(i => i.state !== 'done').length
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload',warn)
    return () => window.removeEventListener('beforeunload',warn)
  },[unsaved])

  async function uploadOne(item: Item, i: number) {
    const file = item.file
    if (!file) return
    update(i, { state: 'uploading', note:undefined })
    try {
      let ticket = item.ticket
      if (!ticket) {
      const start = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, inspectionId: inspectionId ?? null, category, drone:item.drone, filename: file.name, size: file.size, mime: file.type || 'application/octet-stream', caption: item.caption || undefined }),
      })
      const s = await start.json().catch(() => ({}))
      if (!start.ok) throw new Error(s.error || 'Upload refused.')
      ticket = s as NonNullable<Item['ticket']>
      update(i,{ticket})
      }
      if (!item.bytesSent) {
        await sendBytes(file,ticket.upload,progress => update(i,{progress}))
        update(i,{bytesSent:true,progress:100})
      }
      update(i,{note:'Checking and saving…'})
      const done = await fetch(`/api/files/${ticket.fileId}/complete`, { method: 'POST' })
      const d = await done.json().catch(() => ({}))
      if (!done.ok) throw new Error(d.error || 'Upload failed.')
      update(i, { state: 'done', file:null, note: [d.file?.evidence_code, d.file?.integrity_flag ? 'awaiting evidence review' : ''].filter(Boolean).join(' · ') })
    } catch (e) {
      update(i, { state: 'error', note: e instanceof Error ? e.message : 'Upload failed.' })
    }
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return
    const files: Item[] = Array.from(list).map(file => ({name:file.name,file,caption,drone,progress:0,state:'waiting'}))
    const offset = items.length
    setItems((xs) => [...xs, ...files])
    setBusy(true)
    // One at a time: kinder to weak mobile connections in the field.
    for (let i = 0; i < files.length; i++) await uploadOne(files[i], offset + i)
    setBusy(false)
    setCaption('')
    if (input.current) input.current.value = ''
    router.refresh()
  }

  async function retry(i: number) {
    if (busy) return
    setBusy(true)
    await uploadOne(items[i],i)
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-white p-4" data-pending-uploads={unsaved}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="label min-w-[12rem] flex-1">
          Caption <span className="opt">(optional, applies to the next upload)</span>
          <input className="input" value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} placeholder={category === 'evidence' ? 'What does this show?' : 'What is this document?'} />
        </label>
        {allowDrone && (
          <label className="check pb-3">
            <input type="checkbox" checked={drone} onChange={(e) => setDrone(e.target.checked)} /> Drone imagery
          </label>
        )}
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : label}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={accept}
          {...(capture ? { capture: 'environment' as const } : {})}
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>
      {hint && <p className="hint mt-2">{hint}</p>}
      {items.length > 0 && (
        <ul className="mt-3 space-y-3 text-sm" aria-live="polite">
          {items.map((it, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2">
              <span className="truncate">{it.name}</span>
              <span className={it.state === 'error' ? 'text-bad' : it.state === 'done' ? 'text-ok' : 'text-muted'}>
                {it.state === 'waiting' ? 'Waiting' : it.state === 'uploading' ? it.note ?? `Uploading ${it.progress}%` : it.state === 'done' ? `Saved${it.note ? ` · ${it.note}` : ''}` : it.note}
              </span>
              {it.state === 'uploading' && <progress className="w-full" max={100} value={it.progress} aria-label={`Upload progress for ${it.name}`} />}
              {it.state === 'error' && <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => retry(i)}>Retry {it.name}</button>}
            </li>
          ))}
        </ul>
      )}
      {unsaved > 0 && <p className="hint mt-2">{unsaved} file{unsaved === 1 ? '' : 's'} still need saving. Keep this page open; wait for “Saved” before submitting the visit.</p>}
    </div>
  )
}
