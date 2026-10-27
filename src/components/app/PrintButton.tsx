'use client'

export default function PrintButton({ label = 'Print / save as PDF' }: { label?: string }) {
  return (
    <button type="button" className="btn btn-secondary btn-small no-print" onClick={() => window.print()}>
      {label}
    </button>
  )
}
