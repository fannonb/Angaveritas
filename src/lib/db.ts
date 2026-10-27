import 'server-only'
import postgres from 'postgres'
import { calendarDateType } from './database-types'

// One small pool per server instance. `prepare: false` is required for
// Supabase's transaction pooler (port 6543) and harmless elsewhere.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> }

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL ?? '', {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 3),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    types: { calendarDate: calendarDateType },
  })

if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql

/** Attribute database-triggered audit entries in the same transaction as the change. */
export async function withActor<T>(actorId: string, work: (tx: postgres.TransactionSql) => Promise<T>, ipHash?: string) {
  return sql.begin(async tx => {
    await tx`select set_config('app.actor_id', ${actorId}, true), set_config('app.ip_hash', ${ipHash ?? ''}, true)`
    return work(tx)
  }) as Promise<T>
}
