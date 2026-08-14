import { useAudii, useEngine } from '@/state/AudiiProvider'
import { energyLabel, energyToFactor, trackBpm } from '@/audio/vibe'
import { IconClose, IconFolder, IconLock, IconMic, IconWave } from './Icons'

/** « C:\Users\moi\Music\Rock » -> « …\Music\Rock » (l'info utile est à droite). */
function shortenPath(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return value
  const separator = value.includes('\\') ? '\\' : '/'
  return `…${separator}${parts.slice(-2).join(separator)}`
}

function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  )
}

export function VibePanel(): React.JSX.Element | null {
  const {
    vibeOpen,
    setVibeOpen,
    settings,
    update,
    current,
    tapBpm,
    tap,
    resetTap,
    library,
    addFolder,
    removeFolder,
    rescan,
    scan
  } = useAudii()
  const { ambient, dim } = useEngine()

  if (!vibeOpen) return null

  const currentBpm = current ? trackBpm(current) : null
  const reference = tapBpm ?? currentBpm
  const target = reference ? Math.round(reference * energyToFactor(settings.energy)) : null

  return (
    <>
      <div className="vibe-scrim" onClick={() => setVibeOpen(false)} />
      <section className="vibe-panel" aria-label="Moteur Audii">
        <header className="vibe-head">
          <div>
            <h2>Moteur Audii</h2>
            <p>Le bon tempo, au bon moment.</p>
          </div>
          <button type="button" className="icon-ghost sm" title="Fermer" onClick={() => setVibeOpen(false)}>
            <IconClose size={16} />
          </button>
        </header>

        <div className="vibe-tempo">
          <div className="vibe-tempo-main">
            <span className="vibe-bpm">{reference ?? '—'}</span>
            <span className="vibe-bpm-unit">BPM</span>
          </div>
          <span className="vibe-tempo-source">
            {tapBpm
              ? 'Imposé par Tap-Tempo'
              : current
                ? currentBpm
                  ? current.bpmTag
                    ? 'Lu dans les tags du fichier'
                    : 'Estimé par analyse locale'
                  : 'Analyse du morceau en cours…'
                : 'Aucun morceau en lecture'}
          </span>
          {target && (
            <span className="vibe-target">
              Cible d'enchaînement&nbsp;: <strong>{target} BPM</strong>
            </span>
          )}
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconLock size={15} /> Lock-Vibe
            </span>
            <Toggle
              checked={settings.lockVibe}
              onChange={(value) => update({ lockVibe: value })}
              label="Continuum de rythme"
            />
          </div>
          <p className="vibe-hint">
            Verrouille la signature rythmique du morceau en cours et enchaîne le suivant sans rupture.
          </p>
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconWave size={15} /> Énergie
            </span>
            <span className="vibe-value">{energyLabel(settings.energy)}</span>
          </div>
          <input
            className="vibe-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.energy}
            onChange={(event) => update({ energy: Number(event.target.value) })}
            aria-label="Sélecteur d'énergie"
          />
          <div className="vibe-scale">
            <span>Rest</span>
            <span>Chill</span>
            <span>Flow</span>
            <span>Focus</span>
            <span>Hype</span>
          </div>
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">Tap-Tempo</span>
            {tapBpm && (
              <button type="button" className="vibe-reset" onClick={resetTap}>
                réinitialiser
              </button>
            )}
          </div>
          <button type="button" className="tap-pad" onClick={tap}>
            <span className="tap-pad-value">{tapBpm ? `${tapBpm} BPM` : 'Tapotez au rythme'}</span>
            <span className="tap-pad-hint">clic ou touche&nbsp;T — 3 à 4 fois</span>
          </button>
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconMic size={15} /> Noise Sense
            </span>
            <Toggle
              checked={settings.noiseSense}
              onChange={(value) => update({ noiseSense: value })}
              label="Atténuation intelligente"
            />
          </div>
          <p className="vibe-hint">
            Le micro écoute l'environnement&nbsp;: en cas de bruit fort, le volume descend à 20&nbsp;% puis remonte en
            fondu.
          </p>
          {settings.noiseSense && (
            <>
              <div className="noise-meter" aria-hidden="true">
                <div className="noise-level" style={{ width: `${Math.min(100, ambient * 100)}%` }} />
                <div className="noise-threshold" />
              </div>
              <div className="vibe-row tight">
                <span className="vibe-hint">Sensibilité</span>
                <span className={`dim-state${dim < 0.95 ? ' is-active' : ''}`}>
                  {dim < 0.95 ? `Smart Dim ${Math.round(dim * 100)} %` : 'Volume nominal'}
                </span>
              </div>
              <input
                className="vibe-slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.noiseSensitivity}
                onChange={(event) => update({ noiseSensitivity: Number(event.target.value) })}
                aria-label="Sensibilité Noise Sense"
              />
            </>
          )}
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconFolder size={15} /> Bibliothèque locale
            </span>
            <span className="vibe-value">{library.tracks.length} titres</span>
          </div>
          <ul className="folder-list">
            {settings.folders.map((folder) => (
              <li key={folder}>
                <span title={folder}>{shortenPath(folder)}</span>
                <button type="button" onClick={() => void removeFolder(folder)} title="Retirer">
                  <IconClose size={13} />
                </button>
              </li>
            ))}
            {settings.folders.length === 0 && <li className="empty">Aucun dossier suivi</li>}
          </ul>
          <div className="vibe-actions">
            <button type="button" className="btn" onClick={() => void addFolder()}>
              Ajouter un dossier
            </button>
            <button type="button" className="btn ghost" onClick={() => void rescan()}>
              Rescanner
            </button>
          </div>
          {scan && scan.phase !== 'done' && (
            <p className="vibe-hint scan">
              {scan.message} {scan.total > 0 && `— ${scan.current}/${scan.total}`}
            </p>
          )}
        </div>
      </section>
    </>
  )
}
