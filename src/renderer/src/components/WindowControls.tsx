import { useEffect, useState } from 'react'
import { useAudii } from '@/state/AudiiProvider'
import { IconClose, IconMaximize, IconMinimize, IconRestore } from './Icons'

/**
 * Boutons de fenêtre.
 *
 * Windows et Linux : à droite, icônes réduire / agrandir / fermer, avec le
 * survol rouge attendu sur la fermeture. macOS : pastilles à gauche, comme le
 * système. La fenêtre étant sans cadre, ces boutons sont les seuls contrôles.
 */
export function WindowControls(): React.JSX.Element {
  const { platform, t } = useAudii()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.audii.window.isMaximized().then(setMaximized)
    return window.audii.window.onStateChange(setMaximized)
  }, [])

  if (platform === 'darwin') {
    return (
      <div className="traffic">
        <button
          type="button"
          className="traffic-dot close"
          title={t('window.close')}
          onClick={() => window.audii.window.close()}
        />
        <button
          type="button"
          className="traffic-dot minimize"
          title={t('window.minimize')}
          onClick={() => window.audii.window.minimize()}
        />
        <button
          type="button"
          className="traffic-dot zoom"
          title={t(maximized ? 'window.restore' : 'window.maximize')}
          onClick={() => window.audii.window.maximize()}
        />
      </div>
    )
  }

  return (
    <div className="win-controls">
      <button
        type="button"
        className="win-button"
        title={t('window.minimize')}
        onClick={() => window.audii.window.minimize()}
      >
        <IconMinimize size={14} />
      </button>
      <button
        type="button"
        className="win-button"
        title={t(maximized ? 'window.restore' : 'window.maximize')}
        onClick={() => window.audii.window.maximize()}
      >
        {maximized ? <IconRestore size={14} /> : <IconMaximize size={14} />}
      </button>
      <button
        type="button"
        className="win-button is-close"
        title={t('window.close')}
        onClick={() => window.audii.window.close()}
      >
        <IconClose size={14} />
      </button>
    </div>
  )
}
