import { getUser } from '@/lib/auth/session'
import { getFile, uploadWriteProblem } from '@/lib/data/files'
import { inspectObject, uploadTarget } from '@/lib/storage'
import { json, sameOrigin } from '@/lib/request'

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
  if(!sameOrigin(req))return json({error:'Invalid request.'},403)
  const user=await getUser(),file=await getFile((await params).id)
  if(!user||!file||file.uploaded_by!==user.id)return json({error:'Upload not found.'},404)
  const problem=await uploadWriteProblem(user,file)
  if(problem)return json({error:problem},409)
  if(file.status==='ready')return json({ready:true,file})
  if(file.status!=='pending')return json({error:'This upload expired. Remove it from the queue and select the file again.'},409)
  const stored=await inspectObject(file.storage_key).catch(()=>null)
  return json({fileId:file.id,bytesSent:stored?.size===Number(file.size_bytes),upload:await uploadTarget(file.id,file.storage_key,Number(file.size_bytes))})
}
