import { clientOperationsAction } from '@/app/portal/operations-actions'
import { kes } from './format'

type Props = {
  projectId: string
  stage: string
  lock: { owedKes: number } | null
  openVisit: boolean
}

// The client closes out a delivered project. Reports, messages, Payments and follow-up requests stay open.
export default function CompleteProjectCard({ projectId, stage, lock, openVisit }: Props) {
  if (stage !== 'delivered') return null
  return (
    <section className="panel panel-pad space-y-3">
      <h2 className="text-lg">Finished with this project?</h2>
      <p className="text-ink-2">Mark it complete when you have what you need. Your reports, messages, Payments and follow-up requests stay available.</p>
      {lock ? (
        <p className="text-ink-2">Pay the remaining balance of {kes(lock.owedKes)} first. Then you can mark the project complete.</p>
      ) : openVisit ? (
        <p className="text-ink-2">A site visit is still open. You can mark the project complete once it is finished.</p>
      ) : (
        <form action={clientOperationsAction} className="space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="operation" value="complete_project" />
          <label className="check"><input type="checkbox" name="confirm" required /> I am finished with this project</label>
          <button className="btn btn-secondary btn-small">Mark project complete</button>
        </form>
      )}
    </section>
  )
}
