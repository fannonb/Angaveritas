'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { acceptProposalAction, declineProposalAction, type ActionState } from '../../actions'

function Submit({ children, pending: pendingText, className = 'btn btn-primary' }: { children: React.ReactNode; pending: string; className?: string }) {
  const { pending } = useFormStatus()
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  )
}

// Stage 3: the client accepts (typed-name signature) or declines.
export default function ProposalResponse({ proposalId, clientName, total, verified }: { proposalId: string; clientName: string; total: string; verified: boolean }) {
  const [accepted, accept] = useActionState<ActionState, FormData>(acceptProposalAction, null)
  const [declined, decline] = useActionState<ActionState, FormData>(declineProposalAction, null)
  const [mode, setMode] = useState<'accept' | 'decline'>('accept')

  if (declined?.ok) return <p className="alert alert-ok">Thank you for letting us know. You can still message us below if anything changes.</p>

  return (
    <section className="panel panel-pad space-y-4" aria-labelledby="respond">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="respond" className="text-lg">{mode === 'accept' ? 'Accept and sign' : 'Decline this proposal'}</h2>
        <button type="button" className="linkish text-sm" onClick={() => setMode(mode === 'accept' ? 'decline' : 'accept')}>
          {mode === 'accept' ? 'Decline instead' : 'Back to accepting'}
        </button>
      </div>

      {mode === 'accept' ? (
        <form action={accept} className="space-y-4">
          <input type="hidden" name="proposalId" value={proposalId} />
          {!verified && <p className="alert alert-warn">Confirm your email address first (see the banner at the top), then come back to sign.</p>}
          <label className="check">
            <input type="checkbox" name="agree" required />
            <span>I accept the scope, the price of {total} and the Terms of Service, and I am authorised to engage AngaVeritas for this work.</span>
          </label>
          <label className="check">
            <input type="checkbox" name="nda" />
            <span>I would like a separate non-disclosure agreement (NDA) before work starts.</span>
          </label>
          <label className="label">
            Type your full name to sign
            <input className="input" name="acceptedName" required maxLength={120} placeholder={clientName} autoComplete="off" />
            <span className="hint block">This is your electronic signature. We record the date, time and your connection.</span>
          </label>
          {accepted?.error && <p role="alert" className="alert alert-bad">{accepted.error}</p>}
          <Submit pending="Signing…">Accept proposal</Submit>
        </form>
      ) : (
        <form action={decline} className="space-y-4">
          <input type="hidden" name="proposalId" value={proposalId} />
          <label className="label">
            Can you tell us why? <span className="opt">(optional)</span>
            <textarea className="input" name="reason" maxLength={2000} placeholder="e.g. price, timing, scope. If something just needs changing, tell us and we can revise the proposal." />
          </label>
          {declined?.error && <p role="alert" className="alert alert-bad">{declined.error}</p>}
          <Submit pending="Sending…" className="btn btn-danger">Decline proposal</Submit>
        </form>
      )}
    </section>
  )
}
