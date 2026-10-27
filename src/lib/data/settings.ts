import 'server-only'
import { sql } from '@/lib/db'

// Website settings staff control from the app. Missing rows fall back to these defaults.
const defaults = { showPublicPrices: false }
export type SiteSettings = typeof defaults

/** Never throws: public pages render with the defaults if the database is unavailable. */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const rows = await sql<{ key: string; value: unknown }[]>`select key, value from site_settings`
    const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return { showPublicPrices: typeof saved.showPublicPrices === 'boolean' ? saved.showPublicPrices : defaults.showPublicPrices }
  } catch {
    return defaults
  }
}

export async function setSiteSetting<K extends keyof SiteSettings>(key: K, value: SiteSettings[K], actorId: string) {
  await sql`
    insert into site_settings (key, value, updated_by) values (${key}, ${sql.json(value)}, ${actorId})
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`
}
