import type { FileRow } from '@/lib/data/files'
import { deleteFileAction, fileMetaAction } from './actions'

/** Caption and delete controls for one evidence item. */
export default function FileControls({ f, canManage }: { f: FileRow; canManage: boolean }) {
  return (
    <div className="mt-2 space-y-1.5 border-0 border-t border-solid border-line pt-2">
      <form action={fileMetaAction} className="space-y-1.5">
        <input type="hidden" name="fileId" value={f.id} />
        <div className="flex items-center gap-1.5">
          <input
            className="input mt-0 min-h-0 flex-1 py-1 text-xs"
            name="caption"
            defaultValue={f.caption ?? ''}
            placeholder="Add note / caption"
            maxLength={500}
            aria-label="Caption"
          />
          <button className="btn btn-secondary btn-xs px-2 py-1" type="submit" title="Save caption">
            Save
          </button>
        </div>

        {canManage && f.integrity_flag && (
          <details className="mt-1 text-xs text-muted">
            <summary className="cursor-pointer hover:underline text-warn">QA Review</summary>
            <div className="mt-1 space-y-1.5 rounded border border-line bg-slate-50 p-2">
              <label className="check text-xs">
                <input type="checkbox" name="visible" defaultChecked={f.visible_to_client} />
                Visible to client
              </label>
              <textarea
                className="input text-xs"
                name="qaNote"
                defaultValue={f.qa_note ?? ''}
                maxLength={2000}
                placeholder="QA review note"
              />
              <button className="btn btn-secondary btn-xs" type="submit">Update review</button>
            </div>
          </details>
        )}

        {canManage && f.category === 'client_document' && (
          <label className="check text-xs">
            <input type="checkbox" name="fieldAccess" defaultChecked={f.field_access} /> Approved for field agents
          </label>
        )}
      </form>

      {canManage && (
        <form action={deleteFileAction} className="pt-0.5">
          <input type="hidden" name="fileId" value={f.id} />
          <button className="linkish text-xs text-bad hover:underline" type="submit">
            Delete file
          </button>
        </form>
      )}
    </div>
  )
}
