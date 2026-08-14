import { useAudii, useEngine } from '@/state/AudiiProvider'
import { trackBpm } from '@/audio/vibe'
import { formatTime } from '@/lib/format'
import { artistName } from '@/lib/labels'
import { Cover } from './Cover'
import { ContinueRhythm } from './ContinueRhythm'
import { IconHeart, IconFolder, IconPause, IconPlay } from './Icons'

/** Page du morceau : grande pochette, informations, et la suite proposée. */
export function NowPlaying(): React.JSX.Element {
  const { current, settings, toggleFavorite, toggle, reveal, setView, t } = useAudii()
  const { playing, currentTime, duration } = useEngine()

  if (!current) {
    return (
      <section className="now-empty">
        <h1>{t('now.emptyTitle')}</h1>
        <p>{t('now.emptyText')}</p>
        <button type="button" className="btn primary" onClick={() => setView('playlists')}>
          {t('now.emptyCta')}
        </button>
      </section>
    )
  }

  const bpm = trackBpm(current)
  const liked = settings.favorites.includes(current.id)
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <section className="now">
      {current.cover && (
        <div className="now-bg" style={{ backgroundImage: `url("${current.cover}")` }} aria-hidden="true" />
      )}
      <div className="now-veil" aria-hidden="true" />

      <div className="now-inner">
        <header className="now-head">
          <Cover src={current.cover} name={current.album || current.title} size={188} radius={12} className="now-art" />

          <div className="now-meta">
            <span className="now-kicker">{t('now.kicker')}</span>
            <h1 title={current.title}>{current.title}</h1>
            <p className="now-artist">
              {artistName(current, t)}
              {current.album && <> — {current.album}</>}
              {current.year ? <> · {current.year}</> : null}
            </p>

            <div className="now-stats">
              <span className="now-stat">
                <strong>{bpm ?? '—'}</strong>
                <em>{t(bpm && current.bpmTag ? 'now.bpmTag' : bpm ? 'now.bpmAnalyzed' : 'now.bpm')}</em>
              </span>
              <span className="now-stat">
                <strong>{current.energy !== null ? `${Math.round(current.energy * 100)}%` : '—'}</strong>
                <em>{t('now.energy')}</em>
              </span>
              <span className="now-stat">
                <strong>{formatTime(duration || current.duration)}</strong>
                <em>{t('now.duration')}</em>
              </span>
              {current.genre && (
                <span className="now-stat">
                  <strong>{current.genre}</strong>
                  <em>{t('now.genre')}</em>
                </span>
              )}
            </div>

            <div className="now-progress" aria-hidden="true">
              <div style={{ width: `${progress}%` }} />
            </div>
            <span className="now-elapsed">
              {formatTime(currentTime)} / {formatTime(duration || current.duration)}
            </span>

            <div className="now-actions">
              <button type="button" className="btn primary" onClick={toggle}>
                {playing ? <IconPause size={15} /> : <IconPlay size={15} />}
                {t(playing ? 'player.pause' : 'player.play')}
              </button>
              <button
                type="button"
                className={`btn ghost${liked ? ' is-liked' : ''}`}
                onClick={() => toggleFavorite(current.id)}
              >
                <IconHeart size={15} filled={liked} />
                {t(liked ? 'now.inFavorites' : 'now.addFavorite')}
              </button>
              <button type="button" className="btn ghost" onClick={() => reveal(current)} title={current.path}>
                <IconFolder size={15} />
                {t('now.showFile')}
              </button>
            </div>
          </div>
        </header>

        <ContinueRhythm />
      </div>
    </section>
  )
}
