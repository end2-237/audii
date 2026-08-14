import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/mini.css'
import type { PlayerSnapshot } from '@shared/types'
import { Cover } from './components/Cover'
import { IconChevronDown, IconExpand, IconNext, IconPause, IconPlay, IconPrev, Logo } from './components/Icons'
import { formatTime } from './lib/format'

/**
 * Mini-lecteur flottant, affiché quand la fenêtre principale est réduite.
 * Il ne détient pas le son : il reçoit l'état par IPC et renvoie les
 * commandes à la fenêtre principale.
 */
function Mini(): React.JSX.Element {
  const [state, setState] = useState<PlayerSnapshot | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => window.audii.mini.onState(setState), [])

  useEffect(() => {
    document.documentElement.dataset.theme = state?.theme ?? 'dark'
  }, [state?.theme])

  const progress = state && state.duration > 0 ? (state.position / state.duration) * 100 : 0

  const collapse = (next: boolean): void => {
    setCollapsed(next)
    window.audii.mini.setCollapsed(next)
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className={`bubble${state?.playing ? ' is-playing' : ''}`}
        title="Déplier le mini-lecteur"
        onClick={() => collapse(false)}
        onDoubleClick={() => window.audii.mini.restoreMain()}
      >
        {state?.cover ? (
          <Cover src={state.cover} name={state.title} size={52} radius={26} />
        ) : (
          <Logo size={30} />
        )}
        <span className="bubble-ring" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="mini">
      <button
        type="button"
        className="mini-art"
        title="Revenir à Audii"
        onClick={() => window.audii.mini.restoreMain()}
      >
        {state?.cover ? (
          <Cover src={state.cover} name={state.title} size={52} radius={9} />
        ) : (
          <Logo size={40} />
        )}
        <span className="mini-art-open">
          <IconExpand size={15} />
        </span>
      </button>

      <div className="mini-body">
        <div className="mini-text">
          <span className="mini-title">{state?.title ?? 'Audii'}</span>
          <span className="mini-artist">
            {state?.artist ?? 'Rien en lecture'}
            {state?.bpm ? <em> · {state.bpm} BPM</em> : null}
          </span>
        </div>

        <div className="mini-bar" aria-hidden="true">
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="mini-row">
          <span className="mini-time">
            {formatTime(state?.position ?? 0)} / {formatTime(state?.duration ?? 0)}
          </span>
          <div className="mini-controls">
            <button type="button" title="Précédent" onClick={() => window.audii.mini.send('previous')}>
              <IconPrev size={15} />
            </button>
            <button
              type="button"
              className="mini-play"
              title={state?.playing ? 'Pause' : 'Lire'}
              onClick={() => window.audii.mini.send('toggle')}
            >
              {state?.playing ? <IconPause size={13} /> : <IconPlay size={13} />}
            </button>
            <button type="button" title="Suivant" onClick={() => window.audii.mini.send('next')}>
              <IconNext size={15} />
            </button>
          </div>
        </div>
      </div>

      <button type="button" className="mini-collapse" title="Réduire en pastille" onClick={() => collapse(true)}>
        <IconChevronDown size={14} />
      </button>
    </div>
  )
}

const container = document.getElementById('mini')
if (!container) throw new Error('#mini introuvable')

createRoot(container).render(
  <StrictMode>
    <Mini />
  </StrictMode>
)
