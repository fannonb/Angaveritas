import 'server-only'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Private file storage for evidence, client documents and report PDFs.
// Nothing here is ever public: every download goes through /api/files/[id],
// which checks who is asking.
//
//   STORAGE_DRIVER=local     files under STORAGE_DIR (default ./storage). Development, or a server with a disk.
//   STORAGE_DRIVER=supabase  a private Supabase Storage bucket. Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET.
//   STORAGE_DRIVER=r2        a private Cloudflare R2 bucket over its S3 API. Use this on Vercel (no persistent disk).
//                            Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (default angaveritas).

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

const driver = () => (process.env.STORAGE_DRIVER === 'supabase' ? 'supabase' : process.env.STORAGE_DRIVER === 'r2' ? 'r2' : 'local')
const localRoot = () => path.resolve(process.env.STORAGE_DIR ?? './storage')

function localPath(key: string) {
  const p = path.resolve(localRoot(), key)
  if (!p.startsWith(localRoot() + path.sep)) throw new Error('Invalid storage key')
  return p
}

function supa() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.SUPABASE_BUCKET ?? 'angaveritas-private'
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_DRIVER=supabase')
  return { url, key, bucket, auth: { Authorization: `Bearer ${key}`, apikey: key } }
}

let r2Client: S3Client | undefined

function r2() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET ?? 'angaveritas'
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required for STORAGE_DRIVER=r2')
  r2Client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  return { client: r2Client, bucket }
}

const encKey = (key: string) => key.split('/').map(encodeURIComponent).join('/')

export function makeStorageKey(scope: string, filename: string) {
  const safe = filename
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80)
  return `${scope}/${crypto.randomUUID()}-${safe || 'file'}`
}

/** Where the browser should PUT the file bytes. */
export async function uploadTarget(fileId: string, key: string): Promise<{ url: string; headers: Record<string, string> }> {
  if (driver() === 'local') return { url: `/api/files/${fileId}/upload`, headers: {} }
  if (driver() === 'r2') {
    const { client, bucket } = r2()
    // A short-lived signed PUT: the browser sends the bytes straight to R2.
    const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 })
    return { url, headers: {} }
  }
  const s = supa()
  const res = await fetch(`${s.url}/storage/v1/object/upload/sign/${s.bucket}/${encKey(key)}`, {
    method: 'POST',
    headers: { ...s.auth, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(`Could not prepare upload (${res.status})`)
  const data = (await res.json()) as { url: string }
  return { url: `${s.url}/storage/v1${data.url}`, headers: {} }
}

/** Local driver only: stream a request body to disk, refusing anything over the limit. */
export async function writeLocal(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
  const target = localPath(key)
  await fsp.mkdir(path.dirname(target), { recursive: true })
  let seen = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length
      if (seen > maxBytes) cb(new Error('File is larger than expected'))
      else cb(null, chunk)
    },
  })
  const handle = await fsp.open(target, 'wx')
  try {
    await pipeline(Readable.fromWeb(body as never), limiter, handle.createWriteStream())
  } catch (err) {
    await fsp.rm(target, { force: true })
    throw err
  }
  return seen
}

/** Size, SHA-256 and the first bytes (for EXIF) of a stored object. */
export async function inspectObject(key: string): Promise<{ size: number; sha256: string; head: Buffer }> {
  const hash = crypto.createHash('sha256')
  const headChunks: Buffer[] = []
  let headLen = 0
  let size = 0
  const take = (chunk: Buffer) => {
    hash.update(chunk)
    size += chunk.length
    if (size > MAX_UPLOAD_BYTES) throw new Error('Stored file exceeds the upload limit')
    if (headLen < 512 * 1024) {
      const part = chunk.subarray(0, 512 * 1024 - headLen)
      headChunks.push(part)
      headLen += part.length
    }
  }
  if (driver() === 'local') {
    for await (const chunk of fs.createReadStream(localPath(key))) take(chunk as Buffer)
  } else if (driver() === 'r2') {
    const { client, bucket } = r2()
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })).catch(() => null)
    if (!res?.Body) throw new Error('Uploaded file not found (404)')
    for await (const chunk of res.Body as Readable) take(chunk as Buffer)
  } else {
    const s = supa()
    const res = await fetch(`${s.url}/storage/v1/object/authenticated/${s.bucket}/${encKey(key)}`, { headers: s.auth })
    if (!res.ok || !res.body) throw new Error(`Uploaded file not found (${res.status})`)
    for await (const chunk of Readable.fromWeb(res.body as never)) take(chunk as Buffer)
  }
  return { size, sha256: hash.digest('hex'), head: Buffer.concat(headChunks) }
}

/** A Response that serves the file to an already-authorised user. */
export async function serveObject(key: string, opts: { filename: string; mime: string; inline: boolean }): Promise<Response> {
  const disposition = `${opts.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`
  if (driver() === 'local') {
    const p = localPath(key)
    const stat = await fsp.stat(p).catch(() => null)
    if (!stat) return new Response('Not found', { status: 404 })
    return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, {
      headers: {
        'Content-Type': opts.mime,
        'Content-Length': String(stat.size),
        'Content-Disposition': disposition,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
  if (driver() === 'r2') {
    const { client, bucket } = r2()
    const signed = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: opts.mime, ResponseContentDisposition: disposition }),
      { expiresIn: 60 },
    )
    return Response.redirect(signed, 302)
  }
  const s = supa()
  const res = await fetch(`${s.url}/storage/v1/object/sign/${s.bucket}/${encKey(key)}`, {
    method: 'POST',
    headers: { ...s.auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  if (!res.ok) return new Response('Not found', { status: 404 })
  const data = (await res.json()) as { signedURL: string }
  const signed = new URL(`${s.url}/storage/v1${data.signedURL}`)
  if (!opts.inline) signed.searchParams.set('download', opts.filename)
  return Response.redirect(signed.toString(), 302)
}

export async function deleteObject(key: string) {
  if (driver() === 'local') {
    await fsp.rm(localPath(key), { force: true })
    return
  }
  if (driver() === 'r2') {
    const { client, bucket } = r2()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    return
  }
  const s = supa()
  await fetch(`${s.url}/storage/v1/object/${s.bucket}`, {
    method: 'DELETE',
    headers: { ...s.auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [key] }),
  })
}

/** Optional antivirus service: POST raw bytes, require an explicit clean result. */
export async function scanObject(key: string) {
  const endpoint = process.env.FILE_SCAN_URL
  if (!endpoint) return
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('The file scanning endpoint must use HTTPS.')
  let body: ReadableStream<Uint8Array>
  if (driver() === 'local') body = Readable.toWeb(fs.createReadStream(localPath(key))) as ReadableStream<Uint8Array>
  else if (driver() === 'r2') {
    const { client, bucket } = r2()
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })).catch(() => null)
    if (!res?.Body) throw new Error('Unable to read the upload for scanning.')
    body = Readable.toWeb(res.Body as Readable) as ReadableStream<Uint8Array>
  }
  else {
    const s = supa()
    const response = await fetch(`${s.url}/storage/v1/object/authenticated/${s.bucket}/${encKey(key)}`,{headers:s.auth})
    if(!response.ok || !response.body) throw new Error('Unable to read the upload for scanning.')
    body = response.body
  }
  const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/octet-stream',...(process.env.FILE_SCAN_KEY ? {Authorization:`Bearer ${process.env.FILE_SCAN_KEY}`} : {})},body,duplex:'half',signal:AbortSignal.timeout(30000)} as RequestInit & {duplex:string})
  if(!response.ok || (await response.json()).clean !== true) throw new Error('The file was not cleared by the scanning service. Contact the team.')
}
