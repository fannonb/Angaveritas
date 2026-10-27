import type { MessageRow } from '@/lib/data/messages'
import { roleLabels, type Role } from '@/lib/labels'
import { fmtDateTime } from './format'
import { MessageForm } from './MessageForm'

// A conversation attached to a request or project. Staff can also leave
// internal notes that clients never see.
export default function Messages({
  messages,
  viewerId,
  tz,
  action,
  hidden,
  staff,
  emptyText = 'No messages yet. Ask us anything about this work and your analyst will reply here.',
}: {
  messages: MessageRow[]
  viewerId: string
  tz?: string
  action: (form: FormData) => Promise<void>
  hidden: Record<string, string>
  staff?: boolean
  emptyText?: string
}) {
  return (
    <div className="space-y-3">
      {messages.length === 0 && <p className="empty">{emptyText}</p>}
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.internal ? 'msg-internal' : m.author_id === viewerId ? 'msg-mine' : ''}`}>
          <p className="msg-meta">
            <strong className="text-ink">{m.author_id === viewerId ? 'You' : m.author_name}</strong>
            {m.author_role !== 'client' && m.author_id !== viewerId ? ` · AngaVeritas ${roleLabels[m.author_role as Role].toLowerCase()}` : ''}
            {' · '}
            {fmtDateTime(m.created_at, tz)}
            {m.internal ? ' · internal note' : ''}
          </p>
          <p className="whitespace-pre-line text-[0.97rem]">{m.body}</p>
        </div>
      ))}
      <MessageForm action={action} hidden={hidden} staff={staff} />
    </div>
  )
}
