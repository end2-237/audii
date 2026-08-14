import { useMemo } from 'react'
import type { Track } from '@shared/types'
import { useAudii } from '@/state/AudiiProvider'
import { sortByBpm } from '@/audio/tempo'
import { trackBpm } from '@/audio/vibe'
import { formatDuration } from '@/lib/format'
import { artistName } from '@/lib/labels'
import { Cover } from './Cover'
import { IconArrowDown, IconArrowUp, IconPlay, IconWave } from './Icons'

/**
 * Playlists tempo créées automatiquement : une par tranche de 10 BPM, dans
 * l'ordre choisi par l'utilisateur (du plus rapide au plus lent ou l'inverse).
 */
export function TempoView(): React.JSX.Element {
  const { tempoPlaylists, settings, update, play, library, pendingAnalysis, analyzeAll, selectPlaylist, setView, t } =
    useAudii()

  const trackById = useMemo(() => {
    const map = new Map<string, Track>()
    for (const track of library.tracks) map.set(track.id, track)
    return map
  }, [library.tracks])

  const analyzed = library.tracks.length - pendingAnalysis
  const descending = settings.tempoSort === 'desc'

  const everything = useMemo(
    () => sortByBpm(library.tracks.filter((track) => trackBpm(track) !== null), settings.tempoSort),
    [library.tracks, settings.tempoSort]
  )

  return (
    <section className="tempo-view">
      <header className="tempo-head">
        <div>
          <h1>{t('tempo.title')}</h1>
          <p>
            {t('tempo.sorted', { count: analyzed })}
            {pendingAnalysis > 0 && <> · {t('tempo.pending', { count: pendingAnalysis })}</>}
          </p>
        </div>

        <div className="tempo-tools">
          <div className="segmented" role="group" aria-label={t('tempo.sortAria')}>
            <button
              type="button"
              className={descending ? 'is-active' : ''}
              onClick={() => update({ tempoSort: 'desc' })}
            >
              <IconArrowDown size={13} /> {t('tempo.fastToSlow')}
            </button>
            <button
              type="button"
              className={!descending ? 'is-active' : ''}
              onClick={() => update({ tempoSort: 'asc' })}
            >
              <IconArrowUp size={13} /> {t('tempo.slowToFast')}
            </button>
          </div>
          {pendingAnalysis > 0 && (
            <button type="button" className="btn sm" onClick={analyzeAll}>
              {t('tempo.analyzeN', { count: pendingAnalysis })}
            </button>
          )}
        </div>
      </header>

      {tempoPlaylists.length === 0 ? (
        <div className="tempo-empty">
          <IconWave size={30} />
          <h2>{t('tempo.emptyTitle')}</h2>
          <p>{t('tempo.emptyText')}</p>
          <button type="button" className="btn primary" onClick={analyzeAll} disabled={library.tracks.length === 0}>
            {t('tempo.emptyCta')}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="tempo-all"
            onClick={() => everything.length > 0 && play(everything[0], everything)}
          >
            <span className="tempo-all-icon">
              <IconPlay size={16} />
            </span>
            <span>
              <strong>{t('tempo.allTitle')}</strong>
              <em>
                {t(descending ? 'tempo.allSubDesc' : 'tempo.allSubAsc', {
                  tracks: t('tempo.tracks', { count: everything.length })
                })}
              </em>
            </span>
          </button>

          <div className="tempo-grid">
            {tempoPlaylists.map((playlist) => {
              const tracks = playlist.trackIds
                .map((id) => trackById.get(id))
                .filter((track): track is Track => Boolean(track))
              return (
                <article key={playlist.id} className="tempo-card">
                  <header>
                    <span className="tempo-badge">{playlist.zone}</span>
                    <h3>{playlist.name}</h3>
                    <p>
                      {t('tempo.cardMeta', {
                        tracks: t('tempo.tracks', { count: tracks.length }),
                        duration: formatDuration(playlist.duration),
                        bpm: playlist.averageBpm
                      })}
                    </p>
                    <button
                      type="button"
                      className="tempo-play"
                      title={t('tempo.playBand')}
                      onClick={() => tracks.length > 0 && play(tracks[0], tracks)}
                    >
                      <IconPlay size={15} />
                    </button>
                  </header>

                  <ul>
                    {tracks.slice(0, 4).map((track) => (
                      <li key={track.id}>
                        <button type="button" onClick={() => play(track, tracks)}>
                          <Cover src={track.cover} name={track.album || track.title} size={26} radius={4} />
                          <span className="tempo-track">
                            <span>{track.title}</span>
                            <em>{artistName(track, t)}</em>
                          </span>
                          <span className="tempo-bpm">{trackBpm(track)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {tracks.length > 4 && (
                    <button
                      type="button"
                      className="tempo-more"
                      onClick={() => {
                        selectPlaylist(playlist.id)
                        setView('playlists')
                      }}
                    >
                      {t('tempo.seeAll', { count: tracks.length })}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
