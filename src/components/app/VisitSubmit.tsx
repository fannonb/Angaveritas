'use client'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { inspectionStatusAction } from '@/app/staff/actions'

function Send({ disabled }: { disabled:boolean }) {
  const { pending } = useFormStatus()
  return <button className="btn btn-primary btn-small" disabled={disabled || pending}>{pending ? 'Sending…' : 'Send for review'}</button>
}
export default function VisitSubmit({ inspectionId, incomplete }: { inspectionId:string; incomplete:boolean }) {
  const [error,setError] = useState('')
  return <form action={inspectionStatusAction} onSubmit={e => {
    if ([...document.querySelectorAll<HTMLElement>('[data-pending-uploads]')].some(el => Number(el.dataset.pendingUploads)>0)) {
      e.preventDefault(); setError('Some files are still waiting or need a retry. Save every upload before sending the visit.')
    } else setError('')
  }}>
    <input type="hidden" name="inspectionId" value={inspectionId} /><input type="hidden" name="to" value="submitted" />
    <Send disabled={incomplete} />{error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
  </form>
}
