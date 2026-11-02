import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ sql: undefined as unknown as ReturnType<typeof postgres> }))
vi.mock('@/lib/db', () => ({ get sql() { return state.sql } }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set() {} }), headers: async () => new Headers() }))
import { createClientAccount, createStaffAccount, getUserById, updateProfile, setDisabled, setPassword } from '@/lib/data/users'
import { consumeToken, issueToken, peekToken, resetPasswordWithToken, tokenRecentlyIssued } from '@/lib/auth/tokens'
import { createSession, loginBlocked, recordLogin } from '@/lib/auth/session'

const schema = `av_test_accounts_${Date.now()}`
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const client = (email: string) => createClientAccount({ email, fullName: 'Account Test', phone: '+254700000000', passwordHash: 'original-hash', countryCode: 'KE', regionCode: '30' })

describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')('account concurrency and recovery boundaries', () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Account tests require a local database.')
    const control = postgres(url.toString(), { max: 1 })
    await control.unsafe(`create schema "${schema}"`)
    await control.end()
    state.sql = postgres(url.toString(), { max: 3, connection: { search_path: `${schema},public` }, onnotice() {} })
    for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
      await state.sql.unsafe(fs.readFileSync(path.join('supabase/migrations', file), 'utf8'))
  }, 30000)
  afterAll(async () => {
    if (state.sql) { await state.sql.unsafe(`drop schema if exists "${schema}" cascade`); await state.sql.end() }
  })
  it('handles simultaneous registrations and invitations without duplicate-key exceptions', async () => {
    const clients = await Promise.all([client('Concurrent@Accounts.invalid'), client(' concurrent@accounts.invalid ')])
    expect(clients.filter(Boolean)).toHaveLength(1)
    expect(clients.filter(id => id === null)).toHaveLength(1)
    const staff = await Promise.all([1, 2].map(() => createStaffAccount({ email: 'staff@accounts.invalid', fullName: 'Staff', role: 'analyst' })))
    expect(staff.filter(Boolean)).toHaveLength(1)
    expect(staff.filter(id => id === null)).toHaveLength(1)
  })
  it('saves and updates phone and WhatsApp independently, including clearing optional WhatsApp', async () => {
    const id = (await createClientAccount({ email: 'contacts@accounts.invalid', fullName: 'Contact Test', passwordHash: 'original-hash', phone: '+254712345678', whatsapp: '+447700900123', countryCode: 'KE', regionCode: '30' }))!
    expect(await getUserById(id)).toMatchObject({ phone: '+254712345678', whatsapp: '+447700900123' })
    await updateProfile(id, { fullName: 'Contact Test', phone: '+12015550123', whatsapp: '+254712345678', countryCode: 'KE', regionCode: '30', timezone: 'Africa/Nairobi' })
    expect(await getUserById(id)).toMatchObject({ phone: '+12015550123', whatsapp: '+254712345678' })
    await updateProfile(id, { fullName: 'Contact Test', phone: '+12015550123', whatsapp: null, countryCode: 'KE', regionCode: '30', timezone: 'Africa/Nairobi' })
    expect(await getUserById(id)).toMatchObject({ phone: '+12015550123', whatsapp: null })
  })
  it('keeps one live token when recovery emails are requested concurrently', async () => {
    const id = (await client('token-race@accounts.invalid'))!
    const tokens = await Promise.all([issueToken(id, 'reset_password'), issueToken(id, 'reset_password')])
    expect((await state.sql`select count(*)::int n from user_tokens where user_id=${id} and used_at is null`)[0].n).toBe(1)
    expect((await Promise.all(tokens.map(token => peekToken(token, 'reset_password')))).filter(Boolean)).toHaveLength(1)
  })
  it('revokes recovery links on disable and keeps them invalid after re-enabling', async () => {
    const id = (await client('disabled@accounts.invalid'))!
    const token = await issueToken(id, 'reset_password')
    await setDisabled(id, true)
    expect(await peekToken(token, 'reset_password')).toBeNull()
    expect(await consumeToken(token, 'reset_password')).toBeNull()
    await expect(issueToken(id, 'invite')).rejects.toThrow('unavailable')
    await setDisabled(id, false)
    expect(await resetPasswordWithToken(token, 'reset_password', 'new-hash')).toBeNull()
  })
  it('rolls back token consumption and session revocation when saving credentials fails', async () => {
    const id = (await client('atomic@accounts.invalid'))!
    const token = await issueToken(id, 'reset_password')
    await state.sql`insert into sessions(id,user_id,expires_at) values ('atomic-session',${id},now()+interval '1 day')`
    await state.sql.unsafe("alter table users add constraint account_test_password check (password_hash <> 'reject-for-test')")
    await expect(resetPasswordWithToken(token, 'reset_password', 'reject-for-test')).rejects.toThrow()
    expect(await peekToken(token, 'reset_password')).not.toBeNull()
    expect((await state.sql`select count(*)::int n from sessions where user_id=${id}`)[0].n).toBe(1)
    const recovery = await Promise.all([resetPasswordWithToken(token, 'reset_password', 'new-hash'), resetPasswordWithToken(token, 'reset_password', 'other-hash')])
    expect(recovery.filter(Boolean)).toEqual([id])
    expect((await state.sql`select count(*)::int n from sessions where user_id=${id}`)[0].n).toBe(0)
    expect(await peekToken(token, 'reset_password')).toBeNull()
  })
  it('invalidates old recovery and invitation links after a password change', async () => {
    const id = (await client('password-change@accounts.invalid'))!
    const reset = await issueToken(id, 'reset_password')
    const invite = await issueToken(id, 'invite')
    await setPassword(id, 'changed-hash')
    expect(await peekToken(reset, 'reset_password')).toBeNull()
    expect(await peekToken(invite, 'invite')).toBeNull()
  })
  it('does not consume expired tokens or tokens for another purpose', async () => {
    const id = (await client('expired@accounts.invalid'))!
    const token = await issueToken(id, 'verify_email')
    expect(await consumeToken(token, 'reset_password')).toBeNull()
    expect(await peekToken(token, 'verify_email')).not.toBeNull()
    await state.sql`update user_tokens set expires_at=now()-interval '1 second' where id=${sha(token)}`
    expect(await consumeToken(token, 'verify_email')).toBeNull()
  })
  it('locks out the connection guessing a password, not the account owner elsewhere', async () => {
    const email = 'lockout@accounts.invalid'
    for (let n = 0; n < 8; n++) await recordLogin(email, 'attacker-ip', false)
    expect(await loginBlocked(email, 'attacker-ip')).toBe(true)
    expect(await loginBlocked(email, 'owner-ip')).toBe(false)
  })
  it('limits how often a recovery or verification email can be sent', async () => {
    const id = (await client('flood@accounts.invalid'))!
    expect(await tokenRecentlyIssued(id, 'reset_password')).toBe(false)
    await issueToken(id, 'reset_password')
    expect(await tokenRecentlyIssued(id, 'reset_password')).toBe(true)
    expect(await tokenRecentlyIssued(id, 'verify_email')).toBe(false)
  })
  it('cannot issue a session after credentials change or access is disabled', async () => {
    const id = (await client('session-race@accounts.invalid'))!
    await setPassword(id, 'new-password-hash')
    await expect(createSession({ id, role: 'client' }, 'original-hash')).rejects.toThrow('Credentials changed')
    await setDisabled(id, true)
    await expect(createSession({ id, role: 'client' })).rejects.toThrow('unavailable')
    expect((await state.sql`select count(*)::int n from sessions where user_id=${id}`)[0].n).toBe(0)
  })
  it('requires a country/subdivision for new clients and rejects cross-country region codes', async () => {
    await expect(state.sql`insert into users(email,full_name) values ('missing-location@accounts.invalid','Missing Location')`).rejects.toThrow('Choose your country')
    await expect(state.sql`insert into users(email,full_name,country_code,region_code) values ('invalid-location@accounts.invalid','Invalid Location','KE','CA')`).rejects.toThrow('belonging')
    const id = (await client('location@accounts.invalid'))!
    expect(await getUserById(id)).toMatchObject({ country_code: 'KE', region_code: '30', based_in: 'Nairobi City, Kenya' })
    await state.sql`update users set country_code='US',region_code='CA',based_in='Untrusted browser text' where id=${id}`
    expect(await getUserById(id)).toMatchObject({ country_code: 'US', region_code: 'CA', based_in: 'California, United States' })
    await expect(state.sql`update users set country_code=null,region_code=null where id=${id}`).rejects.toThrow('Choose your country')
  })
})
