import { getUser } from '@/lib/auth/session'
import { projectFor } from '@/lib/data/projects'
import { getReport } from '@/lib/data/reports'
import { reportLock } from '@/lib/data/operations'
import { reportPdf } from '@/lib/report-pdf'

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await getUser()
  if(!user)return new Response('Please sign in.',{status:401})
  const r=await getReport((await params).id)
  if(!r||r.status!=='published'||!r.snapshot)return new Response('Not found',{status:404})
  const access=await projectFor(user,r.project_id)
  if(!access||(!access.isClient&&!access.canManage))return new Response('Not found',{status:404})
  if(access.isClient&&await reportLock(r.project_id,r.id))return new Response('Settle this engagement balance to open the report.',{status:403})
  return new Response(Buffer.from(await reportPdf(r.snapshot)),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="AngaVeritas-${access.project.code}-${r.id.slice(0,8)}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}
