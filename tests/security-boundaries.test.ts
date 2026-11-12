import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { safeNext } from '@/lib/auth/session'
import { matchingTotpStep } from '@/lib/auth/mfa'
import { legacyR2Upload, makeStorageKey, scanObject, uploadTarget } from '@/lib/storage'
import { requestIp, sameOrigin } from '@/lib/request'

afterEach(() => vi.unstubAllEnvs())

describe('security boundaries', () => {
  it('rejects external and control-character post-login destinations', () => {
    for (const destination of ['//external.invalid', '/\t/external.invalid', '/\\external.invalid', '/one/..//external.invalid']) {
      expect(safeNext(destination, '/portal')).toBe('/portal')
    }
    expect(safeNext('/portal/projects?tab=site#map', '/portal')).toBe('/portal/projects?tab=site#map')
  })

  it('signs a create-only condition and refuses to renew a legacy R2 ticket', async () => {
    vi.stubEnv('STORAGE_DRIVER', 'r2')
    vi.stubEnv('R2_ACCOUNT_ID', 'fake-account')
    vi.stubEnv('R2_ACCESS_KEY_ID', 'fake-key')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'fake-secret')
    vi.stubEnv('R2_BUCKET', 'fake-bucket')
    const key = makeStorageKey('fixture', 'test.pdf')
    const target = await uploadTarget('file', key, 1_024)
    expect(legacyR2Upload(key)).toBe(false)
    expect(new URL(target.url).searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(['content-length', 'host', 'if-none-match'])
    expect(target.headers).toEqual({ 'If-None-Match': '*' })
    await expect(uploadTarget('file', 'fixture/old.pdf', 1_024)).rejects.toThrow('expired')
  })

  it('fails closed when scanning is required and the scanner is absent', async () => {
    vi.stubEnv('FILE_SCAN_URL', '')
    await expect(scanObject('fixture.pdf', true)).rejects.toThrow('unavailable')
  })

  it('matches the RFC 6238 SHA-1 test vector and rejects a used time step', () => {
    const secret = Buffer.from('12345678901234567890')
    expect(matchingTotpStep(secret, '287082', -1, 59_000)).toBe(1)
    expect(matchingTotpStep(secret, '287082', 1, 59_000)).toBeNull()
  })

  it('ignores client-supplied forwarding headers without a configured ingress', () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('TRUST_PROXY_HEADERS', '')
    const req = new Request('https://app.invalid/api/requests', { method: 'POST', headers: {
      origin: 'https://external.invalid', 'x-forwarded-host': 'external.invalid', 'x-forwarded-for': '192.0.2.1',
    } })
    expect(sameOrigin(req)).toBe(false)
    expect(requestIp(req.headers)).toBe('unknown')
  })
})
