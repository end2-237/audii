import { useAudii } from '@/state/AudiiProvider'
import { IconFolder, Logo } from './Icons'

export function EmptyLibrary(): React.JSX.Element {
  const { addFolder, scan } = useAudii()
  const busy = scan !== null && scan.phase !== 'done' && scan.phase !== 'error'

  return (
    <section className="empty-library">
      <div className="empty-logo">
        <Logo size={64} radius={18} />
      </div>
      <h1>Votre musique, ici</h1>
      <p>
        Audii lit directement les fichiers audio de votre PC — MP3, FLAC, M4A, WAV, OGG, Opus…
        <br />
        Ajoutez un dossier pour construire votre bibliothèque&nbsp;: rien ne quitte votre machine.
      </p>
      <button type="button" className="btn primary" onClick={() => void addFolder()} disabled={busy}>
        <IconFolder size={16} />
        {busy ? 'Analyse en cours…' : 'Choisir un dossier'}
      </button>
      {busy && scan && (
        <p className="empty-progress">
          {scan.message} {scan.total > 0 && `— ${scan.current}/${scan.total}`}
        </p>
      )}
    </section>
  )
}
