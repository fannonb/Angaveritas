'use server'
import { requireStaff } from '@/lib/auth/session'
import { withActor } from '@/lib/db'
import { formText } from '@/lib/validation'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
export async function manageEnquiryAction(form: FormData) {
  const user = await requireStaff(['analyst','admin'])
  const id=String(form.get('id') ?? '')
  try {
    await withActor(user.id,async tx => {
      const [e]=await tx`select * from enquiries where id=${id} for update`
      if (!e) throw new Error('Enquiry not found.')
      const owner=String(form.get('ownerId') ?? '') || null
      if (owner && !(await tx`select id from users where id=${owner} and role in ('analyst','admin') and disabled_at is null`).length) throw new Error('Choose an active analyst or admin.')
      await tx`update enquiries set owner_id=${owner},next_follow_up=${String(form.get('followUp') ?? '') || null},internal_notes=${formText(form,'notes',4000)} where id=${id}`
      if (form.get('intent') === 'convert' && !e.request_id) {
        const [client]=await tx`select id from users where email=${e.email.toLowerCase()} and role='client' and disabled_at is null`
        if (!client) throw new Error('The client needs to register with this email first. Then convert this enquiry without duplicating their account.')
        const [r]=await tx`insert into requests(client_id,kind,title,description,location_label,owner_id) values (${client.id},'custom',${`${e.service ?? 'Enquiry'}: ${e.name}`.slice(0,140)},${e.message},${e.project_location},${owner ?? user.id}) returning id`
        await tx`update enquiries set status='converted',user_id=${client.id},request_id=${r.id} where id=${id}`
      }
    })
  } catch(e) { redirect(`/staff/enquiries?error=${encodeURIComponent(e instanceof Error ? e.message : 'Could not save.')}`) }
  revalidatePath('/staff/enquiries');revalidatePath('/staff/requests')
}
