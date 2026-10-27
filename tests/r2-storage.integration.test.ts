import crypto from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { deleteObject, inspectObject, makeStorageKey, scanObject, serveObject, uploadTarget } from '@/lib/storage'

// Runs against the real R2 bucket. Enable with R2_TEST=1 and the R2_* variables; skipped otherwise.
const enabled = process.env.R2_TEST === '1'
const text = 'hello from the angaveritas r2 test\n'

describe.skipIf(!enabled)('Cloudflare R2 storage driver (live bucket)', () => {
  beforeAll(() => {
    process.env.STORAGE_DRIVER = 'r2'
  })

  it('uploads, inspects, serves and deletes a private object', async () => {
    const body = Buffer.from(text)
    const key = makeStorageKey('r2-test', 'hello.txt')
    try {
      // Browser upload: a short-lived signed PUT straight to the bucket.
      const target = await uploadTarget('r2-test-file', key)
      expect(target.url).toContain('.r2.cloudflarestorage.com')
      const put = await fetch(target.url, { method: 'PUT', body, headers: { 'Content-Type': 'text/plain' } })
      expect(put.status).toBe(200)

      const info = await inspectObject(key)
      expect(info.size).toBe(body.length)
      expect(info.sha256).toBe(crypto.createHash('sha256').update(body).digest('hex'))

      // Download: the app hands out a signed link that expires in a minute.
      const served = await serveObject(key, { filename: 'hello.txt', mime: 'text/plain', inline: false })
      expect(served.status).toBe(302)
      const location = served.headers.get('location')!
      const download = await fetch(location)
      expect(download.status).toBe(200)
      expect(await download.text()).toBe(text)
      expect(download.headers.get('content-disposition')).toContain('attachment')

      // The object is private: an unsigned request does not return its contents.
      const bucket = process.env.R2_BUCKET ?? 'angaveritas'
      const raw = await fetch(`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key}`)
      expect(raw.ok).toBe(false)
      expect(await raw.text()).not.toContain('hello from the angaveritas r2 test')

      await scanObject(key)
    } finally {
      // Always remove the test object, even when an assertion fails.
      await deleteObject(key)
    }
  }, 60000)
})
