import { briefAnswers, briefProfile, type BriefContext } from '@/lib/service-briefs'

export default function ServiceBriefSummary({ context, value, includeSensitive = true }: { context: BriefContext; value: unknown; includeSensitive?: boolean }) {
  const profile = briefProfile(context)
  const answers = briefAnswers(profile, value)
  const fields = profile.fields.filter(field => answers[field.key] && (includeSensitive || !field.sensitive))
  if (!fields.length) return <p className="hint">No service-specific details have been supplied yet.</p>
  return <dl className="kv">{fields.map(field => <div key={field.key} className="contents"><dt>{field.label}</dt><dd className="whitespace-pre-line break-words">{answers[field.key]}</dd></div>)}</dl>
}
