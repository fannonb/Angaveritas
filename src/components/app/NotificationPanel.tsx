'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { markAllReadAction, openNotificationAction } from '@/app/notification-actions'
import type { NotificationRow } from '@/lib/data/misc'
import { notificationDisplayDays, notificationDisplayMs } from '@/lib/notifications'
import { fmtDateTime } from './format'
import { AppIcon } from './icons'

const NotificationContext = createContext({ label: '', id: '', unread: 0, open: () => {} })

export function NotificationProvider({ label, notifications, asOf, timezone, children }: {
  label: string
  notifications: NotificationRow[]
  asOf: number
  timezone: string
  children: ReactNode
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const [now, setNow] = useState(asOf)
  const items = notifications.filter((item) => item.created_at.getTime() + notificationDisplayMs > Math.max(asOf, now))
  const unread = items.filter((item) => !item.read_at).length
  const oldest = items.at(-1)
  const nextExpiry = oldest && oldest.created_at.getTime() + notificationDisplayMs

  useEffect(() => {
    if (nextExpiry === undefined) return
    // A 30-day delay can exceed the browser's maximum timeout.
    const delay = Math.min(86_400_000, Math.max(0, nextExpiry - Date.now()))
    const timer = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [nextExpiry, now])

  const open = useCallback(() => {
    if (!dialog.current || dialog.current.open) return
    setNow(Date.now())
    dialog.current.showModal()
    router.refresh()
  }, [router])

  useEffect(() => {
    // Old notifications URLs land on the home screen and open the drawer.
    const openFromHash = () => {
      if (window.location.hash !== '#notifications') return
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      open()
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [open, pathname])

  return (
    <NotificationContext.Provider value={{ label, id, unread, open }}>
      {children}
      <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className="app-ui notification-panel no-print"
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
        <div className="notification-panel__inner">
          <header className="notification-panel__header">
            <div>
              <h2 id={`${id}-title`} className="app-title">{label}</h2>
              <p className="app-head__intro">Showing the last {notificationDisplayDays} days.</p>
            </div>
            <button type="button" className="icon-btn" autoFocus aria-label={`Close ${label.toLowerCase()}`} onClick={() => dialog.current?.close()}>
              <AppIcon name="close" />
            </button>
          </header>
          {unread > 0 && (
            <div className="notification-panel__toolbar">
              <span className="text-sm text-muted">{unread} unread</span>
              <form action={markAllReadAction}>
                <button className="linkish min-h-11 text-sm" type="submit">Mark all as read</button>
              </form>
            </div>
          )}
          <div className="notification-panel__body">
            {items.length ? (
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.id} className="notification-panel__item" data-unread={!item.read_at}>
                    {item.href ? (
                      <form action={openNotificationAction} onSubmit={() => dialog.current?.close()}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="linkish text-left font-semibold">
                          {!item.read_at && <span className="sr-only">Unread: </span>}{item.title}
                        </button>
                      </form>
                    ) : <p className="font-semibold">{!item.read_at && <span className="sr-only">Unread: </span>}{item.title}</p>}
                    {item.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{item.body}</p>}
                    <time className="mt-1.5 block text-xs text-muted" dateTime={item.created_at.toISOString()}>{fmtDateTime(item.created_at, timezone)}</time>
                  </li>
                ))}
              </ul>
            ) : <p className="empty">No recent {label.toLowerCase()}.</p>}
          </div>
        </div>
      </dialog>
    </NotificationContext.Provider>
  )
}

export function NotificationButton({ variant = 'icon', children }: { variant?: 'icon' | 'sidebar' | 'text'; children?: ReactNode }) {
  const { label, id, unread, open } = useContext(NotificationContext)
  return (
    <button type="button" aria-haspopup="dialog" aria-controls={id} onClick={open}
      className={variant === 'icon' ? 'icon-btn' : variant === 'text' ? 'linkish' : undefined}
      title={variant === 'icon' ? label : undefined}>
      {variant !== 'text' && <AppIcon name="bell" />}
      <span className={variant === 'icon' ? 'sr-only' : undefined}>{children ?? label}</span>
      {variant !== 'text' && unread > 0 && (
        <>
          <span className="sr-only"> ({unread} unread)</span>
          <span aria-hidden="true" className={variant === 'icon' ? 'icon-btn__count' : 'badge'}>{unread > 9 ? '9+' : unread}</span>
        </>
      )}
    </button>
  )
}
