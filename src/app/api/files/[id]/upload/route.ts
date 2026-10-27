import { getUser } from '@/lib/auth/session'
import { getFile, uploadWriteProblem } from '@/lib/data/files'
import { json, sameOrigin } from '@/lib/request'
import { writeLocal } from '@/lib/storage'

// Step 2 (local storage driver only): receives the file bytes.
// With the Supabase driver the browser uploads straight to the signed URL.
export async function PUT(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  if (!sameOrigin(req)) return json({ error: 'Invalid request.' }, 403)
  if (process.env.STORAGE_DRIVER === 'supabase' || process.env.STORAGE_DRIVER === 'r2') return json({ error: 'Not available.' }, 404)
  const user = await getUser()
  if (!user) return json({ error: 'Please sign in again.' }, 401)
  const file = await getFile(params.id)
  if (!file || file.uploaded_by !== user.id || file.status !== 'pending') return json({ error: 'Upload not found.' }, 404)
  const problem = await uploadWriteProblem(user, file)
  if (problem) return json({ error: problem }, 409)
  if (!req.body) return json({ error: 'No file received.' }, 400)
  try {
    await writeLocal(file.storage_key, req.body, Number(file.size_bytes))
  } catch {
    return json({ error: 'The upload failed. Please try again.' }, 400)
  }
  return json({ ok: true })
}
