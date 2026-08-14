import { useAudii } from '@/state/AudiiProvider'

/** Bandeau discret pendant le (re)scan de la bibliothèque. */
export function ScanToast(): React.JSX.Element | null {
  const { scan, library, t } = useAudii()
  if (!scan || library.tracks.length === 0) return null
  if (scan.phase === 'idle') return null

  const ratio = scan.total > 0 ? scan.current / scan.total : 0
  const done = scan.phase === 'done'

  return (
    <div className={`scan-toast${done ? ' is-done' : ''}${scan.phase === 'error' ? ' is-error' : ''}`}>
      <div className="scan-toast-text">
        <strong>{t(done ? 'scan.done' : 'scan.title')}</strong>
        <span>
          {scan.message}
          {scan.file && !done ? ` · ${scan.file}` : ''}
        </span>
      </div>
      {!done && (
        <div className="scan-toast-bar">
          <div style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
