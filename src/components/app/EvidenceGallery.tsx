import type { FileRow } from '@/lib/data/files'
import { fileSize, fmtDateTime } from './format'

// Photo/video archive. Every item shows its evidence ID, capture time and GPS,
// so a client can trace each finding back to what was seen on site.
export default function EvidenceGallery({ files, tz, staffControls }: { files: FileRow[]; tz?: string; staffControls?: (f: FileRow) => React.ReactNode }) {
  if (!files.length) return <p className="empty">No evidence yet.</p>
  return (
    <div className="evidence-grid">
      {files.map((f) => (
        <figure key={f.id} className="evidence-item m-0">
          <a className="thumb" href={`/api/files/${f.id}`} target="_blank" rel="noopener">
            {f.media_type === 'photo' || f.media_type === 'drone' ? (
              <img src={`/api/files/${f.id}`} alt={f.caption ?? f.filename} loading="lazy" />
            ) : f.media_type === 'video' ? (
              <video src={`/api/files/${f.id}`} preload="metadata" muted />
            ) : (
              <span className="grid h-full place-items-center text-sm text-muted">{f.filename}</span>
            )}
          </a>
          <figcaption className="meta space-y-0.5">
            <div className="flex justify-between gap-2">
              <b>{f.evidence_code ?? f.media_type}</b>
              {f.media_type === 'drone' && <span>Drone</span>}
            </div>
            {f.caption && <p className="text-ink">{f.caption}</p>}
            <p>{f.taken_at ? `Taken ${fmtDateTime(f.taken_at, tz)}` : `Uploaded ${fmtDateTime(f.created_at, tz)}`}</p>
            {f.gps_lat != null && f.gps_lng != null ? (
              <p>
                <a href={`https://www.openstreetmap.org/?mlat=${f.gps_lat}&mlon=${f.gps_lng}#map=16/${f.gps_lat}/${f.gps_lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-1">
                  <span>📍</span> {f.gps_lat.toFixed(5)}, {f.gps_lng.toFixed(5)}
                </a>
              </p>
            ) : (
              <p className="text-xs text-muted">No GPS coordinates</p>
            )}
            {f.inspection_code && <p>{f.inspection_code}</p>}
            {staffControls && (
              <>
                {f.integrity_flag && <p className="text-warn">⚠ {f.integrity_flag}</p>}
                <p className="text-muted">{fileSize(f.size_bytes)} · {f.uploader_name}</p>
                {staffControls(f)}
              </>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

export function DocumentList({ files, tz, controls, clientView }: { files: FileRow[]; tz?: string; controls?: (f: FileRow) => React.ReactNode; clientView?: boolean }) {
  if (!files.length) return <p className="empty">No documents yet.</p>
  return (
    <ul className="divide-y divide-line">
      {files.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="min-w-0">
            <a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="font-semibold">{f.filename}</a>
            {f.caption && <span className="block text-sm text-ink-2">{f.caption}</span>}
            <span className="block text-xs text-muted">
              {fileSize(f.size_bytes)} · {f.uploader_role === 'client' ? (clientView ? 'Added by you' : `Added by client (${f.uploader_name})`) : `Added by ${f.uploader_name}`} · {fmtDateTime(f.created_at, tz)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <a className="btn btn-secondary btn-xs" href={`/api/files/${f.id}?download`}>Download</a>
            {controls?.(f)}
          </span>
        </li>
      ))}
    </ul>
  )
}
