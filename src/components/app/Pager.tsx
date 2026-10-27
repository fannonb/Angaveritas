import Link from 'next/link'

// Newer and Older links for a list that is ordered newest first. Renders nothing when everything fits on one page.
export default function Pager({ page, pages, hrefFor, label = 'Pages' }: { page: number; pages: number; hrefFor: (page: number) => string; label?: string }) {
  if (pages <= 1) return null
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 text-sm">
      {page > 1 ? <Link className="btn btn-secondary btn-small" href={hrefFor(page - 1)}>Newer</Link> : <span aria-hidden="true" />}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages ? <Link className="btn btn-secondary btn-small" href={hrefFor(page + 1)}>Older</Link> : <span aria-hidden="true" />}
    </nav>
  )
}
