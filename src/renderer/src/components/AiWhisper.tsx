import { useEffect, useState } from 'react'
import { useAudii } from '@/state/AudiiProvider'
import { IconClose, IconSparkle } from './Icons'

/**
 * Le mot d'Audii : une phrase écrite pour le morceau qui ouvre une playlist.
 *
 * Le composant ne décide de rien — la règle d'apparition (début de playlist,
 * une fois par demi-heure au plus) vit dans `AudiiProvider`. Ici on affiche,
 * on anime, et on laisse fermer.
 */
export function AiWhisper(): React.JSX.Element | null {
  const { whisper, t } = useAudii()
  const [hidden, setHidden] = useState(false)

  // Une nouvelle phrase annule la fermeture de la précédente.
  useEffect(() => setHidden(false), [whisper])

  if (!whisper || hidden) return null

  return (
    <aside className="whisper" role="status">
      <span className="whisper-icon" aria-hidden="true">
        <IconSparkle size={15} />
      </span>
      <div className="whisper-body">
        <span className="whisper-kicker">{t('whisper.kicker')}</span>
        <p className="whisper-text">{whisper}</p>
      </div>
      <button type="button" className="whisper-close" title={t('whisper.dismiss')} onClick={() => setHidden(true)}>
        <IconClose size={12} />
      </button>
    </aside>
  )
}
