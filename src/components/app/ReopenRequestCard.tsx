import { clientOperationsAction } from '@/app/portal/operations-actions'
import { fmtDate } from './format'

type Props = { projectId: string; stage: string; pending: { created_at: Date } | null; tz: string }

// A closed project can only be reopened by the team. The client asks; an admin decides.
export default function ReopenRequestCard({ projectId, stage, pending, tz }: Props) {
  if (stage !== 'closed') return null
  return (
    <section className="panel panel-pad space-y-3">
      <h2 className="text-lg">Something still needs attention?</h2>
      {pending ? (
        <p className="text-ink-2">You asked us to reopen this project on {fmtDate(pending.created_at, tz)}. Our team will get back to you. Nothing changes until they reopen it.</p>
      ) : (
        <details>
          <summary className="cursor-pointer font-semibold">Ask us to reopen the project</summary>
          <form action={clientOperationsAction} className="mt-3 space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="operation" value="request_reopen" />
            <p className="hint">Tell us what is still outstanding. Our team reviews the request before any work resumes.</p>
            <label className="label">What still needs attention<textarea className="input" name="reason" required minLength={10} maxLength={2000} placeholder="e.g. The access road photos are missing from the report" /></label>
            <button className="btn btn-secondary btn-small">Send request</button>
          </form>
        </details>
      )}
    </section>
  )
}
