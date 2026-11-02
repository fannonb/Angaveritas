import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ queued: [] as { to: string[]; replyTo: string; attachments: unknown }[], users: [] as { id: string; role: string; email: string; email_updates: boolean; disabled_at: null }[], notifications: [] as string[] }))
vi.mock('@/lib/db', () => {
  const sql = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join('?')
    if (query.includes('insert into email_outbox')) {
      state.queued.push({ to: values[0] as string[], replyTo: values[3] as string, attachments: values[4] })
      return [{ id: `mail-${state.queued.length}` }]
    }
    if (query.includes('select id, role')) return state.users
    if (query.includes('select email, email_updates')) return state.users
    if (query.includes('select email, full_name')) return [{ ...state.users[0], full_name: 'Test Client' }]
    if (query.includes('insert into notifications')) state.notifications.push(values[0] as string)
    return []
  }, { json: (value: unknown) => value })
  return { sql }
})

import { sendEmail, teamInboxes } from '@/lib/email'
import { notifyTeam, notifyUser } from '@/lib/activity'

beforeEach(() => {
  state.queued = []; state.users = []; state.notifications = []
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('NOTIFY_EMAIL', 'owner@example.com')
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('business notification routing', () => {
  it('always includes the shared inbox and parses additional addresses without duplicates', () => {
    vi.stubEnv('NOTIFY_EMAIL', ' OWNER@example.com; info@angaveritas.com,owner@example.com ')
    expect(teamInboxes()).toEqual(['info@angaveritas.com', 'owner@example.com'])
  })

  it('queues private business copies with the invoice attachment and replies to the shared inbox', async () => {
    await sendEmail({ to: 'client@example.com', subject: 'Invoice', text: 'Your invoice', copyTeam: true, attachments: [{ filename: 'invoice.pdf', content: new Uint8Array([1, 2]) }] })
    expect(state.queued.map(mail => mail.to)).toEqual([['info@angaveritas.com'], ['owner@example.com'], ['client@example.com']])
    expect(state.queued.every(mail => mail.replyTo === 'info@angaveritas.com')).toBe(true)
    expect(state.queued.every(mail => JSON.stringify(mail.attachments) === JSON.stringify([{ filename: 'invoice.pdf', content: 'AQI=' }]))).toBe(true)
  })

  it('does not copy authentication emails or duplicate an existing recipient', async () => {
    await sendEmail({ to: 'client@example.com', subject: 'Reset password', text: 'Private reset link' })
    expect(state.queued.map(mail => mail.to)).toEqual([['client@example.com']])
    state.queued = []
    await sendEmail({ to: 'INFO@ANGAVERITAS.COM', subject: 'Update', text: 'Update', copyTeam: true })
    expect(state.queued.map(mail => mail.to)).toEqual([['owner@example.com'], ['info@angaveritas.com']])
  })

  it('includes admins when a team alert is assigned to an analyst and replies to the client', async () => {
    state.users = [
      { id: 'analyst', role: 'analyst', email: 'analyst@example.com', email_updates: true, disabled_at: null },
      { id: 'admin', role: 'admin', email: 'admin@example.com', email_updates: true, disabled_at: null },
    ]
    await notifyTeam({ title: 'Client message', staffIds: ['analyst'], replyTo: 'client@example.com' })
    expect(state.notifications).toEqual(['analyst', 'admin'])
    expect(state.queued[0].to).toEqual(['info@angaveritas.com', 'owner@example.com', 'analyst@example.com', 'admin@example.com'])
    expect(state.queued[0].replyTo).toBe('client@example.com')
  })

  it('copies business updates while respecting email opt-outs', async () => {
    state.users = [{ id: 'client', role: 'client', email: 'client@example.com', email_updates: true, disabled_at: null }]
    await notifyUser('client', { title: 'Report ready' })
    expect(state.queued.map(mail => mail.to)).toContainEqual(['info@angaveritas.com'])
    state.queued = []
    await notifyUser('client', { title: 'In-app only', email: false })
    expect(state.queued).toEqual([])
  })
})
