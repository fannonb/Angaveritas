// Audit scenario 10: closing and reopening the browser keeps queued evidence and its save state.
// Runs the real device queue module in Chromium with a persistent profile, closed and relaunched between steps.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { chromium, type BrowserContext } from 'playwright'
import { afterAll, describe, expect, it } from 'vitest'

const origin = 'https://field.angaveritas.test'
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'av-upload-queue-'))
const moduleSource = ts.transpileModule(fs.readFileSync('src/lib/device-upload-queue.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText

async function open(): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true }) // installed Chrome, as in the workflow test
  // IndexedDB needs a real origin; serve a blank page and the queue module from a test host.
  await context.route(`${origin}/**`, (route) => route.request().url().endsWith('/queue.js')
    ? route.fulfill({ contentType: 'text/javascript', body: moduleSource })
    : route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>queue</title>' }))
  return context
}
async function run<T>(context: BrowserContext, script: string): Promise<T> {
  const page = context.pages()[0] ?? await context.newPage()
  await page.goto(`${origin}/visit`)
  return page.evaluate(`(async () => { const q = await import('${origin}/queue.js'); ${script} })()`) as Promise<T>
}

describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')('device upload queue', () => {
  afterAll(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })) // Chrome may still hold files briefly on Windows

  it('keeps queued photos and their save state across a browser restart', async () => {
    let context = await open()
    await run(context, `
      const photo = new Blob([new Uint8Array(2048).fill(7)], { type: 'image/jpeg' })
      await q.saveUploadQueue('inspection-AVI-1', [
        { name: 'gate.jpg', status: 'waiting', caption: 'Main gate', file: photo },
        { name: 'yard.jpg', status: 'failed', error: 'Connection lost', file: photo },
      ])`)
    await context.close()

    context = await open()
    const restored = await run<{ name: string; status: string; caption?: string; error?: string; size: number; type: string }[]>(context, `
      const items = await q.readUploadQueue('inspection-AVI-1')
      return items.map(i => ({ name: i.name, status: i.status, caption: i.caption, error: i.error, size: i.file.size, type: i.file.type }))`)
    expect(restored).toEqual([
      { name: 'gate.jpg', status: 'waiting', caption: 'Main gate', error: undefined, size: 2048, type: 'image/jpeg' },
      { name: 'yard.jpg', status: 'failed', caption: undefined, error: 'Connection lost', size: 2048, type: 'image/jpeg' },
    ])

    // Once everything is saved the queue is cleared, and stays cleared after another restart.
    await run(context, `await q.saveUploadQueue('inspection-AVI-1', null)`)
    await context.close()
    context = await open()
    expect(await run(context, `return await q.readUploadQueue('inspection-AVI-1')`)).toBeNull()
    await context.close()
  }, 60000)
})
