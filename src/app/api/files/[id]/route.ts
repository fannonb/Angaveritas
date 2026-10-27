import { logEvent } from '@/lib/activity'
import { getUser } from '@/lib/auth/session'
import { getFile, mayReadFile } from '@/lib/data/files'
import { projectFor } from '@/lib/data/projects'
import { serveObject } from '@/lib/storage'

// Serves a stored file after checking that this user may see it. Clients see
// their own uploads and items released to them; staff see what their project
// access allows. Report downloads are recorded in the audit trail.
export async function GET(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const user = await getUser()
  if (!user) return new Response('Please sign in.', { status: 401 })
  const file = await getFile(params.id)
  if (!file || file.status !== 'ready' || !file.project_id) return new Response('Not found', { status: 404 })
  const access = await projectFor(user, file.project_id)
  if (!access) return new Response('Not found', { status: 404 })
  if (!(await mayReadFile(user, file))) return new Response('Not found', { status: 404 })

  const download = new URL(req.url).searchParams.has('download')
  const inline = !download && (file.mime.startsWith('image/') || file.mime.startsWith('video/') || file.mime === 'application/pdf')
  if (file.category === 'report' || download) {
    await logEvent({ actorId: user.id, projectId: file.project_id, type: 'file.downloaded', summary: `${user.full_name} opened ${file.filename}` })
  }
  return serveObject(file.storage_key, { filename: file.filename, mime: file.mime, inline })
}
