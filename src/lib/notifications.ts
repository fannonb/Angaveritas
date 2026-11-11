export const notificationDisplayDays = 30
export const notificationDisplayMs = notificationDisplayDays * 24 * 60 * 60 * 1000

export function notificationCutoff(now = Date.now()) {
  return new Date(now - notificationDisplayMs)
}
