import { redirect } from 'next/navigation'

// Requests and projects share one list on the Projects page; this keeps old links and bookmarks working.
export default function RequestsPage() {
  redirect('/portal/projects')
}
