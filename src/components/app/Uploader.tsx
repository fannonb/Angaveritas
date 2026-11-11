'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { readUploadQueue, saveUploadQueue } from '@/lib/device-upload-queue'
import { AppIcon } from './icons'

// 'staged': chosen in the guided flow and waiting for a description before it is saved.
type Item = { name: string; file: File | null; caption: string; drone: boolean; progress: number; ticket?: { fileId: string; upload: { url: string; headers?: Record<string,string> } }; bytesSent?: boolean; state: 'staged' | 'waiting' | 'uploading' | 'done' | 'error'; note?: string; preview?: string }

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
  guided = false,
  suggestions = [],
}: {
  projectId: string
  category: 'evidence' | 'client_document' | 'report' | 'internal' | 'agreement'
  inspectionId?: string
  label?: string
  hint?: string
  accept?: string
  capture?: boolean
  allowDrone?: boolean
  /** Visit evidence: take or choose files first, describe each one, then save them together. */
  guided?: boolean
  /** Descriptions offered while describing a file, e.g. the visit's required checks. */
  suggestions?: string[]
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const photo = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [items, setItems] = useState<Item[]>([])
  const [caption, setCaption] = useState('')
  const [drone, setDrone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recover,setRecover]=useState(false)
  const [recoveryReady,setRecoveryReady]=useState(false)
  const [recoveryError,setRecoveryError]=useState('')
  const storageKey=`${projectId}:${inspectionId??''}:${category}`
  const writes=useRef(Promise.resolve())
  useEffect(()=>{
    let alive=true
    readUploadQueue<Item[]>(storageKey).then(saved=>{
      if(!alive)return
      if(saved?.length){setRecover(true);setItems(saved.map(i=>({...i,preview:undefined,state:'error',note:'Recovered on this device. Retry when connected.'})))}
      setRecoveryReady(true)
    }).catch(()=>{if(alive){setRecoveryReady(true);setRecoveryError('Device recovery is unavailable. Keep this page open until uploads finish.')}})
    return()=>{alive=false}
  },[storageKey])
  useEffect(()=>{
    if(!recoveryReady)return
    const pending=items.filter(i=>i.state!=='done')
    writes.current=writes.current.then(()=>saveUploadQueue(storageKey,recover&&pending.length?pending:null)).catch(()=>setRecoveryError('Could not save the device queue. Storage may be full. Keep this page open.'))
  },[items,recover,recoveryReady,storageKey])

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
      if(ticket) {
        const response=await fetch(`/api/files/${ticket.fileId}/retry`,{method:'POST'})
        const refreshed=await response.json()
        if(!response.ok)throw new Error(refreshed.error||'Could not resume upload.')
        if(refreshed.ready){update(i,{state:'done',file:null,note:refreshed.file.evidence_code});return}
        ticket={fileId:refreshed.fileId,upload:refreshed.upload}
        item={...item,bytesSent:refreshed.bytesSent}
        update(i,{ticket,bytesSent:refreshed.bytesSent})
      }
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

  // Guided flow: chosen files wait here with a preview until each has a description and the user saves them.
  function stage(list: FileList | null, el: HTMLInputElement | null) {
    if (!list?.length) return
    const added: Item[] = Array.from(list).map(file => ({ name: file.name, file, caption: '', drone: false, progress: 0, state: 'staged', preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined }))
    setItems((xs) => [...xs, ...added])
    if (el) el.value = ''
  }
  function remove(i: number) {
    setItems((xs) => { const gone = xs[i]; if (gone?.preview) URL.revokeObjectURL(gone.preview); return xs.filter((_, at) => at !== i) })
  }
  async function saveStaged() {
    const order = items.map((it, i) => ({ it, i })).filter((x) => x.it.state === 'staged')
    if (!order.length) return
    setBusy(true)
    for (const { it, i } of order) await uploadOne(it, i)
    setBusy(false)
    router.refresh()
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

  const status = (it: Item) => it.state === 'waiting' ? 'Waiting' : it.state === 'uploading' ? it.note ?? `Uploading ${it.progress}%` : it.state === 'done' ? `Saved${it.note ? ` · ${it.note}` : ''}` : it.note

  if (guided) {
    const staged = items.map((it, i) => ({ it, i })).filter((x) => x.it.state === 'staged')
    const sent = items.map((it, i) => ({ it, i })).filter((x) => x.it.state !== 'staged')
    const step = 'text-sm font-semibold text-ink'
    return (
      <div className="space-y-4" data-pending-uploads={unsaved}>
        <div>
          <p className={step}>1. Add photos or video</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => photo.current?.click()}><AppIcon name="camera" /> Take photo</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => video.current?.click()}><AppIcon name="video" /> Record video</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => input.current?.click()}><AppIcon name="folder" /> Choose files</button>
          </div>
          <p className="hint mt-2">Location and time are read from each photo. Permits, receipts and IDs can be photographed or added as PDFs.</p>
          <input ref={photo} type="file" hidden accept="image/*" capture="environment" onChange={(e) => stage(e.target.files, e.target)} />
          <input ref={video} type="file" hidden accept="video/*" capture="environment" onChange={(e) => stage(e.target.files, e.target)} />
          <input ref={input} type="file" hidden multiple accept={accept} onChange={(e) => stage(e.target.files, e.target)} />
        </div>

        {staged.length > 0 && (
          <div className="space-y-3 rounded-lg border border-line p-3">
            <p className={step}>2. Say what each one shows</p>
            <ul className="space-y-3">
              {staged.map(({ it, i }) => (
                <li key={i} className="flex gap-3">
                  {it.preview
                    ? <img src={it.preview} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                    : <span className="grid h-16 w-16 shrink-0 place-items-center rounded bg-paper text-muted"><AppIcon name={it.file?.type.startsWith('video/') ? 'video' : 'file'} /></span>}
                  <div className="min-w-0 flex-1 space-y-1">
                    <input className="input" list={listId} value={it.caption} maxLength={500} aria-label={`What ${it.name} shows`}
                      placeholder="What does this show? e.g. Shop front with signage" onChange={(e) => update(i, { caption: e.target.value })} />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="max-w-[14rem] truncate">{it.name}</span>
                      {allowDrone && <label className="check text-xs"><input type="checkbox" checked={it.drone} onChange={(e) => update(i, { drone: e.target.checked })} /> Drone footage</label>}
                      <button type="button" className="linkish text-xs" disabled={busy} onClick={() => remove(i)}>Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
            <p className={step}>3. Save</p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={saveStaged}>
              {busy ? 'Saving…' : `Save ${staged.length} ${staged.length === 1 ? 'item' : 'items'}`}
            </button>
          </div>
        )}

        {sent.length > 0 && (
          <ul className="space-y-2 text-sm" aria-live="polite">
            {sent.map(({ it, i }) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate">{it.caption || it.name}</span>
                <span className={it.state === 'error' ? 'text-bad' : it.state === 'done' ? 'text-ok' : 'text-muted'}>{status(it)}</span>
                {it.state === 'uploading' && <progress className="w-full" max={100} value={it.progress} aria-label={`Upload progress for ${it.name}`} />}
                {it.state === 'error' && <span className="flex gap-3"><button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => retry(i)}>Retry</button><button type="button" className="linkish text-xs" disabled={busy} onClick={() => remove(i)}>Remove</button></span>}
              </li>
            ))}
          </ul>
        )}
        {unsaved > 0 && <p className="hint">{unsaved} {unsaved === 1 ? 'item is' : 'items are'} not saved yet. Save before sending the visit for review.</p>}
        {recoveryError && <p className="alert alert-warn" role="alert">{recoveryError}</p>}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Weak connection?</summary>
          <label className="check mt-2"><input type="checkbox" checked={recover} disabled={!recoveryReady || busy} onChange={(e) => setRecover(e.target.checked)} />Keep unsaved files on this device so I can retry after closing the page.</label>
          {recover && <p className="hint mt-1">Use a trusted device. Reopen this visit and choose Retry to continue.</p>}
        </details>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-white p-4" data-pending-uploads={unsaved}>
      <label className="check mb-3"><input type="checkbox" checked={recover} disabled={!recoveryReady||busy} onChange={e=>setRecover(e.target.checked)}/>Keep unfinished uploads on this device so I can retry after closing the tab.</label>
      {recover&&<p className="hint mb-3">Use a trusted device. Files remain here until uploaded or removed. Reopen this project and choose Retry to continue.</p>}
      {recoveryError&&<p className="alert alert-warn" role="alert">{recoveryError}</p>}
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
              {it.state === 'error' && <><button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => retry(i)}>Retry {it.name}</button><button type="button" className="linkish text-sm" disabled={busy} onClick={()=>setItems(xs=>xs.filter((_,at)=>at!==i))}>Remove from device queue</button></>}
            </li>
          ))}
        </ul>
      )}
      {unsaved > 0 && <p className="hint mt-2">{unsaved} file{unsaved === 1 ? '' : 's'} still need saving. Keep this page open; wait for “Saved” before submitting the visit.</p>}
    </div>
  )
}
