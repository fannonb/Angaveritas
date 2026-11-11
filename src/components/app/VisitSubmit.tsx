'use client'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { inspectionStatusAction } from '@/app/staff/actions'

function Send({ disabled, release }: { disabled:boolean; release:boolean }) {
  const { pending } = useFormStatus()
  return <button className="btn btn-primary btn-small" disabled={disabled || pending}>{pending ? 'Sending…' : release ? 'Finish and release to client' : 'Send for review'}</button>
}
// `release`: an admin finishes the visit and releases it to the client in one step instead of sending it for review.
export default function VisitSubmit({ inspectionId, incomplete, release = false }: { inspectionId:string; incomplete:boolean; release?:boolean }) {
  const [error,setError] = useState('')
  return <form action={inspectionStatusAction} onSubmit={e => {
    if ([...document.querySelectorAll<HTMLElement>('[data-pending-uploads]')].some(el => Number(el.dataset.pendingUploads)>0)) {
      e.preventDefault(); setError('Some files are still waiting or need a retry. Save every upload before sending the visit.')
    } else setError('')
  }}>
    <input type="hidden" name="inspectionId" value={inspectionId} /><input type="hidden" name="to" value={release ? 'released' : 'submitted'} />
    {release&&<label className="label mb-3">Reason for admin review exception<textarea className="input" name="reviewException" minLength={10} required placeholder="Why a separate reviewer is unavailable and how the evidence was checked"/></label>}
    <Send disabled={incomplete} release={release} />{error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
  </form>
}
