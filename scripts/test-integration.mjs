import { spawnSync } from 'node:child_process'
try { process.loadEnvFile('.env.local') } catch {}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Tests create and remove an isolated av_test schema; existing application data is untouched.')
const result = spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/integrity.integration.test.ts','tests/workflow-security.integration.test.ts'],{ stdio:'inherit',env:{...process.env,RUN_DATABASE_TESTS:'1'} })
process.exitCode = result.status ?? 1
