// Date and number formatting for the app. Dates show in the viewer's time
// zone when known (clients abroad), otherwise East Africa Time.

const TZ = 'Africa/Nairobi'

export function fmtDate(d: Date | string | null | undefined, tz = TZ) {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T12:00:00+03:00` : d) : d
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: typeof d === 'string' && d.length === 10 ? TZ : tz }).format(date)
}

export function fmtDateTime(d: Date | string | null | undefined, tz = TZ) {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }).format(date)
}

export function daysUntil(d: string | null) {
  if (!d) return null
  const target = new Date(`${d}T00:00:00+03:00`).getTime()
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: TZ }) + 'T00:00:00+03:00').getTime()
  return Math.round((target - today) / 86400_000)
}

export function relativeDays(d: string | null) {
  const n = daysUntil(d)
  if (n === null) return ''
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

export const kes = (n: number | string | null | undefined) => (n == null ? '—' : `KES ${Math.round(Number(n)).toLocaleString('en-US')}`)

export function fileSize(bytes: number | string) {
  const b = Number(bytes)
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
