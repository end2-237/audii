import { useAudii } from '@/state/AudiiProvider'
import { IconFolder, Logo } from './Icons'

export function EmptyLibrary(): React.JSX.Element {
  const { addFolder, scan, t } = useAudii()
  const busy = scan !== null && scan.phase !== 'done' && scan.phase !== 'error'

  return (
    <section className="empty-library">
      <div className="empty-logo">
        <Logo size={64} radius={18} />
      </div>
      <h1>{t('empty.title')}</h1>
      <p>{t('empty.text')}</p>
      <button type="button" className="btn primary" onClick={() => void addFolder()} disabled={busy}>
        <IconFolder size={16} />
        {t(busy ? 'empty.working' : 'empty.cta')}
      </button>
      {busy && scan && (
        <p className="empty-progress">
          {scan.message} {scan.total > 0 && `— ${scan.current}/${scan.total}`}
        </p>
      )}
    </section>
  )
}
