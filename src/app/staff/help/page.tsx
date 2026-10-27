import { requireStaff } from '@/lib/auth/session'
import { site, telHref } from '@/lib/site'

export const metadata = { title:'Field help' }
export default async function HelpPage() {
  await requireStaff()
  return <div className="max-w-2xl space-y-5"><h1 className="app-title">Help with your visit</h1><section className="panel panel-pad space-y-3"><h2 className="text-lg">At the site</h2><ol className="space-y-3"><li>1. Open your assigned visit and check directions, contacts and access restrictions.</li><li>2. Start the visit when you arrive. Add photos with camera location switched on.</li><li>3. Record every required check. Explain anything you cannot verify or that needs another visit.</li><li>4. Save findings and notes. Wait for every upload to finish before sending for review.</li></ol><p className="hint">Notes can be kept on this device during a connection loss. Photo uploads and other changes need a connection; keep your original files until they show as saved.</p></section><section className="panel panel-pad space-y-3"><h2 className="text-lg">Contact your coordinator</h2><p>If access is refused or you cannot continue safely, stop and contact the coordinator. Explain the limitation in the visit.</p><a href={`mailto:${site.email}`}>{site.email}</a>{site.phone && <p><a href={telHref(site.phone)}>Call the coordinator</a></p>}</section></div>
}
