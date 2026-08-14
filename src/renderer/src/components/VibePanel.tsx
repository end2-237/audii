import { LANGUAGES, LANGUAGE_LABELS } from '@shared/i18n'
import { useAudii, useEngine } from '@/state/AudiiProvider'
import { energyLabel, energyToFactor, trackBpm } from '@/audio/vibe'
import { IconClose, IconFolder, IconLock, IconMic, IconSparkle, IconSun, IconUser, IconWave } from './Icons'

/** « C:\\Users\\moi\\Music\\Rock » -> « …\\Music\\Rock » (l'info utile est à droite). */
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
    scan,
    t
  } = useAudii()
  const { ambient, dim } = useEngine()

  if (!vibeOpen) return null

  const currentBpm = current ? trackBpm(current) : null
  const reference = tapBpm ?? currentBpm
  const target = reference ? Math.round(reference * energyToFactor(settings.energy)) : null

  const source = tapBpm
    ? 'vibe.sourceTap'
    : current
      ? currentBpm
        ? current.bpmTag
          ? 'vibe.sourceTag'
          : 'vibe.sourceAnalyzed'
        : 'vibe.analyzing'
      : 'vibe.noTrack'

  return (
    <>
      <div className="vibe-scrim" onClick={() => setVibeOpen(false)} />
      <section className="vibe-panel" aria-label={t('vibe.title')}>
        <header className="vibe-head">
          <div>
            <h2>{t('vibe.title')}</h2>
            <p>{t('vibe.subtitle')}</p>
          </div>
          <button type="button" className="icon-ghost sm" title={t('vibe.close')} onClick={() => setVibeOpen(false)}>
            <IconClose size={16} />
          </button>
        </header>

        <div className="vibe-tempo">
          <div className="vibe-tempo-main">
            <span className="vibe-bpm">{reference ?? '—'}</span>
            <span className="vibe-bpm-unit">BPM</span>
          </div>
          <span className="vibe-tempo-source">{t(source)}</span>
          {target && (
            <span className="vibe-target">
              {t('vibe.target')} <strong>{target} BPM</strong>
            </span>
          )}
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconLock size={15} /> {t('vibe.lockVibe')}
            </span>
            <Toggle
              checked={settings.lockVibe}
              onChange={(value) => update({ lockVibe: value })}
              label={t('vibe.lockVibeAria')}
            />
          </div>
          <p className="vibe-hint">{t('vibe.lockVibeHint')}</p>
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconSparkleDot /> {t('vibe.styleLock')}
            </span>
            <Toggle
              checked={settings.styleLock}
              onChange={(value) => update({ styleLock: value })}
              label={t('vibe.styleLock')}
            />
          </div>
          <p className="vibe-hint">{t('vibe.styleLockHint')}</p>
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconSparkle size={15} /> {t('vibe.whisper')}
            </span>
            <Toggle
              checked={settings.aiWhisper}
              onChange={(value) => update({ aiWhisper: value })}
              label={t('vibe.whisper')}
            />
          </div>
          <p className="vibe-hint">{t('vibe.whisperHint')}</p>
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconWave size={15} /> {t('vibe.energy')}
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
            aria-label={t('vibe.energyAria')}
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
            <span className="vibe-label">{t('vibe.tapTempo')}</span>
            {tapBpm && (
              <button type="button" className="vibe-reset" onClick={resetTap}>
                {t('vibe.reset')}
              </button>
            )}
          </div>
          <button type="button" className="tap-pad" onClick={tap}>
            <span className="tap-pad-value">{tapBpm ? `${tapBpm} BPM` : t('vibe.tapPrompt')}</span>
            <span className="tap-pad-hint">{t('vibe.tapHint')}</span>
          </button>
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconMic size={15} /> {t('vibe.noiseSense')}
            </span>
            <Toggle
              checked={settings.noiseSense}
              onChange={(value) => update({ noiseSense: value })}
              label={t('vibe.noiseAria')}
            />
          </div>
          <p className="vibe-hint">{t('vibe.noiseHint')}</p>
          {settings.noiseSense && (
            <>
              <div className="noise-meter" aria-hidden="true">
                <div className="noise-level" style={{ width: `${Math.min(100, ambient * 100)}%` }} />
                <div className="noise-threshold" />
              </div>
              <div className="vibe-row tight">
                <span className="vibe-hint">{t('vibe.sensitivity')}</span>
                <span className={`dim-state${dim < 0.95 ? ' is-active' : ''}`}>
                  {dim < 0.95 ? t('vibe.smartDim', { percent: Math.round(dim * 100) }) : t('vibe.nominal')}
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
                aria-label={t('vibe.sensitivityAria')}
              />
            </>
          )}
        </div>

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconSun size={15} /> {t('vibe.appearance')}
            </span>
          </div>
          <div className="segmented" role="group" aria-label={t('vibe.appearance')}>
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={settings.theme === mode ? 'is-active' : ''}
                onClick={() => update({ theme: mode })}
              >
                {t(`theme.${mode}`)}
              </button>
            ))}
          </div>

          <div className="vibe-row">
            <span className="vibe-label">{t('vibe.language')}</span>
          </div>
          <div className="segmented" role="group" aria-label={t('vibe.language')}>
            {LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                data-lang={code}
                className={settings.language === code ? 'is-active' : ''}
                onClick={() => update({ language: code })}
              >
                {LANGUAGE_LABELS[code]}
              </button>
            ))}
          </div>
        </div>

        {settings.profile && (
          <div className="vibe-block">
            <div className="vibe-row">
              <span className="vibe-label">
                <IconUser size={15} /> {t('vibe.profile')}
              </span>
              <button type="button" className="vibe-reset" onClick={() => update({ profile: null })}>
                {t('vibe.change')}
              </button>
            </div>
            <div className="profile-row">
              <span className="profile-avatar" style={{ '--hue': settings.profile.hue } as React.CSSProperties}>
                {settings.profile.name.charAt(0).toUpperCase()}
              </span>
              <span className="profile-meta">
                <strong>{settings.profile.name}</strong>
                <em>{settings.profile.email || t('vibe.localProfile')}</em>
              </span>
            </div>
          </div>
        )}

        <div className="vibe-block">
          <div className="vibe-row">
            <span className="vibe-label">
              <IconFolder size={15} /> {t('vibe.library')}
            </span>
            <span className="vibe-value">{t('vibe.trackCount', { count: library.tracks.length })}</span>
          </div>
          <ul className="folder-list">
            {settings.folders.map((folder) => (
              <li key={folder}>
                <span title={folder}>{shortenPath(folder)}</span>
                <button type="button" onClick={() => void removeFolder(folder)} title={t('vibe.removeFolder')}>
                  <IconClose size={13} />
                </button>
              </li>
            ))}
            {settings.folders.length === 0 && <li className="empty">{t('vibe.noFolder')}</li>}
          </ul>
          <div className="vibe-actions">
            <button type="button" className="btn" onClick={() => void addFolder()}>
              {t('vibe.addFolder')}
            </button>
            <button type="button" className="btn ghost" onClick={() => void rescan()}>
              {t('vibe.rescan')}
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

/** Petite pastille de style, utilisée comme puce du réglage « rester dans le style ». */
function IconSparkleDot(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="15" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12.2 15V6.6l6-1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
